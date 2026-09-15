/**
 * Reference rot at store level: what a delete has to take with it, and what it
 * must leave alone.
 *
 * Three deletes in this app remove something other records point at. Deleting a
 * Story Bible item has to take its sheet, the images that sheet referenced, and
 * every mention record naming it. Deleting a binder node has to take the
 * comment bodies anchored in its documents, their mention records, and the
 * document link on any submission that was sent from one of them. Timeline
 * pruning is the opposite obligation: it is the one path allowed to remove a
 * dead reference, and it must remove nothing else.
 *
 * What makes this worth a suite of its own is that none of the three cascades
 * lives in the store that owns the data. `binderStore.deleteNode` returns the
 * document ids and deliberately imports none of the stores that hold records
 * about them; `storyBibleStore.deleteItem` takes the sheet and the images but
 * not the mentions. `src/main/index.ts` composes the rest. So a store can be
 * perfectly correct on its own and the cascade still be missing a limb, and the
 * only thing that notices is a writer finding a comment on a chapter that no
 * longer exists.
 *
 * The first section therefore reads the four handler bodies out of
 * `src/main/index.ts` and compares the store calls in them against the
 * composition the sections below perform — index.ts itself cannot be imported
 * (it registers IPC handlers and reaches app.whenReady at load), so the
 * composition is restated here, and that restatement going stale has to arrive
 * as a failure rather than as a suite quietly testing something the app no
 * longer does.
 *
 * Node-hosted, through the `electron` shim in `tests/electronForNode.ts`: none
 * of these stores opens a window, and the only thing that reached Electron was
 * `projectRoot` computing its default from `app.getPath` at module load. Opens
 * no window, asserts no timing, and works inside a temp directory it removes at
 * the end, so it runs on a cloud runner.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { setProjectWriteObserver } from '../src/main/atomicWrite'
import { setProjectRoot } from '../src/main/projectRoot'
import * as binderStore from '../src/main/binderStore'
import { saveDocument } from '../src/main/documentStore'
import * as storyBibleStore from '../src/main/storyBibleStore'
import { getSheet, saveSheet } from '../src/main/storyBibleSheetStore'
import * as mentionStore from '../src/main/mentionStore'
import * as commentStore from '../src/main/commentStore'
import * as submissionStore from '../src/main/submissionStore'
import * as timelineStore from '../src/main/timelineStore'
import * as relationshipStore from '../src/main/relationshipStore'
import * as suppressedWordStore from '../src/main/suppressedWordStore'
import * as searchIndex from '../src/main/searchIndex'
import { DRAFT_FOLDER_ID, TRASH_FOLDER_ID } from '../src/shared/binder'
import { countBrokenLinks, findBrokenLinks } from '../src/shared/timeline'
import type { StoryBibleBlock } from '../src/shared/storyBible'
import { assert, createReport, note, section, summarize, type TestReport } from './harness'

const read = (path: string): Promise<string> => readFile(path, 'utf-8')

// ---- the cascades, as index.ts composes them ------------------------------
//
// Restated rather than imported. Section one checks the restatement against
// the source, so the two cannot drift apart silently.

/** `storyBible:deleteItem`, minus the confirmation dialog and backupStore. */
async function deleteItemCascade(itemId: string): Promise<void> {
  await storyBibleStore.deleteItem(itemId)
  await mentionStore.deleteAllForItem(itemId)
}

/** `binder:delete`, minus backupStore. Returns the deleted document ids. */
async function deleteNodeCascade(nodeId: string): Promise<string[]> {
  const documentIds = await binderStore.deleteNode(nodeId)
  await Promise.all(documentIds.map((id) => mentionStore.deleteAllForDocument(id)))
  await Promise.all(documentIds.map((id) => commentStore.deleteAllForDocument(id)))
  await Promise.all(documentIds.map((id) => submissionStore.handleDocumentDeleted(id)))
  return documentIds
}

/** `binder:emptyTrash`, minus backupStore. */
async function emptyTrashCascade(): Promise<string[]> {
  const documentIds = await binderStore.emptyTrash()
  await Promise.all(documentIds.map((id) => mentionStore.deleteAllForDocument(id)))
  await Promise.all(documentIds.map((id) => commentStore.deleteAllForDocument(id)))
  await Promise.all(documentIds.map((id) => submissionStore.handleDocumentDeleted(id)))
  return documentIds
}

