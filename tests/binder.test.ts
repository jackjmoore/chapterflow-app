/**
 * Binder integration, part two: the four tree mutations that can lose data,
 * and what an old binder.json turns into when it is opened.
 *
 * `deleteNode` is the only path that removes document content, snapshots and
 * span-tag records together, so what it misses survives forever as an orphan
 * and what it over-reaches on is gone. `duplicateNode` mints fresh ids for a
 * whole subtree and copies content across to them; one shared id and the copy
 * and the original are the same file. `moveNode` splices a node out of one
 * list and into another, which is where a node can be dropped entirely or end
 * up in two places. `insertSubtree` is the importer's single-write bulk path,
 * and it validates before it mutates precisely because a half-applied tree in
 * memory would be committed by the next unrelated save. The legacy shapes at
 * the end are what `ensureStructuralFolders` and `normalizeTree` were written
 * for: a project saved by an older build has to open unchanged in identity and
 * order, and has to stop changing after it has migrated once.
 *
 * Runs in a real Electron main process because the stores reach
 * getProjectRoot, which reads app paths. No window is opened and nothing here
 * is timed, so it runs on a cloud runner under a virtual framebuffer as well
 * as on the development machine. Everything happens inside a temp directory
 * made by the test and removed at the end.
 */
import { app } from 'electron'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { setProjectWriteObserver } from '../src/main/atomicWrite'
import { setProjectRoot } from '../src/main/projectRoot'
import * as binderStore from '../src/main/binderStore'
import { loadDocument, saveDocument } from '../src/main/documentStore'
import { createSnapshot, listSnapshots } from '../src/main/snapshotStore'
import { listSpans, rebuildForDocument } from '../src/main/spanTagStore'
import {
  ARCHIVE_FOLDER_ID,
  DRAFT_FOLDER_ID,
  MATTER_FOLDER_ID,
  NOTES_FOLDER_ID,
  STRUCTURAL_FOLDERS,
  TRASH_FOLDER_ID,
  isStructuralFolderId,
  type BinderNode,
  type FolderNode
} from '../src/shared/binder'
import { assert, createReport, note, section, summarize, type TestReport } from './harness'

const read = (path: string): Promise<string> => readFile(path, 'utf-8')

// ---- small helpers --------------------------------------------------------

/** A temp project root, with the store pointed at it and its cache cleared. */
async function freshProject(parent: string, prefix: string): Promise<string> {
  const root = await mkdtemp(join(parent, `${prefix}-`))
  setProjectRoot(root)
  binderStore.invalidateCache()
  return root
}

function walk(nodes: BinderNode[], fn: (node: BinderNode, parentId: string | null) => void, parentId: string | null = null): void {
  for (const node of nodes) {
    fn(node, parentId)
    walk(node.children, fn, node.id)
  }
}

function allNodes(tree: BinderNode[]): Array<{ node: BinderNode; parentId: string | null }> {
  const out: Array<{ node: BinderNode; parentId: string | null }> = []
  walk(tree, (node, parentId) => out.push({ node, parentId }))
  return out
}

function allIds(tree: BinderNode[]): string[] {
  return allNodes(tree).map(({ node }) => node.id)
}

/** Identity, order and nesting, with nothing else in it — what a round-trip
 *  through disk has to preserve exactly. */
function shapeOf(nodes: BinderNode[]): string {
  const describe = (node: BinderNode): unknown => ({
    id: node.id,
    type: node.type,
    name: node.name,
    children: node.children.map(describe)
  })
  return JSON.stringify(nodes.map(describe))
}

/** The children of a folder, or an empty list when it is not there. Every use
 *  below goes through this: when a mutation loses a node, that has to arrive
 *  as a failed assertion rather than as a thrown error that abandons the
 *  sections after it. */
function childrenOf(tree: BinderNode[], id: string): BinderNode[] {
  const found = allNodes(tree).find(({ node }) => node.id === id)
  return found ? found.node.children : []
}

function isDescendantOf(node: BinderNode, id: string): boolean {
  for (const child of node.children) {
    if (child.id === id || isDescendantOf(child, id)) return true
  }
  return false
}

/** Deterministic PRNG. The moves below have to be the same moves on every run
 *  and on every machine, or a failure cannot be reproduced from the report. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const spanHtml = (text: string, spanId: string, tagId: string): string =>
  `<p><span data-span-id="${spanId}" data-tag-id="${tagId}">${text}</span> and the rest of it.</p>`

/** A document with real content, two snapshots and one span-tag record —
 *  everything deleteNode is supposed to take with it. */
