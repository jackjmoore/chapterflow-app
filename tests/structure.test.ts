/**
 * The protected structural folders, end to end against a real temp project:
 * the one-time migration (at the 45+ document scale the earlier
 * folder-creation bug surfaced at, not a toy tree), its idempotence and
 * sidecar backup, the protection guards, the creation redirects, the
 * Draft-only word-count scoping, and the template/matter homes.
 *
 * Also covers Archive, Trash and the writer's own top-level folders: that a
 * legacy project gains the two new protected folders without its content
 * moving, that they take documents like ordinary folders, that a custom
 * top-level folder is deletable where the protected five are not, that
 * emptying Trash removes documents AND their snapshots, and — as a standing
 * regression check rather than new work — that none of these folders can be
 * pulled into a compile pass.
 *
 * Runs in a real Electron main process (via run-electron-test.mjs) because
 * the stores sit on getProjectRoot/app paths.
 */
import { app } from 'electron'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { setProjectRoot } from '../src/main/projectRoot'
import * as binderStore from '../src/main/binderStore'
import * as documentStore from '../src/main/documentStore'
import * as wordCountStore from '../src/main/wordCountStore'
import { applyTemplate, createFrontMatter } from '../src/main/templates'
import * as snapshotStore from '../src/main/snapshotStore'
import {
  ARCHIVE_FOLDER_ID,
  DRAFT_FOLDER_ID,
  MATTER_FOLDER_ID,
  NOTES_FOLDER_ID,
  TRASH_FOLDER_ID,
  customTopLevelFolders,
  draftChildren,
  matterFolder,
  trashFolder,
  type BinderNode,
  type DocumentNode
} from '../src/shared/binder'
import { assert, createReport, note, section, summarize, type TestReport } from './harness'

/** Finds a document node anywhere in a tree. */
function findDocument(nodes: BinderNode[], id: string): DocumentNode | null {
  for (const node of nodes) {
    if (node.id === id && node.type === 'document') return node
    const found = findDocument(node.children, id)
    if (found) return found
  }
  return null
}

/** A legacy-format (pre-structure) node — deliberately minimal, the way an
 *  old binder.json actually looks, so normalizeTree has real work to do. */
function legacyDoc(id: string, name: string): Record<string, unknown> {
  return { id, type: 'document', name, collapsed: false, children: [] }
}

function legacyFolder(id: string, name: string, children: unknown[]): Record<string, unknown> {
  return { id, type: 'folder', name, collapsed: false, children }
}

/** 47 documents across nested folders plus loose root documents — the shape
 *  and scale of a real, lived-in project. */
function buildLegacyTree(): { tree: unknown[]; documentIds: string[] } {
  const documentIds: string[] = []
  const doc = (id: string, name: string): Record<string, unknown> => {
    documentIds.push(id)
    return legacyDoc(id, name)
  }
  const tree: unknown[] = []
  for (let part = 1; part <= 3; part += 1) {
    const children: unknown[] = []
    for (let i = 1; i <= 14; i += 1) {
      children.push(doc(`doc-${part}-${i}`, `Chapter ${part}.${i}`))
    }
    tree.push(legacyFolder(`part-${part}`, `Part ${part}`, children))
  }
  tree.push(
    legacyFolder('deep', 'Fragments', [
      doc('deep-1', 'Fragment One'),
      legacyFolder('deeper', 'Older', [doc('deep-2', 'Fragment Two')])
    ])
  )
  tree.push(doc('loose-1', 'Prologue sketch'))
  tree.push(doc('loose-2', 'Ending idea'))
  tree.push(doc('loose-3', 'Discarded opening'))
  return { tree, documentIds }
}

function names(nodes: BinderNode[]): string[] {
  return nodes.map((n) => n.name)
}