/** `timeline:pruneReferences`, minus backupStore. */
async function pruneCascade(): Promise<number> {
  const [{ items }, documentIds] = await Promise.all([
    storyBibleStore.getState(),
    binderStore.getAllDocumentIds()
  ])
  const itemIds = items.map((item) => item.id)
  const [links, relationships] = await Promise.all([
    timelineStore.pruneReferences(itemIds, documentIds),
    relationshipStore.pruneBrokenRelationships(itemIds)
  ])
  return links + relationships
}

// ---- small helpers --------------------------------------------------------

/** A temp project root, with every cached store pointed at it and cleared. */
async function freshProject(parent: string, prefix: string): Promise<string> {
  const root = await mkdtemp(join(parent, `${prefix}-`))
  setProjectRoot(root)
  binderStore.invalidateCache()
  storyBibleStore.invalidateCache()
  return root
}

/** The body of one `ipcMain.handle('<channel>', …)` registration, as source
 *  text. Brace-counted from the opening parenthesis, so a handler containing
 *  its own braces, strings or comments comes back whole. */
function handlerBody(source: string, channel: string): string | null {
  const marker = source.indexOf(`ipcMain.handle('${channel}'`)
  if (marker === -1) return null
  let depth = 0
  for (let i = source.indexOf('(', marker); i < source.length; i += 1) {
    const char = source[i]
    if (char === '(') depth += 1
    else if (char === ')') {
      depth -= 1
      if (depth === 0) return source.slice(marker, i + 1)
    }
  }
  return null
}

/** Every `someStore.someFunction(` call in a piece of source, deduped and
 *  sorted — the shape of a cascade, independent of formatting or order. */