async function seedDocument(parentId: string | null, name: string, spanId: string): Promise<string> {
  const doc = await binderStore.createDocument(parentId, name)
  const html = spanHtml(name, spanId, 'tag-theme')
  await saveDocument(doc.id, html)
  await rebuildForDocument(doc.id, html)
  await createSnapshot(doc.id, 'first pass')
  await createSnapshot(doc.id, null, true)
  return doc.id
}

const documentPath = (root: string, id: string): string => join(root, 'documents', `${id}.html`)
const snapshotDir = (root: string, id: string): string => join(root, 'snapshots', id)

// ---- delete cascade -------------------------------------------------------

async function deleteCascade(report: TestReport, parent: string): Promise<void> {
  section(report, 'delete cascade')

  const root = await freshProject(parent, 'delete')
  const folder = await binderStore.createFolder(DRAFT_FOLDER_ID, 'Part One')
  const chapterOne = await seedDocument(folder.id, 'Chapter One', 'span-1')
  const chapterTwo = await seedDocument(folder.id, 'Chapter Two', 'span-2')
  // A document nested under another document: sub-documents are a real feature,
  // so the cascade has to reach below the first document level too.
  const scene = await seedDocument(chapterTwo, 'A Scene Inside Chapter Two', 'span-3')
  const survivor = await seedDocument(NOTES_FOLDER_ID, 'Research', 'span-4')

  await binderStore.setLastOpenDocument(chapterOne)
  await binderStore.setReferenceDocumentId(scene)

  const before = allIds((await binderStore.getState()).tree).length
  const deleted = await binderStore.deleteNode(folder.id)

  const expected = [chapterOne, chapterTwo, scene]
  assert(
    report,
    deleted.length === 3 && expected.every((id) => deleted.includes(id)),
    `deleting a folder returns every document id beneath it (got ${deleted.length} of 3)`
  )

  const filesLeft = expected.filter((id) => existsSync(documentPath(root, id)))
  assert(report, filesLeft.length === 0, `no content file is left in documents/ (found ${filesLeft.length})`)

  const snapshotsLeft = expected.filter((id) => existsSync(snapshotDir(root, id)))
  assert(report, snapshotsLeft.length === 0, `no snapshots/<id> directory is left behind (found ${snapshotsLeft.length})`)

  const spans = await listSpans()
  const orphanSpans = spans.filter((s) => expected.includes(s.documentId))
  assert(report, orphanSpans.length === 0, `no span-tag record outlives its document (found ${orphanSpans.length})`)

  // The control: a cascade that simply deleted everything would pass all four
  // assertions above.
  assert(
    report,
    existsSync(documentPath(root, survivor)) &&
      (await listSnapshots(survivor)).length === 2 &&
      spans.filter((s) => s.documentId === survivor).length === 1,
    'a document outside the deleted subtree keeps its content, its two snapshots and its span record'
  )

  const state = await binderStore.getState()
  assert(report, allIds(state.tree).length === before - 4, `the four deleted nodes are gone from the tree (${before} then ${allIds(state.tree).length})`)
  assert(report, state.lastOpenDocumentId === null, 'lastOpenDocumentId is cleared when it pointed into the deleted subtree')
  assert(report, state.viewState.referenceDocumentId === null, 'the split-view reference is cleared when it pointed into the deleted subtree')

  const onDisk = JSON.parse(await read(join(root, 'binder.json'))) as { tree: BinderNode[] }
  assert(report, !allIds(onDisk.tree).includes(folder.id), 'the deletion reached binder.json, not just memory')

  // Refusals. Both return an empty list rather than throwing, so a caller that
  // cascades on the returned ids cascades over nothing.
  const shapeBefore = shapeOf(state.tree)
  const structural = await binderStore.deleteNode(DRAFT_FOLDER_ID)
  const missing = await binderStore.deleteNode('no-such-node')
  assert(report, structural.length === 0, 'deleting a protected structural folder deletes nothing')
  assert(report, missing.length === 0, 'deleting an id that is not in the tree deletes nothing')
  assert(
    report,
    shapeOf((await binderStore.getState()).tree) === shapeBefore,
    'neither refusal changed the tree'
  )
}

// ---- duplicate ------------------------------------------------------------