async function run(report: TestReport): Promise<void> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'chapterflow-structure-test-'))
  setProjectRoot(projectRoot)
  binderStore.invalidateCache()
  wordCountStore.invalidateAll()

  try {
    const { tree: legacyTree, documentIds } = buildLegacyTree()
    const legacyFile = {
      version: 1,
      tree: legacyTree,
      lastOpenDocumentId: 'doc-2-7',
      projectName: 'Migration Test',
      projectWordTarget: 90000
    }
    await writeFile(join(projectRoot, 'binder.json'), JSON.stringify(legacyFile, null, 2), 'utf-8')
    await mkdir(join(projectRoot, 'documents'), { recursive: true })
    await writeFile(join(projectRoot, 'documents', 'doc-1-1.html'), '<p>one two three four five</p>', 'utf-8')

    section(report, `migration at scale (${documentIds.length} documents)`)
    const state = await binderStore.getState()
    assert(
      report,
      JSON.stringify(state.tree.map((n) => n.id)) ===
        JSON.stringify([DRAFT_FOLDER_ID, NOTES_FOLDER_ID, MATTER_FOLDER_ID, ARCHIVE_FOLDER_ID, TRASH_FOLDER_ID]),
      'the root becomes exactly Draft, Notes, Matter, Archive, Trash, in that order'
    )
    assert(
      report,
      (state.tree[3].children.length === 0 && state.tree[4].children.length === 0),
      'a legacy project gains Archive and Trash empty — nothing was rerouted into them'
    )
    assert(
      report,
      JSON.stringify(names(draftChildren(state.tree))) ===
        JSON.stringify(['Part 1', 'Part 2', 'Part 3', 'Fragments', 'Prologue sketch', 'Ending idea', 'Discarded opening']),
      `every root item moved into Draft in its original order (${names(draftChildren(state.tree)).join(', ')})`
    )
    const migratedIds = await binderStore.getDraftDocumentIds()
    assert(
      report,
      migratedIds.length === documentIds.length && documentIds.every((id) => migratedIds.includes(id)),
      `all ${documentIds.length} documents survive with their ids (got ${migratedIds.length})`
    )
    const fragments = draftChildren(state.tree).find((n) => n.name === 'Fragments')
    assert(
      report,
      fragments?.children[1]?.type === 'folder' && fragments.children[1].children[0]?.id === 'deep-2',
      'nested structure inside moved folders is untouched'
    )
    assert(report, state.lastOpenDocumentId === 'doc-2-7', 'lastOpenDocumentId survives')
    assert(report, state.projectName === 'Migration Test', 'project metadata survives')
    assert(
      report,
      existsSync(join(projectRoot, 'binder.json.pre-structure')),
      'the exact pre-migration bytes are kept as a sidecar'
    )
    const sidecar = JSON.parse(await readFile(join(projectRoot, 'binder.json.pre-structure'), 'utf-8'))
    assert(report, Array.isArray(sidecar.tree) && sidecar.tree.length === legacyTree.length, 'the sidecar parses back to the original root')

    const persisted = await readFile(join(projectRoot, 'binder.json'), 'utf-8')
    binderStore.invalidateCache()
    const reloaded = await binderStore.getState()
    assert(
      report,
      JSON.stringify(reloaded.tree) === JSON.stringify(state.tree),
      'a second load is a no-op (idempotent)'
    )
    assert(
      report,
      (await readFile(join(projectRoot, 'binder.json'), 'utf-8')) === persisted,
      'the second load does not rewrite the file'
    )

    section(report, 'protection guards')
    await binderStore.deleteNode(DRAFT_FOLDER_ID)
    await binderStore.rename(NOTES_FOLDER_ID, 'Scribbles')
    await binderStore.moveNode(MATTER_FOLDER_ID, DRAFT_FOLDER_ID, 0)
    await binderStore.moveNode('loose-1', null, 0)
    await binderStore.deleteNode(TRASH_FOLDER_ID)
    await binderStore.rename(ARCHIVE_FOLDER_ID, 'Old Stuff')
    const guarded = await binderStore.getState()
    assert(
      report,
      guarded.tree.length === 5 &&
        guarded.tree[0].id === DRAFT_FOLDER_ID &&
        guarded.tree[1].name === 'Notes' &&
        guarded.tree[3].name === 'Archive' &&
        guarded.tree[4].id === TRASH_FOLDER_ID,
      'delete, rename, and move are all refused for every structural folder, Archive and Trash included'
    )
    assert(
      report,
      draftChildren(guarded.tree).some((n) => n.id === 'loose-1'),
      'nothing can be moved to the root — the document stayed in Draft'
    )
    const duplicateRefused = await binderStore.duplicateNode(DRAFT_FOLDER_ID).then(
      () => false,
      () => true
    )
    assert(report, duplicateRefused, 'duplicating a structural folder is refused')

    section(report, 'creation redirects')
    const rootDoc = await binderStore.createDocument(null, 'New Scene')
    const rootFolder = await binderStore.createFolder(null, 'New Part')
    const near = await binderStore.createDocumentNear(null, 'Nearby')
    const redirected = await binderStore.getState()
    assert(
      report,
      [rootDoc.id, rootFolder.id, near.id].every((id) =>
        draftChildren(redirected.tree).some((n) => n.id === id)
      ) && redirected.tree.length === 5,
      'creating with no parent lands in Draft, never at the root'
    )

    section(report, 'word counts scope to Draft')
    const noteDoc = await binderStore.createDocument(NOTES_FOLDER_ID, 'Worldbuilding')
    await documentStore.saveDocument(noteDoc.id, '<p>seven words of notes that never count</p>')
    const matterDoc = await binderStore.createDocument(MATTER_FOLDER_ID, 'Dedication')
    await documentStore.saveDocument(matterDoc.id, '<p>for someone</p>')
    wordCountStore.invalidateAll()
    const total = await wordCountStore.projectWordCount()
    assert(report, total === 5, `the project total counts Draft only (got ${total}, expected 5)`)
    const others = await wordCountStore.getOtherDocumentsWordCount('doc-1-1')
    assert(report, others === 0, `excluding the active draft document leaves the draft remainder (${others})`)
    const perDoc = await wordCountStore.getWordCountsByDocument()
    assert(
      report,
      perDoc[noteDoc.id] === 7 && perDoc[matterDoc.id] === 2,
      'Notes and Matter documents keep live per-document counts'
    )
    const baseline = await wordCountStore.getDailyBaseline()
    assert(report, baseline === 5, `the daily baseline is Draft-scoped too (${baseline})`)

    section(report, 'notes are metadata, and cannot reach the manuscript')
    // The whole reason notes live on DocumentNode rather than in the document
    // HTML: a Draft document's body is both the compile source and the
    // word-count source, so notes kept anywhere near it would silently become
    // manuscript. This asserts they structurally cannot.
    const notedDoc = await binderStore.createDocument(DRAFT_FOLDER_ID, 'Chapter with notes')
    await documentStore.saveDocument(notedDoc.id, '<p>exactly five words right here</p>')
    wordCountStore.invalidateAll()
    const beforeNotes = await wordCountStore.projectWordCount()
    await binderStore.setNotes(
      notedDoc.id,
      'A long note that mentions many words and would badly inflate any total it reached.'
    )
    await binderStore.setSynopsis(notedDoc.id, 'A synopsis that would do the same.')
    wordCountStore.invalidateAll()
    const afterNotes = await wordCountStore.projectWordCount()
    assert(
      report,
      beforeNotes === afterNotes,
      `writing notes and a synopsis moves the project word count by nothing (${beforeNotes} -> ${afterNotes})`
    )
    const notedState = await binderStore.getState()
    const notedNode = findDocument(notedState.tree, notedDoc.id)
    assert(
      report,
      notedNode?.notes.startsWith('A long note') === true && notedNode?.synopsis.startsWith('A synopsis') === true,
      'and both are stored, separately, on the document node'
    )
    assert(
      report,
      (await documentStore.loadDocument(notedDoc.id)) === '<p>exactly five words right here</p>',
      'the document body on disk is untouched by either'
    )

    binderStore.invalidateCache()
    const reloadedNotes = findDocument((await binderStore.getState()).tree, notedDoc.id)
    assert(report, reloadedNotes?.notes.startsWith('A long note') === true, 'notes survive a reload')

    // A project written before the field existed must load without breaking.
    const legacyPath = join(projectRoot, 'binder.json')
    const onDisk = JSON.parse(await readFile(legacyPath, 'utf-8'))
    const stripNotes = (nodes: Record<string, unknown>[]): void => {
      for (const node of nodes) {
        delete node.notes
        if (Array.isArray(node.children)) stripNotes(node.children as Record<string, unknown>[])
      }
    }
    stripNotes(onDisk.tree)
    await writeFile(legacyPath, JSON.stringify(onDisk, null, 2), 'utf-8')
    binderStore.invalidateCache()
    const backfilled = await binderStore.getState()
    const backfilledNode = findDocument(backfilled.tree, notedDoc.id)
    assert(
      report,
      backfilledNode !== null && backfilledNode.notes === '',
      'a binder.json written before notes existed loads with an empty one rather than undefined'
    )
    assert(
      report,
      backfilled.tree.length === 5 && draftChildren(backfilled.tree).length > 0,
      'and the rest of that project is unaffected'
    )

    section(report, 'templates and matter homes')
    await applyTemplate('nonfiction')
    const templated = await binderStore.getState()
    const matter = matterFolder(templated.tree)
    assert(
      report,
      names(matter?.children ?? []).includes('Front Matter') && names(matter?.children ?? []).includes('Back Matter'),
      'the nonfiction template puts its matter sections into Matter'
    )
    assert(
      report,
      names(draftChildren(templated.tree)).includes('Chapters'),
      'and its Chapters into Draft'
    )
    const frontId = await createFrontMatter()
    const afterFront = await binderStore.getState()
    assert(
      report,
      matterFolder(afterFront.tree)?.children[0]?.id === frontId,
      'compile-generated front matter lands first inside Matter'
    )

    section(report, 'Archive and Trash are ordinary folders that happen to be protected')
    const archived = await binderStore.createDocument(ARCHIVE_FOLDER_ID, 'Cut subplot')
    await documentStore.saveDocument(archived.id, '<p>one two three four five six</p>')
    const trashed = await binderStore.createDocument(TRASH_FOLDER_ID, 'Abandoned chapter')
    await documentStore.saveDocument(trashed.id, '<p>nine hundred words that are gone</p>')
    const filed = await binderStore.getState()
    assert(
      report,
      filed.tree[3].children.some((n) => n.id === archived.id) &&
        trashFolder(filed.tree)?.children.some((n) => n.id === trashed.id) === true,
      'documents can be created directly inside Archive and Trash'
    )

    // A document dragged from the manuscript into Archive is the real gesture
    // here, and the one with a consequence worth pinning down.
    wordCountStore.invalidateAll()
    const beforeArchiving = await wordCountStore.projectWordCount()
    await binderStore.moveNode('doc-1-1', ARCHIVE_FOLDER_ID, 0)
    wordCountStore.invalidateAll()
    const afterArchiving = await wordCountStore.projectWordCount()
    assert(
      report,
      beforeArchiving - afterArchiving === 5,
      `archiving a document removes its words from the project total (${beforeArchiving} -> ${afterArchiving})`
    )
    const stillCounted = await wordCountStore.getWordCountsByDocument()
    assert(
      report,
      stillCounted['doc-1-1'] === 5,
      'but its own per-document count is still live — it left the manuscript, not the project'
    )
    await binderStore.moveNode('doc-1-1', DRAFT_FOLDER_ID, 0)
    wordCountStore.invalidateAll()
    assert(
      report,
      (await wordCountStore.projectWordCount()) === beforeArchiving,
      'and moving it back restores them exactly — the move is not destructive'
    )

    section(report, "the writer's own top-level folders")
    const custom = await binderStore.createTopLevelFolder('Research')
    const withCustom = await binderStore.getState()
    assert(
      report,
      JSON.stringify(withCustom.tree.map((n) => n.name)) ===
        JSON.stringify(['Draft', 'Notes', 'Matter', 'Research', 'Archive', 'Trash']),
      'a custom top-level folder lands between Matter and Archive'
    )
    await binderStore.rename(custom.id, 'Interviews')
    const renamed = await binderStore.getState()
    assert(
      report,
      customTopLevelFolders(renamed.tree).map((f) => f.name).join(',') === 'Interviews',
      'unlike the protected five, it can be renamed'
    )

    // The flag, not the position, is what keeps it at the root — so a reload
    // has to leave it there rather than sweeping it into Draft the way the
    // migration sweeps a legacy root folder.
    binderStore.invalidateCache()
    const afterReload = await binderStore.getState()
    assert(
      report,
      customTopLevelFolders(afterReload.tree).some((f) => f.id === custom.id) &&
        !draftChildren(afterReload.tree).some((n) => n.id === custom.id),
      'it survives a reload at the root instead of being migrated into Draft'
    )

    const customDoc = await binderStore.createDocument(custom.id, 'Transcript')
    await documentStore.saveDocument(customDoc.id, '<p>eight words in here that never count at all</p>')
    wordCountStore.invalidateAll()
    assert(
      report,
      (await wordCountStore.projectWordCount()) === beforeArchiving,
      'documents inside it are outside the manuscript, like Notes and Matter'
    )

    await binderStore.deleteNode(custom.id)
    const afterCustomDelete = await binderStore.getState()
    assert(
      report,
      customTopLevelFolders(afterCustomDelete.tree).length === 0 && afterCustomDelete.tree.length === 5,
      'and it can be deleted, which the protected five cannot'
    )

    section(report, 'compile never sees any of it')
    // A regression check, not new behavior: compile scopes through
    // draftChildren(), which resolves Draft by its fixed id. Archive, Trash
    // and custom folders are root siblings, so they are structurally
    // unreachable from it — this pins that down against a stray document
    // deliberately placed in each one.
    const strays = [
      await binderStore.createDocument(ARCHIVE_FOLDER_ID, 'Stray in Archive'),
      await binderStore.createDocument(TRASH_FOLDER_ID, 'Stray in Trash'),
      await binderStore.createDocument(NOTES_FOLDER_ID, 'Stray in Notes')
    ]
    const secondCustom = await binderStore.createTopLevelFolder('Scraps')
    strays.push(await binderStore.createDocument(secondCustom.id, 'Stray in Scraps'))
    const compileState = await binderStore.getState()
    const compileSources: string[] = []
    const collect = (nodes: BinderNode[]): void => {
      for (const node of nodes) {
        if (node.type === 'document') compileSources.push(node.id)
        collect(node.children)
      }
    }
    collect(draftChildren(compileState.tree))
    assert(
      report,
      strays.every((s) => !compileSources.includes(s.id)),
      `no stray document in Archive, Trash, Notes or a custom folder reaches the compile forest (${compileSources.length} sources)`
    )
    const draftScoped = await binderStore.getDraftDocumentIds()
    assert(
      report,
      strays.every((s) => !draftScoped.includes(s.id)),
      'and none of them reach the Draft-scoped document ids word counts run on'
    )
    await binderStore.deleteNode(secondCustom.id)

    section(report, 'emptying Trash is permanent')
    const doomed = await binderStore.createDocument(TRASH_FOLDER_ID, 'Doomed')
    await documentStore.saveDocument(doomed.id, '<p>this will not survive</p>')
    await snapshotStore.createSnapshot(doomed.id, 'Doomed')
    const doomedFolder = await binderStore.createFolder(TRASH_FOLDER_ID, 'Doomed folder')
    const doomedChild = await binderStore.createDocument(doomedFolder.id, 'Doomed child')
    await documentStore.saveDocument(doomedChild.id, '<p>nor will this</p>')
    assert(
      report,
      (await snapshotStore.listSnapshots(doomed.id)).length === 1,
      'a trashed document can still have snapshots right up until the moment Trash is emptied'
    )

    const emptied = await binderStore.emptyTrash()
    const afterEmpty = await binderStore.getState()
    assert(
      report,
      trashFolder(afterEmpty.tree)?.children.length === 0 && afterEmpty.tree.length === 5,
      'emptying Trash clears its contents and leaves Trash itself in place'
    )
    assert(
      report,
      emptied.includes(doomed.id) && emptied.includes(doomedChild.id) && emptied.length >= 2,
      `it reports every document it removed, nested ones included (${emptied.length})`
    )
    assert(
      report,
      !existsSync(join(projectRoot, 'documents', `${doomed.id}.html`)) &&
        !existsSync(join(projectRoot, 'documents', `${doomedChild.id}.html`)),
      'the document files are gone from disk'
    )
    assert(
      report,
      (await snapshotStore.listSnapshots(doomed.id)).length === 0,
      'and so are the snapshots — this is the one delete with nothing left to recover from'
    )
    assert(
      report,
      (await binderStore.emptyTrash()).length === 0,
      'emptying an already-empty Trash is a no-op'
    )

    section(report, 'insertSubtree writes a whole subtree in one persist')
    // The bulk path an importer needs. Its failure modes are all corruption,
    // so each guard gets its own assertion.
    const subtreeDoc = (id: string, name: string): BinderNode => ({
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
      children: []
    })
    const subtree: BinderNode[] = [
      {
        id: 'imported-folder-1',
        type: 'folder',
        name: 'Imported Act',
        collapsed: false,
        isTopLevel: true,
        children: [subtreeDoc('imported-doc-1', 'Imported One'), subtreeDoc('imported-doc-2', 'Imported Two')]
      } as BinderNode
    ]

    const beforeBytes = (await readFile(join(projectRoot, 'binder.json'), 'utf-8')).length
    const insertedIds = await binderStore.insertSubtree(DRAFT_FOLDER_ID, subtree)
    assert(
      report,
      JSON.stringify(insertedIds) === JSON.stringify(['imported-doc-1', 'imported-doc-2']),
      'it returns the inserted document ids in tree order'
    )
    const withSubtree = await binderStore.getState()
    const importedFolder = draftChildren(withSubtree.tree).find((n) => n.id === 'imported-folder-1')
    assert(report, importedFolder !== undefined, 'the subtree lands under the requested parent')
    assert(
      report,
      importedFolder !== undefined && (importedFolder as { isTopLevel?: boolean }).isTopLevel === undefined,
      'and isTopLevel is stripped, so it cannot later promote itself to the root'
    )
    assert(
      report,
      (await readFile(join(projectRoot, 'binder.json'), 'utf-8')).length > beforeBytes,
      'the binder was written'
    )

    // A protected id would be swallowed by ensureStructuralFolders on the next
    // load, taking a real folder and everything under it with it.
    const structuralRefused = await binderStore
      .insertSubtree(DRAFT_FOLDER_ID, [subtreeDoc(DRAFT_FOLDER_ID, 'Impostor')])
      .then(() => false, () => true)
    assert(report, structuralRefused, 'a node carrying a protected folder id is refused')

    // Never silently reassigned: the caller has already written the document
    // file under that id.
    const duplicateIdRefused = await binderStore
      .insertSubtree(DRAFT_FOLDER_ID, [subtreeDoc('imported-doc-1', 'Clash')])
      .then(() => false, () => true)
    assert(report, duplicateIdRefused, 'a duplicate id is refused')

    const malformedRefused = await binderStore
      .insertSubtree(DRAFT_FOLDER_ID, [{ id: 'broken', type: 'document', name: 'No children' } as unknown as BinderNode])
      .then(() => false, () => true)
    assert(report, malformedRefused, 'a node with no children array is refused')

    const afterRefusals = await binderStore.getState()
    assert(
      report,
      draftChildren(afterRefusals.tree).filter((n) => n.id === 'imported-folder-1').length === 1 &&
        !draftChildren(afterRefusals.tree).some((n) => n.name === 'Impostor' || n.name === 'Clash'),
      'and none of the three refusals left anything behind in the tree'
    )

    binderStore.invalidateCache()
    const afterSubtreeReload = await binderStore.getState()
    assert(
      report,
      draftChildren(afterSubtreeReload.tree).some((n) => n.id === 'imported-folder-1') &&
        afterSubtreeReload.tree.length === 5,
      'the subtree survives a reload, and the root keeps its five protected folders'
    )

    section(report, 'importSnapshot keeps the timestamp it was given')
    // Version history imported from elsewhere has to carry its own dates, or a
    // diff between two revisions shows both as today.
    const snapDoc = await binderStore.createDocument(DRAFT_FOLDER_ID, 'Has history')
    await documentStore.saveDocument(snapDoc.id, '<p>as it stands now</p>')
    await snapshotStore.createSnapshot(snapDoc.id, 'Taken here')
    const imported = await snapshotStore.importSnapshot(
      snapDoc.id,
      '<p>as it stood in 2024</p>',
      '2024-03-11T09:15:00.000Z',
      'From Scrivener'
    )
    assert(
      report,
      imported.timestamp === '2024-03-11T09:15:00.000Z',
      `the imported snapshot keeps its own date (${imported.timestamp})`
    )
    assert(report, imported.auto === false, 'and is recorded as authored rather than automatic')
    const history = await snapshotStore.listSnapshots(snapDoc.id)
    assert(
      report,
      history.length === 2 && history[0].name === 'Taken here' && history[1].name === 'From Scrivener',
      'it sorts into the history newest-first alongside a natively taken one'
    )
    assert(
      report,
      (await snapshotStore.getSnapshotContent(snapDoc.id, imported.id)) === '<p>as it stood in 2024</p>',
      'and its content round-trips'
    )
    const badTimestamp = await snapshotStore
      .importSnapshot(snapDoc.id, '<p>x</p>', 'not a date', null)
      .then(() => false, () => true)
    assert(report, badTimestamp, 'an unreadable timestamp is refused rather than silently replaced with now')

    note(report, `project root: ${projectRoot}`)
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
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