function storeCallsIn(source: string): string[] {
  const found = new Set<string>()
  const pattern = /\b([A-Za-z]+Store)\.([A-Za-z][A-Za-z0-9]*)\s*\(/g
  let match = pattern.exec(source)
  while (match) {
    found.add(`${match[1]}.${match[2]}`)
    match = pattern.exec(source)
  }
  return [...found].sort()
}

const same = (a: string[], b: string[]): boolean => a.length === b.length && a.every((v, i) => v === b[i])

function textBlock(id: string, label: string, html: string): StoryBibleBlock {
  return { id, kind: 'text', label, html }
}

function imageBlock(id: string, label: string, imageId: string | null): StoryBibleBlock {
  return { id, kind: 'image', label, imageId, caption: '' }
}

/** A real file under storybible/images/, so its removal is a fact on disk
 *  rather than a record saying it went. */
async function plantImage(root: string, imageId: string): Promise<string> {
  const dir = join(root, 'storybible', 'images')
  await mkdir(dir, { recursive: true })
  const path = join(dir, imageId)
  await writeFile(path, `not really a png: ${imageId}`)
  return path
}

async function mentionsFor(): Promise<mentionStore.MentionRecord[]> {
  return mentionStore.listMentions()
}

const byItem = (records: mentionStore.MentionRecord[], itemId: string): mentionStore.MentionRecord[] =>
  records.filter((m) => m.itemId === itemId)

const byDocument = (records: mentionStore.MentionRecord[], documentId: string): mentionStore.MentionRecord[] =>
  records.filter((m) => m.documentId === documentId)

// ---- section one: the cascade index.ts composes ---------------------------

async function handlerComposition(report: TestReport): Promise<void> {
  section(report, 'the cascade index.ts composes')

  const source = await read(join(process.cwd(), 'src', 'main', 'index.ts'))

  const cases: Array<{ channel: string; expected: string[] }> = [
    {
      channel: 'binder:delete',
      expected: [
        'backupStore.markDirty',
        'binderStore.deleteNode',
        'binderStore.getNode',
        'commentStore.deleteAllForDocument',
        'mentionStore.deleteAllForDocument',
        'submissionStore.handleDocumentDeleted'
      ]
    },
    {
      channel: 'binder:emptyTrash',
      expected: [
        'backupStore.markDirty',
        'binderStore.emptyTrash',
        'commentStore.deleteAllForDocument',
        'mentionStore.deleteAllForDocument',
        'submissionStore.handleDocumentDeleted'
      ]
    },
    {
      channel: 'storyBible:deleteItem',
      expected: [
        'backupStore.markDirty',
        'mentionStore.deleteAllForItem',
        'storyBibleStore.deleteItem',
        'storyBibleStore.getItem'
      ]
    },
    {
      channel: 'timeline:pruneReferences',
      expected: [
        'backupStore.markDirty',
        'binderStore.getAllDocumentIds',
        'relationshipStore.pruneBrokenRelationships',
        'storyBibleStore.getState',
        'timelineStore.pruneReferences'
      ]
    }
  ]

  for (const { channel, expected } of cases) {
    const body = handlerBody(source, channel)
    // The control: a renamed or restructured handler must not pass by the
    // extractor quietly finding nothing to disagree with.
    assert(report, !!body && body.length > 40, `${channel}: the handler was found in index.ts`)
    const actual = body ? storeCallsIn(body) : []
    assert(report, same(actual, expected), `${channel}: cascades through exactly ${expected.length} store calls`)
    if (body && !same(actual, expected)) note(report, `${channel}: ${actual.join(', ')}`)
  }
}

// ---- section two: a Story Bible item delete -------------------------------

async function itemDelete(report: TestReport, parent: string): Promise<void> {
  section(report, 'a Story Bible item delete takes its sheet, its images and its mentions')

  const root = await freshProject(parent, 'item-delete')
  const chapter = await binderStore.createDocument(DRAFT_FOLDER_ID, 'Low Water')
  const other = await binderStore.createDocument(DRAFT_FOLDER_ID, 'The Tide')

  const ottiline = await storyBibleStore.createItem('sb-character', 'Ottiline')
  await storyBibleStore.setItemAliases(ottiline.id, ['Otti'])
  const marrowgate = await storyBibleStore.createItem('sb-location', 'Marrowgate')
  const unsheeted = await storyBibleStore.createItem('sb-object', 'Brass Key')

  const ottilineImageA = await plantImage(root, 'ottiline-a.png')
  const ottilineImageB = await plantImage(root, 'ottiline-b.png')
  const marrowgateImage = await plantImage(root, 'marrowgate.png')

  await saveSheet(ottiline.id, [
    textBlock('b1', 'Appearance', '<p>Salt-bleached coat.</p>'),
    imageBlock('b2', 'Portrait', 'ottiline-a.png'),
    imageBlock('b3', 'Study', 'ottiline-b.png'),
    imageBlock('b4', 'Empty', null)
  ])
  await saveSheet(marrowgate.id, [imageBlock('b5', 'Map', 'marrowgate.png')])

  await saveDocument(chapter.id, '<h1>Low Water</h1><p>The tide returned. Ottiline waited at Marrowgate.</p>')
  await saveDocument(other.id, '<h1>The Tide</h1><p>Marrowgate opened its gate.</p>')
  await mentionStore.rebuildAutoForDocument(chapter.id, '<h1>Low Water</h1><p>The tide returned. Ottiline waited at Marrowgate.</p>')
  await mentionStore.rebuildAutoForDocument(other.id, '<h1>The Tide</h1><p>Marrowgate opened its gate.</p>')
  await mentionStore.setManualMention(other.id, ottiline.id, true)
  await mentionStore.setManualMention(chapter.id, unsheeted.id, true)

  const sheetPath = (id: string): string => join(root, 'storybible', 'sheets', `${id}.json`)

  // The controls. Every removal asserted below has to have had something to
  // remove, or the section passes on an empty project.
  const before = await mentionsFor()
  assert(report, existsSync(sheetPath(ottiline.id)), 'before: the item has a sheet on disk')
  assert(report, existsSync(ottilineImageA) && existsSync(ottilineImageB), 'before: both of its images are on disk')
  assert(report, byItem(before, ottiline.id).length === 2, 'before: it has two mention records, one auto and one manual')
  assert(
    report,
    byItem(before, ottiline.id).some((m) => m.source === 'auto') &&
      byItem(before, ottiline.id).some((m) => m.source === 'manual'),
    'before: the two records are one of each source'
  )

  const marrowgateBefore = JSON.stringify(byItem(before, marrowgate.id))
  const suppressedBefore = await suppressedWordStore.listWords()
  assert(report, suppressedBefore.includes('ottiline') || suppressedBefore.includes('Ottiline'), 'before: its name is claimed in the suppression list')

  await deleteItemCascade(ottiline.id)

  const after = await mentionsFor()
  const items = (await storyBibleStore.getState()).items

  assert(report, !items.some((i) => i.id === ottiline.id), 'the item is gone from the index')
  assert(report, !existsSync(sheetPath(ottiline.id)), 'its sheet file is gone')
  assert(report, !existsSync(ottilineImageA), 'the image its first image block referenced is gone')
  assert(report, !existsSync(ottilineImageB), 'the image its second image block referenced is gone')
  assert(report, byItem(after, ottiline.id).length === 0, 'no mention record names it')
  assert(
    report,
    !after.some((m) => m.itemId === ottiline.id && m.source === 'manual'),
    'its manual mention went with the automatic ones'
  )

  // The other side: a delete that over-reaches is as bad as one that misses.
  assert(report, items.some((i) => i.id === marrowgate.id), 'the neighbouring item is still in the index')
  assert(report, existsSync(sheetPath(marrowgate.id)), "the neighbouring item's sheet is untouched")
  assert(report, existsSync(marrowgateImage), "the neighbouring item's image is untouched")
  assert(report, JSON.stringify(byItem(after, marrowgate.id)) === marrowgateBefore, "the neighbouring item's mention records are unchanged")
  assert(report, byDocument(after, chapter.id).length > 0, 'the documents that mentioned it still have their own records')
  assert(report, (await getSheet(marrowgate.id)).blocks.length === 1, "the neighbouring item's sheet still loads with its block")

  const suppressedAfter = await suppressedWordStore.listWords()
  assert(report, !suppressedAfter.includes('ottiline'), 'its name is no longer claimed in the suppression list')
  assert(report, !suppressedAfter.includes('otti'), 'nor is its alias')
  assert(report, suppressedAfter.includes('marrowgate'), "the neighbouring item's name is still claimed")

  // An item that never had a sheet, and an id that was never an item.
  const indexBytes = await read(join(root, 'storybible', 'index.json'))
  const mentionBytes = await read(join(root, 'mentions.json'))
  await deleteItemCascade('not-an-item-at-all')
  assert(report, (await read(join(root, 'storybible', 'index.json'))) === indexBytes, 'deleting an unknown id leaves the index byte-identical')
  assert(report, (await read(join(root, 'mentions.json'))) === mentionBytes, 'deleting an unknown id leaves the mention file byte-identical')

  await deleteItemCascade(unsheeted.id)
  const afterUnsheeted = await mentionsFor()
  assert(report, !(await storyBibleStore.getState()).items.some((i) => i.id === unsheeted.id), 'an item that never had a sheet deletes cleanly')
  assert(report, byItem(afterUnsheeted, unsheeted.id).length === 0, 'and its manual mention goes with it')
}

// ---- section three: what a deleted sheet leaves in the search index -------

async function itemDeleteAndSearch(report: TestReport, parent: string): Promise<void> {
  section(report, "a deleted item's sheet text stops being searchable")

  const root = await freshProject(parent, 'item-search')
  searchIndex.install()
  try {
    const doomed = await storyBibleStore.createItem('sb-character', 'Ottiline')
    const keeper = await storyBibleStore.createItem('sb-character', 'Marrowgate')
    // A word that exists nowhere else in the project, so a hit for it can only
    // have come from this sheet.
    await saveSheet(doomed.id, [textBlock('b1', 'Appearance', '<p>Her coat is salt-bleached and quenchless.</p>')])
    await saveSheet(keeper.id, [textBlock('b1', 'Appearance', '<p>The gate is tidebound.</p>')])
    await searchIndex.open()
    await searchIndex.settled()

    const hitsFor = (word: string): number => searchIndex.query(word).length
    assert(report, hitsFor('quenchless') === 1, "before: the item's sheet text is searchable")
    assert(report, hitsFor('tidebound') === 1, "before: the other item's sheet text is searchable")

    await deleteItemCascade(doomed.id)
    await searchIndex.settled()

    assert(report, !existsSync(join(root, 'storybible', 'sheets', `${doomed.id}.json`)), 'the sheet file itself is gone')
    assert(report, hitsFor('quenchless') === 0, "the deleted item's sheet text is no longer searchable")
    assert(report, hitsFor('Ottiline') === 0, 'and neither is its name')
    assert(report, hitsFor('tidebound') === 1, "the surviving item's sheet text is still searchable")
    assert(report, hitsFor('Marrowgate') === 1, 'and so is its name')

    // Reopening the project rebuilds from the files that are actually there,
    // so this says whether the staleness is a session-long fact or a permanent
    // one. It is asserted separately from the line above precisely so the two
    // cannot be confused when one fails and the other does not.
    await searchIndex.open()
    await searchIndex.settled()
    assert(report, hitsFor('quenchless') === 0, 'and it is still gone after the index is reopened')
  } finally {
    setProjectWriteObserver(null)
  }
}

// ---- section four: a document delete --------------------------------------

async function documentDelete(report: TestReport, parent: string): Promise<void> {
  section(report, 'a document delete clears comments, mentions and submission links')

  const root = await freshProject(parent, 'doc-delete')
  const part = await binderStore.createFolder(DRAFT_FOLDER_ID, 'Part One')
  const doomedA = await binderStore.createDocument(part.id, 'Chapter One')
  const doomedB = await binderStore.createDocument(part.id, 'Chapter Two')
  const keeper = await binderStore.createDocument(DRAFT_FOLDER_ID, 'Chapter Three')

  const item = await storyBibleStore.createItem('sb-character', 'Ottiline')

  for (const [node, word] of [[doomedA, 'first'], [doomedB, 'second'], [keeper, 'third']] as const) {
    const html = `<h1>${node.name}</h1><p>The ${word} tide. Ottiline waited.</p>`
    await saveDocument(node.id, html)
    await mentionStore.rebuildAutoForDocument(node.id, html)
    await mentionStore.setManualMention(node.id, item.id, true)
    await commentStore.addComment({
      id: `comment-${word}`,
      documentId: node.id,
      body: `A note on the ${word} chapter.`,
      createdAt: 1700000000000,
      snippet: `The ${word} tide.`,
      resolved: false
    })
  }

  const sentFromDoomed = await submissionStore.createSubmission({
    recipient: 'Cormorant Literary',
    dateSent: '2026-03-02',
    statusId: 'sub-sent',
    notes: 'Full manuscript.',
    documentId: doomedA.id,
    snapshotId: 'snapshot-one',
    documentNameAtSend: 'Chapter One'
  })
  const sentFromKeeper = await submissionStore.createSubmission({
    recipient: 'Harrow & Vale',
    dateSent: '2026-03-09',
    statusId: 'sub-sent',
    notes: 'Sample.',
    documentId: keeper.id,
    snapshotId: 'snapshot-two',
    documentNameAtSend: 'Chapter Three'
  })
  const sentFromNothing = await submissionStore.createSubmission({
    recipient: 'Query only',
    dateSent: '2026-03-10',
    statusId: 'sub-sent',
    notes: '',
    documentId: null,
    snapshotId: null,
    documentNameAtSend: null
  })

  // Controls, before anything is deleted.
  const commentsBefore = await commentStore.listComments()
  const mentionsBefore = await mentionsFor()
  assert(report, commentsBefore.length === 3, 'before: every document has a comment')
  assert(report, byDocument(mentionsBefore, doomedA.id).length === 2, 'before: the first document has an auto and a manual mention')
  assert(report, mentionsBefore.length === 6, 'before: six mention records across three documents')

  const keeperCommentBefore = JSON.stringify(commentsBefore.filter((c) => c.documentId === keeper.id))
  const keeperMentionsBefore = JSON.stringify(byDocument(mentionsBefore, keeper.id))
  const keeperSubmissionBefore = JSON.stringify(
    (await submissionStore.getState()).submissions.find((s) => s.id === sentFromKeeper.id)
  )
  const untiedSubmissionBefore = JSON.stringify(
    (await submissionStore.getState()).submissions.find((s) => s.id === sentFromNothing.id)
  )

  const deleted = await deleteNodeCascade(part.id)

  assert(report, deleted.length === 2 && deleted.includes(doomedA.id) && deleted.includes(doomedB.id), 'the delete returned both documents under the folder')

  const comments = await commentStore.listComments()
  const mentions = await mentionsFor()
  const submissions = (await submissionStore.getState()).submissions

  assert(report, comments.filter((c) => c.documentId === doomedA.id).length === 0, "the first deleted document's comment is gone")
  assert(report, comments.filter((c) => c.documentId === doomedB.id).length === 0, "the second deleted document's comment is gone")
  assert(report, comments.length === 1, 'exactly one comment survives')
  assert(report, JSON.stringify(comments.filter((c) => c.documentId === keeper.id)) === keeperCommentBefore, "the surviving document's comment is unchanged, body and snippet included")

  assert(report, byDocument(mentions, doomedA.id).length === 0, "the first deleted document's mention records are gone")
  assert(report, byDocument(mentions, doomedB.id).length === 0, "the second deleted document's mention records are gone")
  assert(report, !mentions.some((m) => m.source === 'manual' && (m.documentId === doomedA.id || m.documentId === doomedB.id)), 'their manual mentions went with the automatic ones')
  assert(report, JSON.stringify(byDocument(mentions, keeper.id)) === keeperMentionsBefore, "the surviving document's mention records are unchanged")

  const cleared = submissions.find((s) => s.id === sentFromDoomed.id)
  assert(report, !!cleared, 'the submission sent from a deleted document still exists')
  assert(report, cleared?.documentId === null, 'its document link is cleared')
  assert(report, cleared?.snapshotId === null, 'its snapshot link is cleared')
  assert(report, cleared?.documentNameAtSend === 'Chapter One', 'its tombstone label is kept, so the entry still reads as a record of what went out')
  assert(report, cleared?.recipient === 'Cormorant Literary' && cleared?.notes === 'Full manuscript.', 'and so are the fields the writer typed')
  assert(report, cleared?.createdAt === sentFromDoomed.createdAt, 'its creation time is untouched')

  assert(report, JSON.stringify(submissions.find((s) => s.id === sentFromKeeper.id)) === keeperSubmissionBefore, "the submission sent from the surviving document is untouched, updatedAt included")
  assert(report, JSON.stringify(submissions.find((s) => s.id === sentFromNothing.id)) === untiedSubmissionBefore, 'the submission that was never tied to a document is untouched')

  assert(report, !existsSync(join(root, 'documents', `${doomedA.id}.html`)), "the first deleted document's content file is gone")
  assert(report, existsSync(join(root, 'documents', `${keeper.id}.html`)), "the surviving document's content file is still there")

  // Emptying Trash is the same cascade over a wider set, so it gets the same
  // assertions rather than being trusted to be the same code.
  section(report, 'emptying Trash cascades the same way')
  await binderStore.moveNode(keeper.id, TRASH_FOLDER_ID, 0)
  const emptied = await emptyTrashCascade()
  assert(report, emptied.length === 1 && emptied[0] === keeper.id, 'emptying Trash returned the document that was in it')
  assert(report, (await commentStore.listComments()).length === 0, 'its comment went with it')
  assert(report, (await mentionsFor()).length === 0, 'its mention records went with it')
  const afterTrash = (await submissionStore.getState()).submissions
  assert(report, afterTrash.find((s) => s.id === sentFromKeeper.id)?.documentId === null, 'the submission sent from it lost its document link')
  assert(report, afterTrash.find((s) => s.id === sentFromKeeper.id)?.snapshotId === null, 'and its snapshot link')
  assert(report, afterTrash.length === 3, 'no submission was removed by either delete')
}

// ---- section five: timeline pruning ---------------------------------------

async function timelinePrune(report: TestReport, parent: string): Promise<void> {
  section(report, 'a delete leaves the board alone until a prune asks')

  const root = await freshProject(parent, 'prune')
  const item = await storyBibleStore.createItem('sb-character', 'Ottiline')
  const survivor = await storyBibleStore.createItem('sb-character', 'Marrowgate')
  const chapter = await binderStore.createDocument(DRAFT_FOLDER_ID, 'Low Water')

  await timelineStore.createEntry({ description: 'She arrives', whenText: 'day one', itemIds: [item.id], documentId: chapter.id })
  await relationshipStore.createRelationship({ fromId: item.id, toId: survivor.id, label: 'haunts', reverseLabel: null })

  const timelineBytes = await read(join(root, 'timeline.json'))
  const relationshipBytes = await read(join(root, 'relationships.json'))

  await deleteItemCascade(item.id)

  assert(report, (await read(join(root, 'timeline.json'))) === timelineBytes, 'deleting an item leaves timeline.json byte-identical')
  assert(report, (await read(join(root, 'relationships.json'))) === relationshipBytes, 'deleting an item leaves relationships.json byte-identical')
  assert(report, (await timelineStore.getState()).entries[0].itemIds[0] === item.id, 'the entry still carries the dead id, so a restored backup can relink it')

  section(report, 'timeline pruning drops links to deleted items and nothing else')

  const root2 = await freshProject(parent, 'prune-wide')
  const x = await storyBibleStore.createItem('sb-character', 'Ottiline')
  const y = await storyBibleStore.createItem('sb-character', 'Marrowgate')
  const live = await binderStore.createDocument(DRAFT_FOLDER_ID, 'Low Water')
  const goneItemA = 'gone-item-a'
  const goneItemB = 'gone-item-b'
  const goneDocument = 'gone-document'

  const e1 = await timelineStore.createEntry({ description: 'All links good', whenText: 'day one', itemIds: [x.id, y.id], documentId: live.id })
  const e2 = await timelineStore.createEntry({ description: 'One dead item', whenText: 'day two', itemIds: [x.id, goneItemA], documentId: live.id })
  const e3 = await timelineStore.createEntry({ description: 'Everything dead', whenText: 'day three', itemIds: [goneItemA, goneItemB], documentId: goneDocument })
  const e4 = await timelineStore.createEntry({ description: 'No links at all', whenText: '', itemIds: [], documentId: null })
  const e5 = await timelineStore.createEntry({ description: 'Dead document only', whenText: 'day five', itemIds: [y.id], documentId: goneDocument })

  const r1 = await relationshipStore.createRelationship({ fromId: x.id, toId: y.id, label: 'haunts', reverseLabel: null })
  const r2 = await relationshipStore.createRelationship({ fromId: x.id, toId: goneItemA, label: 'fears', reverseLabel: null })
  const r3 = await relationshipStore.createRelationship({ fromId: goneItemA, toId: goneItemB, label: 'owes', reverseLabel: null })

  const validItems = new Set([x.id, y.id])
  const validDocuments = new Set([live.id])
  const entriesBefore = (await timelineStore.getState()).entries
  const brokenBefore = entriesBefore.reduce((sum, entry) => sum + countBrokenLinks(findBrokenLinks(entry, validItems, validDocuments)), 0)

  // The control, and the one number this section rests on: the renderer's own
  // broken-link count and the prune have to agree about what is dead.
  assert(report, brokenBefore === 5, 'before: the board shows five broken links across five entries')
  assert(report, entriesBefore.length === 5, 'before: five entries')
  assert(report, (await relationshipStore.getState()).relationships.length === 3, 'before: three relationships')

  const updatedAtBefore = new Map(entriesBefore.map((e) => [e.id, e.updatedAt]))
  const createdAtBefore = new Map(entriesBefore.map((e) => [e.id, e.createdAt]))

  const removed = await pruneCascade()
  assert(report, removed === 7, 'the prune reports seven dead references removed: five links and two relationships')

  const entries = (await timelineStore.getState()).entries
  const find = (id: string): (typeof entries)[number] | undefined => entries.find((e) => e.id === id)

  assert(report, entries.length === 5, 'every entry survives — only the links inside them go')
  assert(report, entries.map((e) => e.id).join(',') === [e1, e2, e3, e4, e5].map((e) => e.id).join(','), 'and they survive in the same order')

  assert(report, JSON.stringify(find(e1.id)?.itemIds) === JSON.stringify([x.id, y.id]), 'an entry whose links all resolve keeps both, in order')
  assert(report, find(e1.id)?.documentId === live.id, 'and keeps its document link')
  assert(report, find(e1.id)?.updatedAt === updatedAtBefore.get(e1.id), 'and is not restamped, because nothing about it changed')

  assert(report, JSON.stringify(find(e2.id)?.itemIds) === JSON.stringify([x.id]), 'an entry with one dead item keeps the live one and loses the dead one')
  assert(report, find(e2.id)?.documentId === live.id, 'and keeps its still-valid document link')
  assert(report, find(e2.id)?.updatedAt !== updatedAtBefore.get(e2.id), 'and is restamped, because something about it did change')

  assert(report, JSON.stringify(find(e3.id)?.itemIds) === JSON.stringify([]), 'an entry with two dead items loses both')
  assert(report, find(e3.id)?.documentId === null, 'and its dead document link is nulled rather than left pointing at nothing')
  assert(report, find(e3.id)?.description === 'Everything dead', 'and keeps the description it owns')

  assert(report, JSON.stringify(find(e4.id)?.itemIds) === JSON.stringify([]), 'an entry with no links is unchanged')
  assert(report, find(e4.id)?.updatedAt === updatedAtBefore.get(e4.id), 'and is not restamped')

  assert(report, JSON.stringify(find(e5.id)?.itemIds) === JSON.stringify([y.id]), 'an entry losing only its document keeps its item links')
  assert(report, find(e5.id)?.documentId === null, 'and loses the document link')

  assert(report, entries.every((e) => e.createdAt === createdAtBefore.get(e.id)), 'no entry had its creation time rewritten')
  assert(report, entries.every((e) => typeof e.whenText === 'string'), 'every entry kept its free-text date')
  assert(report, find(e5.id)?.whenText === 'day five', 'and the one the prune touched kept its exact value')

  const relationships = (await relationshipStore.getState()).relationships
  assert(report, relationships.length === 1, 'the two relationships with a dead endpoint are gone')
  assert(report, relationships[0]?.id === r1.id, 'the one with both endpoints alive survives')
  assert(report, relationships[0]?.label === 'haunts', 'with its label intact')
  assert(report, !relationships.some((r) => r.id === r2.id || r.id === r3.id), 'neither a half-dead nor a wholly dead relationship is kept')

  // Nothing else on disk moved, and a second prune is a no-op.
  const binderBytes = await read(join(root2, 'binder.json'))
  const storyBibleBytes = await read(join(root2, 'storybible', 'index.json'))
  const timelineAfter = await read(join(root2, 'timeline.json'))
  const relationshipsAfter = await read(join(root2, 'relationships.json'))

  const removedAgain = await pruneCascade()
  assert(report, removedAgain === 0, 'a second prune finds nothing left to remove')
  assert(report, (await read(join(root2, 'timeline.json'))) === timelineAfter, 'and does not rewrite timeline.json')
  assert(report, (await read(join(root2, 'relationships.json'))) === relationshipsAfter, 'nor relationships.json')
  assert(report, (await read(join(root2, 'binder.json'))) === binderBytes, 'the prune left binder.json alone')
  assert(report, (await read(join(root2, 'storybible', 'index.json'))) === storyBibleBytes, 'and storybible/index.json')
  note(report, `prune fixture: 5 entries, 3 relationships, 7 dead references removed`)
  void root
}

// ---- running ---------------------------------------------------------------

async function run(report: TestReport): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'chapterflow-references-'))
  try {
    // Each section is wrapped on its own: a store that throws inside one must
    // not carry off the sections after it. Two suites in a row have lost most
    // of their assertions to exactly that.
    const parts: Array<[string, () => Promise<void>]> = [
      ['the handler composition', () => handlerComposition(report)],
      ['the item delete', () => itemDelete(report, parent)],
      ['the item delete and search', () => itemDeleteAndSearch(report, parent)],
      ['the document delete', () => documentDelete(report, parent)],
      ['the prune', () => timelinePrune(report, parent)]
    ]
    for (const [name, body] of parts) {
      try {
        await body()
      } catch (error) {
        section(report, name)
        assert(report, false, `${name} threw: ${String((error as Error)?.message ?? error)}`)
      }
    }
    note(report, `temp root: ${parent}`)
  } finally {
    setProjectWriteObserver(null)
    await rm(parent, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function main(): Promise<void> {
  const report = createReport()
  const outDir = process.env.OUT_DIR ?? '.'
  try {
    await run(report)
  } catch (error) {
    report.lines.push(`  FAIL  threw: ${String((error as Error)?.stack ?? error)}`)
    report.failures += 1
  }
  await writeFile(`${outDir}/report.txt`, summarize(report))
  process.exit(report.failures > 0 ? 1 : 0)
}

void main()