async function duplicate(report: TestReport, parent: string): Promise<void> {
  section(report, 'duplicate')

  const root = await freshProject(parent, 'duplicate')
  await binderStore.setStatuses([{ id: 'status-draft', name: 'Draft', color: '#888888' }])
  await binderStore.setTags([{ id: 'tag-theme', name: 'Theme', color: '#336699' }])

  const folder = await binderStore.createFolder(DRAFT_FOLDER_ID, 'Part One')
  const chapter = await seedDocument(folder.id, 'Chapter One', 'span-a')
  const scene = await seedDocument(chapter, 'Scene', 'span-b')
  await binderStore.setSynopsis(chapter, 'The one paragraph worth keeping.')
  await binderStore.setStatusId(chapter, 'status-draft')
  await binderStore.setTagIds(chapter, ['tag-theme'])
  await binderStore.setWordTarget(chapter, 2500)
  await binderStore.setChapterNumber(chapter, 1)

  const originalIds = allIds([binderStore.getNode(folder.id) as BinderNode])
  const clone = await binderStore.duplicateNode(folder.id)
  const cloneIds = allIds([clone])

  assert(report, cloneIds.length === originalIds.length, `the copy has the same node count as the original (${cloneIds.length} against ${originalIds.length})`)
  assert(report, cloneIds.every((id) => !originalIds.includes(id)), 'every id in the copy is fresh — none is shared with the original')
  assert(report, new Set(cloneIds).size === cloneIds.length, 'the copy contains no id twice')

  const draftChildren = childrenOf((await binderStore.getState()).tree, DRAFT_FOLDER_ID)
  const at = draftChildren.findIndex((n) => n.id === folder.id)
  assert(report, at !== -1 && draftChildren[at + 1]?.id === clone.id, 'the copy is placed immediately after the original, as a sibling')

  assert(report, clone.name === 'Part One Copy', `only the top node is renamed (got "${clone.name}")`)
  assert(report, clone.children[0]?.name === 'Chapter One', 'a copied descendant keeps its own name')

  const clonedChapter = clone.children[0] as BinderNode | undefined
  const clonedScene = clonedChapter?.children[0] as BinderNode | undefined
  assert(
    report,
    clonedChapter !== undefined &&
      clonedScene !== undefined &&
      (await loadDocument(clonedChapter.id)) === (await loadDocument(chapter)) &&
      (await loadDocument(clonedScene.id)) === (await loadDocument(scene)),
    'document content is copied to the new ids, at every depth'
  )

  const spans = await listSpans()
  assert(
    report,
    spans.filter((s) => s.documentId === clonedChapter?.id).length === 1 &&
      spans.filter((s) => s.documentId === chapter).length === 1,
    'span-tag records are rebuilt for the copy without disturbing the original'
  )

  const source = binderStore.getNode(chapter)
  assert(
    report,
    clonedChapter?.type === 'document' &&
      source?.type === 'document' &&
      clonedChapter.synopsis === source.synopsis &&
      clonedChapter.statusId === source.statusId &&
      clonedChapter.wordTarget === source.wordTarget &&
      clonedChapter.chapterNumber === source.chapterNumber,
    'synopsis, status, word target and chapter number are carried across'
  )
  assert(
    report,
    clonedChapter?.type === 'document' &&
      source?.type === 'document' &&
      clonedChapter.tagIds.join(',') === source.tagIds.join(',') &&
      clonedChapter.tagIds !== source.tagIds,
    'tag ids are copied into a new array rather than shared with the original'
  )

  assert(report, (await listSnapshots(clonedChapter?.id ?? 'missing')).length === 0, 'the copy starts with no snapshot history of its own')
  assert(report, (await listSnapshots(chapter)).length === 2, "the original's snapshots are untouched")

  let refused = false
  await binderStore.duplicateNode(DRAFT_FOLDER_ID).catch(() => (refused = true))
  assert(report, refused, 'duplicating a protected structural folder is refused')

  const onDisk = JSON.parse(await read(join(root, 'binder.json'))) as { tree: BinderNode[] }
  assert(report, allIds(onDisk.tree).includes(clone.id), 'the copy reached binder.json')
}

// ---- moves ----------------------------------------------------------------

/** Everything that must be true of the tree after any move, whatever it was.
 *  Returns the first violation as text, or null. */
function moveInvariants(tree: BinderNode[], expectedIds: string[]): string | null {
  const ids = allIds(tree)
  if (ids.length !== expectedIds.length) return `node count changed: ${expectedIds.length} then ${ids.length}`
  if (new Set(ids).size !== ids.length) return 'a node id appears twice in the tree'
  const sorted = ids.slice().sort().join(',')
  if (sorted !== expectedIds.slice().sort().join(',')) return 'the set of ids changed'

  const leading = [DRAFT_FOLDER_ID, NOTES_FOLDER_ID, MATTER_FOLDER_ID]
  for (let i = 0; i < leading.length; i += 1) {
    if (tree[i]?.id !== leading[i]) return `structural folder ${leading[i]} left position ${i}`
  }
  if (tree[tree.length - 2]?.id !== ARCHIVE_FOLDER_ID || tree[tree.length - 1]?.id !== TRASH_FOLDER_ID) {
    return 'Archive and Trash are no longer the last two root nodes'
  }

  for (const node of tree) {
    if (node.type === 'document') return `a document (${node.name}) ended up at the binder root`
    if (!isStructuralFolderId(node.id) && node.isTopLevel !== true) {
      return `a root folder (${node.name}) is not flagged isTopLevel`
    }
  }
  for (const { node, parentId } of allNodes(tree)) {
    if (parentId !== null && node.type === 'folder' && node.isTopLevel) {
      return `a folder inside ${parentId} still carries isTopLevel`
    }
  }
  return null
}

async function randomMoves(report: TestReport, parent: string): Promise<void> {
  section(report, 'random valid moves')

  const root = await freshProject(parent, 'moves')
  // Deep enough that a random target is often nested, and wide enough that the
  // same-list shift-by-one in moveNode gets exercised.
  for (const part of ['Part One', 'Part Two', 'Part Three']) {
    const folder = await binderStore.createFolder(DRAFT_FOLDER_ID, part)
    for (const name of ['Opening', 'Middle', 'Close']) {
      const doc = await binderStore.createDocument(folder.id, `${part} — ${name}`)
      if (name === 'Middle') await binderStore.createDocument(doc.id, `${part} — a sub-document`)
    }
    await binderStore.createFolder(folder.id, `${part} — Cuts`)
  }
  await binderStore.createDocument(NOTES_FOLDER_ID, 'Research')
  await binderStore.createDocument(MATTER_FOLDER_ID, 'Dedication')
  await binderStore.createTopLevelFolder('Correspondence')

  // getState hands back the live state.tree, so both of these have to be taken
  // as values now: holding the array itself would mean comparing the tree with
  // its own later self.
  const startShape = shapeOf((await binderStore.getState()).tree)
  const expectedIds = allIds((await binderStore.getState()).tree)
  note(report, `${expectedIds.length} nodes before any move`)

  const random = mulberry32(20260912)
  const moves = 60
  let performed = 0
  let firstViolation: string | null = null
  let violations = 0

  for (let i = 0; i < moves; i += 1) {
    const tree = (await binderStore.getState()).tree
    const movable = allNodes(tree).filter(({ node }) => !isStructuralFolderId(node.id))
    const subject = movable[Math.floor(random() * movable.length)].node

    // Every destination a drag could legitimately offer: any folder that is
    // neither the node itself nor inside it, plus the root band for folders.
    const folders = allNodes(tree)
      .map(({ node }) => node)
      .filter((node): node is FolderNode => node.type === 'folder' && node.id !== subject.id && !isDescendantOf(subject, node.id))
    const targets: Array<string | null> = folders.map((f) => f.id)
    if (subject.type === 'folder') targets.push(null)

    const targetParentId = targets[Math.floor(random() * targets.length)]
    const destination = targetParentId === null ? tree : childrenOf(tree, targetParentId)
    const targetIndex = Math.floor(random() * (destination.length + 1))

    await binderStore.moveNode(subject.id, targetParentId, targetIndex).catch((error) => {
      if (!firstViolation) firstViolation = `move ${i + 1} threw: ${String(error)}`
    })
    performed += 1

    const violation = moveInvariants((await binderStore.getState()).tree, expectedIds)
    if (violation) {
      violations += 1
      if (!firstViolation) firstViolation = `after move ${i + 1} (${subject.name} into ${targetParentId ?? 'the root'} at ${targetIndex}): ${violation}`
    }
  }

  assert(report, performed === moves, `all ${moves} moves were attempted (ran ${performed})`)
  assert(report, violations === 0, `every move preserved node count, every id and the root's shape (${violations} violation(s)${firstViolation ? `; first: ${firstViolation}` : ''})`)

  // The moves must have gone somewhere: an implementation that silently
  // refused all sixty would satisfy every invariant above.
  const afterShape = shapeOf((await binderStore.getState()).tree)
  assert(report, afterShape !== startShape, 'the tree actually changed over the sixty moves')

  binderStore.invalidateCache()
  const reloaded = (await binderStore.getState()).tree
  assert(report, shapeOf(reloaded) === afterShape, 'the moved tree round-trips through binder.json unchanged')
  assert(report, allIds(reloaded).length === expectedIds.length, `no node was lost on the way to disk (${allIds(reloaded).length} of ${expectedIds.length})`)

  // The named refusals, checked directly rather than left to chance.
  const tree = (await binderStore.getState()).tree
  const shapeBefore = shapeOf(tree)
  const someDocument = allNodes(tree).find(({ node }) => node.type === 'document')?.node
  await binderStore.moveNode(DRAFT_FOLDER_ID, ARCHIVE_FOLDER_ID, 0)
  assert(report, shapeOf((await binderStore.getState()).tree) === shapeBefore, 'a structural folder cannot be moved')

  await binderStore.moveNode(someDocument?.id ?? 'no-document-in-the-tree', null, 3)
  assert(report, shapeOf((await binderStore.getState()).tree) === shapeBefore, 'a document cannot be moved to the binder root')

  const holder = await binderStore.createFolder(DRAFT_FOLDER_ID, 'Holder')
  const inner = await binderStore.createFolder(holder.id, 'Inner')
  const nestedShape = shapeOf((await binderStore.getState()).tree)
  await binderStore.moveNode(holder.id, inner.id, 0)
  assert(report, shapeOf((await binderStore.getState()).tree) === nestedShape, 'a folder cannot be moved inside its own descendant')

  await binderStore.moveNode(holder.id, null, 4)
  const promoted = (await binderStore.getState()).tree.find((n) => n.id === holder.id)
  assert(
    report,
    promoted?.type === 'folder' && promoted.isTopLevel === true,
    'a folder dragged to the root becomes one of the writer’s own top-level folders'
  )
  await binderStore.moveNode(holder.id, DRAFT_FOLDER_ID, 0)
  const demoted = binderStore.getNode(holder.id)
  assert(
    report,
    demoted?.type === 'folder' && demoted.isTopLevel === undefined,
    'dragging it back inside a parent clears the flag'
  )

  note(report, `move fixture root: ${root}`)
}

// ---- bulk insert ----------------------------------------------------------

function importedFolder(id: string, name: string, children: BinderNode[] = []): BinderNode {
  return { id, type: 'folder', name, collapsed: false, children } as BinderNode
}

function importedDocument(id: string, name: string, extra: Record<string, unknown> = {}): BinderNode {
  return {
    id,
    type: 'document',
    name,
    collapsed: false,
    synopsis: '',
    notes: '',
    statusId: null,
    tagIds: [],
    wordTarget: null,
    chapterNumber: null,
    children: [],
    ...extra
  } as BinderNode
}

async function bulkInsert(report: TestReport, parent: string): Promise<void> {
  section(report, 'bulk insert')

  const root = await freshProject(parent, 'insert')
  const binderPath = join(root, 'binder.json')
  await binderStore.setStatuses([{ id: 'status-draft', name: 'Draft', color: '#888888' }])
  await binderStore.setTags([{ id: 'tag-theme', name: 'Theme', color: '#336699' }])
  const destination = await binderStore.createFolder(DRAFT_FOLDER_ID, 'Imported')

  // One write for the whole subtree is the entire point of this path — the
  // alternative is one full binder.json rewrite per node.
  let binderWrites = 0
  setProjectWriteObserver((path) => {
    if (path === binderPath) binderWrites += 1
  })
  const subtree = [
    importedFolder('imp-part', 'Part One', [
      importedDocument('imp-ch1', 'Chapter One'),
      importedFolder('imp-scenes', 'Scenes', [importedDocument('imp-sc1', 'Scene One')])
    ]),
    importedDocument('imp-ch2', 'Chapter Two')
  ]
  const inserted = await binderStore.insertSubtree(destination.id, subtree)
  setProjectWriteObserver(null)

  assert(report, inserted.join(',') === 'imp-ch1,imp-sc1,imp-ch2', `the document ids come back in tree order (got ${inserted.join(',')})`)
  assert(report, binderWrites === 1, `a five-node subtree costs one binder.json write (counted ${binderWrites})`)
  const target = binderStore.getNode(destination.id)
  assert(report, target?.children.length === 2 && allIds(target.children).length === 5, 'the whole subtree landed under the requested parent')

  // Every refusal, each checked against the tree being left exactly as it was:
  // a partially applied insert would be written out by the next unrelated save.
  const shapeBefore = shapeOf((await binderStore.getState()).tree)
  const bytesBefore = await read(binderPath)
  const refusals: Array<[string, BinderNode[]]> = [
    ['an id that is already in the binder', [importedDocument('imp-ch1', 'Clash With Existing')]],
    ['the same id twice in one batch', [importedDocument('imp-new', 'One'), importedDocument('imp-new', 'Two')]],
    ['a protected structural id', [importedFolder(TRASH_FOLDER_ID, 'Not Trash')]],
    ['a protected id nested inside the batch', [importedFolder('imp-wrap', 'Wrapper', [importedFolder(DRAFT_FOLDER_ID, 'Not Draft')])]],
    ['a node of unknown type', [{ id: 'imp-odd', type: 'sketch', name: 'Odd', collapsed: false, children: [] } as unknown as BinderNode]],
    ['a node with no children array', [{ id: 'imp-flat', type: 'folder', name: 'Flat', collapsed: false } as unknown as BinderNode]]
  ]
  const accepted: string[] = []
  for (const [label, nodes] of refusals) {
    await binderStore.insertSubtree(destination.id, nodes).then(
      () => accepted.push(label),
      () => undefined
    )
  }
  assert(
    report,
    accepted.length === 0,
    `every invalid batch is refused (${refusals.length - accepted.length} of ${refusals.length}${accepted.length ? `; accepted: ${accepted.join('; ')}` : ''})`
  )
  assert(report, shapeOf((await binderStore.getState()).tree) === shapeBefore, 'no refused batch left a node behind in the tree')
  assert(report, (await read(binderPath)) === bytesBefore, 'no refused batch wrote to binder.json')

  // Cleaning, which happens after validation and before the push.
  await binderStore.insertSubtree(destination.id, [
    importedFolder('imp-flagged', 'Was Top Level', []),
    importedDocument('imp-refs', 'Dangling References', {
      statusId: 'status-that-was-deleted',
      tagIds: ['tag-theme', 'tag-that-was-deleted']
    })
  ])
  const flagged = binderStore.getNode('imp-flagged')
  const refs = binderStore.getNode('imp-refs')
  assert(report, flagged?.type === 'folder' && flagged.isTopLevel === undefined, 'an imported folder cannot arrive flagged as top-level')
  assert(report, refs?.type === 'document' && refs.statusId === null, 'a status id that does not exist is cleared rather than kept')
  assert(
    report,
    refs?.type === 'document' && refs.tagIds.join(',') === 'tag-theme',
    `tag ids are filtered to the ones the project has (got ${refs?.type === 'document' ? refs.tagIds.join(',') : 'n/a'})`
  )

  // Fields a pre-normalize importer might omit entirely.
  await binderStore.insertSubtree(destination.id, [
    { id: 'imp-bare', type: 'document', name: 'Bare', collapsed: false, children: [] } as unknown as BinderNode
  ])
  const bare = binderStore.getNode('imp-bare')
  assert(
    report,
    bare?.type === 'document' && bare.synopsis === '' && bare.notes === '' && bare.tagIds.length === 0 && bare.wordTarget === null,
    'a document inserted without the metadata fields gets the defaults, not undefined'
  )

  // Parent resolution: the same rule createDocument uses. Never the root, which
  // the next load's self-heal would sweep into Draft anyway.
  await binderStore.insertSubtree(null, [importedDocument('imp-null-parent', 'No Parent Given')])
  await binderStore.insertSubtree('a-parent-that-is-gone', [importedDocument('imp-lost-parent', 'Parent Missing')])
  const draftChildren = childrenOf((await binderStore.getState()).tree, DRAFT_FOLDER_ID)
  assert(
    report,
    draftChildren.some((n) => n.id === 'imp-null-parent') && draftChildren.some((n) => n.id === 'imp-lost-parent'),
    'a null or unresolved parent means Draft, not the binder root'
  )

  binderStore.invalidateCache()
  const reloaded = (await binderStore.getState()).tree
  assert(report, allIds(reloaded).includes('imp-sc1'), 'the inserted subtree round-trips through binder.json')
}

// ---- legacy binder shapes -------------------------------------------------

/** Writes a hand-built binder.json, opens it, and returns what the store made
 *  of it along with the bytes before and after the load. */
async function openLegacy(
  parent: string,
  prefix: string,
  file: Record<string, unknown>
): Promise<{ root: string; written: string; tree: BinderNode[]; afterLoad: string }> {
  const root = await freshProject(parent, prefix)
  const written = JSON.stringify(file, null, 2)
  await writeFile(join(root, 'binder.json'), written, 'utf-8')
  binderStore.invalidateCache()
  const tree = (await binderStore.getState()).tree
  return { root, written, tree, afterLoad: await read(join(root, 'binder.json')) }
}

/** Loads the same project a second time and reports whether anything moved or
 *  was rewritten — the migration has to be idempotent or every open rewrites
 *  the file. */
async function reopen(root: string): Promise<{ tree: BinderNode[]; shape: string; bytes: string }> {
  setProjectRoot(root)
  binderStore.invalidateCache()
  const tree = (await binderStore.getState()).tree
  return { tree, shape: shapeOf(tree), bytes: await read(join(root, 'binder.json')) }
}

async function legacyShapes(report: TestReport, parent: string): Promise<void> {
  section(report, 'four legacy binder shapes')

  // 1. Before the structural folders existed: ordinary folders and a loose
  //    document sitting at the root.
  const pre = await openLegacy(parent, 'legacy-pre', {
    version: 1,
    tree: [
      { id: 'old-act-one', type: 'folder', name: 'Act One', collapsed: false, children: [
        { id: 'old-ch1', type: 'document', name: 'Chapter One', collapsed: false, children: [] }
      ] },
      { id: 'old-act-two', type: 'folder', name: 'Act Two', collapsed: false, children: [] },
      { id: 'old-loose', type: 'document', name: 'Loose Note', collapsed: false, children: [] }
    ],
    lastOpenDocumentId: 'old-ch1'
  })
  const preDraft = { children: childrenOf(pre.tree, DRAFT_FOLDER_ID) }
  assert(
    report,
    pre.tree.length === STRUCTURAL_FOLDERS.length && pre.tree.every((n, i) => n.id === STRUCTURAL_FOLDERS[i].id),
    `a pre-structure binder gains the five protected folders in order (got ${pre.tree.length})`
  )
  assert(
    report,
    preDraft.children.map((n) => n.id).join(',') === 'old-act-one,old-act-two,old-loose',
    `every root node is swept into Draft in its original order (got ${preDraft.children.map((n) => n.id).join(',')})`
  )
  assert(
    report,
    preDraft.children[0]?.children[0]?.id === 'old-ch1',
    'nesting below the swept nodes is untouched'
  )
  const sidecar = join(pre.root, 'binder.json.pre-structure')
  assert(
    report,
    existsSync(sidecar) && (await read(sidecar)) === pre.written,
    'the exact bytes being replaced are kept beside the file as .pre-structure'
  )
  const preAgain = await reopen(pre.root)
  assert(report, preAgain.shape === shapeOf(pre.tree), 'the migrated binder opens identically a second time')
  assert(report, preAgain.bytes === pre.afterLoad, 'the second open rewrites nothing — the migration is idempotent')

  // 2. The three-folder era: Draft, Notes and Matter but no Archive or Trash,
  //    with one of the writer's own top-level folders already flagged.
  const three = await openLegacy(parent, 'legacy-three', {
    version: 1,
    tree: [
      { id: DRAFT_FOLDER_ID, type: 'folder', name: 'Draft', collapsed: false, children: [
        { id: 'three-ch1', type: 'document', name: 'Chapter One', collapsed: false, children: [] }
      ] },
      { id: NOTES_FOLDER_ID, type: 'folder', name: 'Notes', collapsed: false, children: [] },
      { id: MATTER_FOLDER_ID, type: 'folder', name: 'Matter', collapsed: false, children: [] },
      { id: 'three-own', type: 'folder', name: 'Correspondence', collapsed: false, isTopLevel: true, children: [] }
    ]
  })
  assert(
    report,
    three.tree.map((n) => n.id).join(',') ===
      `${DRAFT_FOLDER_ID},${NOTES_FOLDER_ID},${MATTER_FOLDER_ID},three-own,${ARCHIVE_FOLDER_ID},${TRASH_FOLDER_ID}`,
    `Archive and Trash are added below the writer's own folder (got ${three.tree.map((n) => n.id).join(',')})`
  )
  assert(
    report,
    childrenOf(three.tree, DRAFT_FOLDER_ID)[0]?.id === 'three-ch1' && childrenOf(three.tree, 'three-own').length === 0,
    'the existing folders keep their ids and their contents'
  )
  const threeAgain = await reopen(three.root)
  assert(report, threeAgain.shape === shapeOf(three.tree) && threeAgain.bytes === three.afterLoad, 'the three-folder shape round-trips and then holds still')

  // 3. Documents saved before synopsis, notes, status, tags, targets and
  //    chapter numbers existed, carrying the old free-text `status` instead.
  const old = await openLegacy(parent, 'legacy-fields', {
    version: 1,
    tree: [
      { id: DRAFT_FOLDER_ID, type: 'folder', name: 'Draft', collapsed: false, children: [
        { id: 'field-ch1', type: 'document', name: 'Chapter One', collapsed: false, status: 'first draft', children: [] }
      ] },
      { id: NOTES_FOLDER_ID, type: 'folder', name: 'Notes', collapsed: false, children: [] },
      { id: MATTER_FOLDER_ID, type: 'folder', name: 'Matter', collapsed: false, children: [] },
      { id: ARCHIVE_FOLDER_ID, type: 'folder', name: 'Archive', collapsed: false, children: [] },
      { id: TRASH_FOLDER_ID, type: 'folder', name: 'Trash', collapsed: false, children: [] }
    ]
  })
  const doc = binderStore.getNode('field-ch1')
  assert(
    report,
    doc?.type === 'document' &&
      doc.synopsis === '' &&
      doc.notes === '' &&
      doc.statusId === null &&
      Array.isArray(doc.tagIds) &&
      doc.wordTarget === null &&
      doc.chapterNumber === null,
    'a document written before those fields existed gains every default'
  )
  assert(
    report,
    (doc as unknown as Record<string, unknown>).status === undefined,
    'the old free-text status is dropped rather than migrated'
  )
  // An already-structured tree is not rewritten on load, so the old field
  // survives on disk until the next real edit.
  await binderStore.setProjectName('Renamed After Migration')
  const persisted = JSON.parse(await read(join(old.root, 'binder.json'))) as { tree: BinderNode[] }
  const persistedDoc = (childrenOf(persisted.tree, DRAFT_FOLDER_ID)[0] ?? {}) as unknown as Record<string, unknown>
  assert(report, !('status' in persistedDoc), 'the next save writes the document without the old field')
  assert(report, persistedDoc.statusId === null && persistedDoc.notes === '', 'and writes the backfilled fields in its place')

  // 4. Top-level fields that are missing or the wrong type — a hand-edited
  //    file, or one from before each field landed.
  const loose = await openLegacy(parent, 'legacy-loose', {
    version: 1,
    tree: [
      { id: DRAFT_FOLDER_ID, type: 'folder', name: 'Draft', collapsed: false, children: [
        { id: 'loose-ch1', type: 'document', name: 'Chapter One', collapsed: false, synopsis: '', notes: '', statusId: null, tagIds: [], wordTarget: null, chapterNumber: null, children: [] }
      ] },
      { id: NOTES_FOLDER_ID, type: 'folder', name: 'Notes', collapsed: false, children: [] },
      { id: MATTER_FOLDER_ID, type: 'folder', name: 'Matter', collapsed: false, children: [] },
      { id: ARCHIVE_FOLDER_ID, type: 'folder', name: 'Archive', collapsed: false, children: [] },
      { id: TRASH_FOLDER_ID, type: 'folder', name: 'Trash', collapsed: false, children: [] }
    ],
    viewState: 'outliner',
    tags: 'none',
    savedViews: [{ id: 'sv-1' }],
    overusedIgnoreList: ['just', 7, null],
    projectWordTarget: '90000',
    authorName: 42
  })
  const state = await binderStore.getState()
  assert(
    report,
    state.viewState.activeView === 'editor' && state.viewState.manuscriptView === 'editor' && state.viewState.statusFilter.length === 0,
    `a viewState that is not an object falls back to the defaults (got ${state.viewState.activeView})`
  )
  assert(report, state.statuses.length > 0, `a missing statuses list becomes the default stages (got ${state.statuses.length})`)
  assert(report, state.tags.length === 0 && state.savedViews.length === 0, 'tags of the wrong type and a malformed saved view are dropped')
  assert(
    report,
    state.overusedIgnoreList.join(',') === 'just',
    `the overused ignore list keeps only its strings (got ${state.overusedIgnoreList.join(',')})`
  )
  assert(
    report,
    state.projectWordTarget === null && state.authorName === null,
    'a word target and an author name of the wrong type become null rather than reaching the UI'
  )
  const looseAgain = await reopen(loose.root)
  assert(report, looseAgain.shape === shapeOf(loose.tree), 'the tree of a hand-edited file is unchanged by the repairs around it')
  assert(report, allIds(looseAgain.tree).includes('loose-ch1'), 'the document in it survives a second open')
}

// ---- entry point ----------------------------------------------------------

async function run(report: TestReport): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'chapterflow-binder-test-'))
  setProjectRoot(parent)
  try {
    await deleteCascade(report, parent)
    await duplicate(report, parent)
    await randomMoves(report, parent)
    await bulkInsert(report, parent)
    await legacyShapes(report, parent)
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

app.on('window-all-closed', () => {})

app.whenReady().then(() => void main())
