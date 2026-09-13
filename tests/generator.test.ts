/**
 * The fixture generator: is it deterministic, does it plant what it claims,
 * and does it write the files the app's own stores write.
 *
 * Everything downstream of this rests on the answers. A fixture that is not
 * byte-identical between runs cannot be used to assert that anything else is
 * stable; planted word counts and entity placements that are not exact turn
 * every later assertion into "roughly"; and a project the stores have to
 * migrate or repair on open is not the project the test thought it opened —
 * the first save would rewrite it underneath the assertions.
 *
 * So the three claims in the generator's own header are checked here rather
 * than trusted:
 *
 *   1. two runs of one shape and seed produce the same bytes, and a different
 *      seed produces different prose in the same structure;
 *   2. `countWords`, `prepareMentionMatching` and `findMentionsInText` — the
 *      app's own functions, not copies — agree with the truth file to the
 *      exact number, for every document;
 *   3. `binderStore` loads a generated project and writes it back byte for
 *      byte, with no `.pre-structure` sidecar and nothing backfilled, and
 *      `spanTagStore` rebuilds the same index the generator wrote.
 *
 * Runs in a real Electron main process because the stores reach
 * getProjectRoot, which reads app paths. No window is opened and nothing here
 * is timed, so it runs on a cloud runner under a virtual framebuffer as well
 * as on the development machine. Everything happens inside a temp directory
 * made by the test and removed at the end.
 */
import { app } from 'electron'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join, relative } from 'path'
import { parse } from 'node-html-parser'
import { setProjectWriteObserver } from '../src/main/atomicWrite'
import { setProjectRoot } from '../src/main/projectRoot'
import * as binderStore from '../src/main/binderStore'
import * as storyBibleStore from '../src/main/storyBibleStore'
import { getSheet } from '../src/main/storyBibleSheetStore'
import { listSpans, rebuildForDocument } from '../src/main/spanTagStore'
import { countWords } from '../src/shared/wordCount'
import { findMentionsInText, prepareMentionMatching, type MentionCandidate } from '../src/shared/mentionMatcher'
import { DEFAULT_STATUSES } from '../src/shared/statusDefaults'
import { DEFAULT_STORY_BIBLE_TYPES } from '../src/shared/storyBibleTypeDefaults'
import { STRUCTURAL_FOLDERS, type BinderNode } from '../src/shared/binder'
import {
  writeFixture,
  STATUSES as GENERATOR_STATUSES,
  STORY_BIBLE_TYPES as GENERATOR_TYPES,
  STRUCTURAL as GENERATOR_STRUCTURAL,
  type FixtureTruth
} from '../scripts/make-fixture-project.mjs'
import { assert, createReport, note, section, summarize, type TestReport } from './harness'

const read = (path: string): Promise<string> => readFile(path, 'utf-8')

// ---- small helpers --------------------------------------------------------

/** Every file under a directory, as paths relative to it, sorted. */
async function listFiles(root: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name)
      if (entry.isDirectory()) await walk(full)
      else out.push(relative(root, full).split('\\').join('/'))
    }
  }
  await walk(root)
  return out.sort()
}

/** Flattens a binder tree. Every walk in this suite goes through it, and it
 *  returns a list rather than throwing on a shape it did not expect, so a
 *  defect arrives as a failed assertion instead of abandoning the sections
 *  after it — the lesson of 2026-09-11 and 2026-09-12. */
function allNodes(nodes: BinderNode[] | undefined): BinderNode[] {
  const out: BinderNode[] = []
  const walk = (list: BinderNode[] | undefined): void => {
    if (!Array.isArray(list)) return
    for (const node of list) {
      if (!node) continue
      out.push(node)
      walk(node.children)
    }
  }
  walk(nodes)
  return out
}

function documentIdsOf(nodes: BinderNode[] | undefined): string[] {
  return allNodes(nodes)
    .filter((node) => node.type === 'document')
    .map((node) => node.id)
}

/** A generated fixture and the truth beside it. */
interface Fixture {
  root: string
  truth: FixtureTruth
}

async function build(parent: string, shape: string, name: string, seed?: number): Promise<Fixture> {
  const root = join(parent, name)
  const { truth } = await writeFixture({
    shape,
    target: root,
    seed,
    truthPath: join(parent, `${name}.truth.json`)
  })
  return { root, truth }
}

/** Points every store at a project root and clears what they cached. */
function openProject(root: string): void {
  setProjectRoot(root)
  binderStore.invalidateCache()
  storyBibleStore.invalidateCache()
}

// ---- 1. the same seed, twice ---------------------------------------------

async function determinism(report: TestReport, parent: string): Promise<void> {
  section(report, 'the same shape and seed, twice')

  for (const shape of ['small', 'realistic']) {
    const first = await build(parent, shape, `${shape}-a`)
    const second = await build(parent, shape, `${shape}-b`)

    const filesA = await listFiles(first.root)
    const filesB = await listFiles(second.root)
    assert(
      report,
      filesA.length > 0 && filesA.join('\n') === filesB.join('\n'),
      `${shape}: both runs write the same ${filesA.length} files, with the same names`
    )

    // A file the second run did not write counts as a difference rather than
    // as a thrown ENOENT: a generator that has stopped being deterministic
    // must arrive here as failed assertions, not as an exception that
    // abandons every section after this one.
    const differing: string[] = []
    for (const path of filesA) {
      const second_ = join(second.root, path)
      const right = existsSync(second_) ? await read(second_) : null
      if (right === null || (await read(join(first.root, path))) !== right) differing.push(path)
    }
    assert(report, differing.length === 0, `${shape}: every file is byte-identical between the two runs (${differing.length} differ)`)

    const truthA = await read(join(parent, `${shape}-a.truth.json`))
    const truthB = await read(join(parent, `${shape}-b.truth.json`))
    assert(report, truthA === truthB, `${shape}: the ground-truth file is byte-identical too`)

    // The control: the two runs are not identical because the generator wrote
    // nothing, or because both projects are empty.
    assert(
      report,
      first.truth.totals.documents >= 6 && first.truth.totals.words >= 1000,
      `${shape}: the fixture actually has content (${first.truth.totals.documents} documents, ${first.truth.totals.words} words)`
    )
  }

  // A different seed has to change the prose, and must not change the shape.
  const base = await build(parent, 'small', 'seed-base')
  const other = await build(parent, 'small', 'seed-other', 987654321)
  const baseDoc = base.truth.documents[0]
  const otherDoc = other.truth.documents[0]
  const baseHtml = baseDoc ? await read(join(base.root, baseDoc.path)) : ''
  const otherHtml = otherDoc ? await read(join(other.root, otherDoc.path)) : ''
  assert(report, baseHtml !== '' && baseHtml !== otherHtml, 'a different seed writes different prose')
  assert(
    report,
    base.truth.totals.documents === other.truth.totals.documents &&
      base.truth.documents.map((d) => d.name).join('|') === other.truth.documents.map((d) => d.name).join('|'),
    'a different seed keeps the same structure: the same documents, in the same order, under the same names'
  )
  assert(
    report,
    base.truth.entities.map((e) => e.id).join('|') !== other.truth.entities.map((e) => e.id).join('|'),
    'ids are derived from the seed, so they move with it'
  )
}

// ---- 2. planted word counts ----------------------------------------------

async function plantedWordCounts(report: TestReport, fixture: Fixture, label: string): Promise<void> {
  section(report, `planted word counts (${label})`)

  const wrong: string[] = []
  let summed = 0
  for (const doc of fixture.truth.documents) {
    const html = existsSync(join(fixture.root, doc.path)) ? await read(join(fixture.root, doc.path)) : ''
    const counted = countWords(html)
    summed += counted
    if (counted !== doc.words) wrong.push(`${doc.name}: ${counted} not ${doc.words}`)
  }
  assert(
    report,
    wrong.length === 0,
    `countWords agrees with the planted number for all ${fixture.truth.documents.length} documents` +
      (wrong.length ? ` — ${wrong.slice(0, 3).join('; ')}` : '')
  )
  assert(report, summed === fixture.truth.totals.words, `the project total is the stated ${fixture.truth.totals.words} (counted ${summed})`)

  const binderRaw = JSON.parse(await read(join(fixture.root, 'binder.json')))
  assert(
    report,
    binderRaw?.wordCountBaseline?.count === fixture.truth.totals.draftWords,
    `the binder's word-count baseline is the Draft total, ${fixture.truth.totals.draftWords} (file says ${binderRaw?.wordCountBaseline?.count})`
  )
  if (label === 'realistic') {
    assert(report, fixture.truth.totals.draftWords === 120000, `the realistic shape is exactly 120,000 Draft words (${fixture.truth.totals.draftWords})`)
  }

  // Nothing in the generated HTML needs entity decoding, so the two word
  // counters cannot disagree about it.
  const first = fixture.truth.documents[0]
  const html = first ? await read(join(fixture.root, first.path)) : ''
  assert(report, !html.includes('&'), 'the generated HTML carries no character entities to decode')
}

// ---- 3. planted entity placements ----------------------------------------

async function plantedEntities(report: TestReport, fixture: Fixture, label: string): Promise<void> {
  section(report, `planted entity placements (${label})`)

  const candidates: MentionCandidate[] = []
  for (const entity of fixture.truth.entities) {
    candidates.push({ itemId: entity.id, text: entity.name })
    for (const alias of entity.aliases) candidates.push({ itemId: entity.id, text: alias })
  }
  const { regex, lookup } = prepareMentionMatching(candidates)
  assert(report, regex !== null, `detection has something to match: ${candidates.length} names and aliases`)

  const perEntity = new Map<string, number>()
  const disagreements: string[] = []
  for (const doc of fixture.truth.documents) {
    const html = existsSync(join(fixture.root, doc.path)) ? await read(join(fixture.root, doc.path)) : ''
    // The same extraction the main process uses for mentions — node-html-parser's
    // textContent, not a regex of this suite's own.
    const found = regex ? findMentionsInText(parse(html).textContent, regex, lookup) : new Map()
    const detected: Record<string, number> = {}
    for (const [itemId, stats] of found) {
      detected[itemId] = stats.count
      perEntity.set(itemId, (perEntity.get(itemId) ?? 0) + stats.count)
    }
    const planted = doc.mentionsByItem ?? {}
    if (JSON.stringify(detected) !== JSON.stringify(planted)) {
      disagreements.push(`${doc.name}: detected ${JSON.stringify(detected)}, planted ${JSON.stringify(planted)}`)
    }
  }
  assert(
    report,
    disagreements.length === 0,
    `every document detects exactly the names planted in it, and no others` +
      (disagreements.length ? ` — ${disagreements.slice(0, 2).join('; ')}` : '')
  )

  const totalsWrong = fixture.truth.entities.filter((entity) => (perEntity.get(entity.id) ?? 0) !== entity.total)
  assert(
    report,
    totalsWrong.length === 0,
    `every entity's project-wide total matches the truth file (${totalsWrong.length} do not)`
  )

  // Controls, so none of the above can pass by everything being zero or by
  // one document carrying the lot.
  const planted = fixture.truth.entities.reduce((sum, entity) => sum + entity.total, 0)
  const documentsWithMentions = fixture.truth.documents.filter((doc) => Object.keys(doc.mentionsByItem ?? {}).length > 0)
  assert(report, planted > 0, `there are placements to check: ${planted} across the project`)
  assert(
    report,
    documentsWithMentions.length >= Math.min(4, fixture.truth.documents.length),
    `they are spread across documents, not heaped in one (${documentsWithMentions.length} documents carry at least one)`
  )
  assert(
    report,
    fixture.truth.entities.every((entity) => entity.documents.every((d) => d.count > 0)),
    'the truth file lists no document against an entity with a count of zero'
  )

  // Matter documents are short and deliberately carry no cast.
  const titlePage = fixture.truth.documents.find((doc) => doc.name === 'Title page')
  assert(
    report,
    !titlePage || Object.keys(titlePage.mentionsByItem ?? {}).length === 0,
    'the title page has no character names in it'
  )
}

// ---- 4. the shapes the stores write --------------------------------------

async function storeShapes(report: TestReport, fixture: Fixture, label: string): Promise<void> {
  section(report, `the shapes the stores write (${label})`)

  const binderPath = join(fixture.root, 'binder.json')
  const before = await read(binderPath)
  openProject(fixture.root)
  const state = await binderStore.getState()

  assert(
    report,
    !existsSync(`${binderPath}.pre-structure`),
    'opening the project writes no .pre-structure sidecar, so nothing migrated'
  )

  // A write that changes nothing, to make the store re-serialize the state it
  // loaded. If the generator's bytes and the store's bytes disagree anywhere —
  // key order, a backfilled field, a dropped one — this is where it shows.
  await binderStore.setLastOpenDocument(state.lastOpenDocumentId)
  const after = await read(binderPath)
  assert(report, before === after, 'binder.json is byte-identical after the store has loaded it and written it back')

  const roots = state.tree ?? []
  const rootIds = roots.map((node) => node.id)
  assert(
    report,
    rootIds.slice(0, 3).join(',') === 'structural-draft,structural-notes,structural-matter',
    `Draft, Notes and Matter are the first three root folders (got ${rootIds.slice(0, 3).join(',')})`
  )
  assert(
    report,
    rootIds.slice(-2).join(',') === 'structural-archive,structural-trash',
    `Archive and Trash are the last two (got ${rootIds.slice(-2).join(',')})`
  )

  const custom = roots.filter((node) => node.type === 'folder' && (node as { isTopLevel?: boolean }).isTopLevel)
  if (label === 'realistic') {
    assert(report, custom.length === 1 && rootIds.indexOf(custom[0].id) === 3, `the writer's own folder sits between Matter and Archive (${custom.length} of them)`)
    assert(report, custom[0]?.name === 'Planning', `and keeps its name (${custom[0]?.name})`)
  }

  const treeDocumentIds = documentIdsOf(state.tree)
  const truthIds = fixture.truth.documents.map((doc) => doc.id)
  assert(
    report,
    treeDocumentIds.length === truthIds.length && [...treeDocumentIds].sort().join(',') === [...truthIds].sort().join(','),
    `the tree holds exactly the ${truthIds.length} documents the truth file names (${treeDocumentIds.length} in the tree)`
  )
  assert(report, new Set(treeDocumentIds).size === treeDocumentIds.length, 'no id appears twice')

  // Every field normalizeTree would otherwise backfill is already in the file.
  const raw = JSON.parse(before)
  const rawDocuments = allNodes(raw?.tree).filter((node) => node.type === 'document') as unknown as Array<
    Record<string, unknown>
  >
  const missing = rawDocuments.filter(
    (node) =>
      typeof node.synopsis !== 'string' ||
      typeof node.notes !== 'string' ||
      !('statusId' in node) ||
      !Array.isArray(node.tagIds) ||
      !('wordTarget' in node) ||
      !('chapterNumber' in node)
  )
  assert(report, missing.length === 0, `every document node is written with all six metadata fields (${missing.length} short of them)`)

  const onDisk = (await listFiles(join(fixture.root, 'documents'))).map((path) => path.replace(/\.html$/, ''))
  assert(
    report,
    onDisk.length === truthIds.length && onDisk.every((id) => truthIds.includes(id)),
    `documents/ holds one file per document node and nothing else (${onDisk.length} files, ${truthIds.length} nodes)`
  )
}

// ---- 5. the span-tag index -----------------------------------------------

async function spanTagIndex(report: TestReport, fixture: Fixture, label: string): Promise<void> {
  section(report, `the span-tag index (${label})`)

  openProject(fixture.root)
  const filePath = join(fixture.root, 'spanTags.json')
  const before = await read(filePath)
  const listed = await listSpans()
  assert(
    report,
    listed.length === fixture.truth.totals.spanTags,
    `the store reads back the ${fixture.truth.totals.spanTags} spans the generator wrote (got ${listed.length})`
  )
  assert(
    report,
    JSON.stringify(listed) === JSON.stringify(fixture.truth.spanTags),
    'and they are the same records, in the same order, as the truth file'
  )

  const documentsWithSpans = fixture.truth.documents.filter((doc) => doc.spanTagIds.length > 0)
  assert(report, documentsWithSpans.length > 0, `the spans are in documents: ${documentsWithSpans.length} of them carry at least one`)

  // spanTagStore derives this index from each document's HTML on every save.
  // Rebuilding all of them has to reproduce the generated file exactly, or the
  // fixture's index is a fiction that the first save would correct.
  for (const doc of fixture.truth.documents) {
    const html = existsSync(join(fixture.root, doc.path)) ? await read(join(fixture.root, doc.path)) : ''
    await rebuildForDocument(doc.id, html)
  }
  const after = await read(filePath)
  assert(report, before === after, 'rebuilding every document from its own HTML writes the same index, byte for byte')

  const longest = fixture.truth.spanTags.reduce((max, span) => Math.max(max, span.snippet.length), 0)
  note(report, `longest span snippet: ${longest} characters`)
  if (label === 'realistic') {
    // The generator mirrors spanTagStore's truncation rule, so the fixture has
    // to contain a snippet long enough for that rule to bite — otherwise the
    // byte-identical rebuild above only ever proves the short case.
    const truncated = fixture.truth.spanTags.filter((span) => span.snippet.endsWith('…'))
    assert(report, truncated.length > 0, `at least one snippet is long enough to be truncated at 120 characters (${truncated.length} are)`)
  }
}

// ---- 6. the story bible ---------------------------------------------------

async function storyBible(report: TestReport, fixture: Fixture, label: string): Promise<void> {
  section(report, `the story bible (${label})`)

  openProject(fixture.root)
  const state = await storyBibleStore.getState()
  assert(
    report,
    state.items.length === fixture.truth.entities.length,
    `the index loads all ${fixture.truth.entities.length} items (got ${state.items.length})`
  )
  assert(
    report,
    state.items.map((item) => `${item.id}:${item.name}:${item.aliases.join('/')}`).join('|') ===
      fixture.truth.entities.map((entity) => `${entity.id}:${entity.name}:${entity.aliases.join('/')}`).join('|'),
    'with the ids, names and aliases the truth file promises, in the same order'
  )
  assert(
    report,
    JSON.stringify(state.types) === JSON.stringify(DEFAULT_STORY_BIBLE_TYPES),
    'and the app-default item types, unaltered'
  )

  const first = fixture.truth.entities[0]
  const sheet = first ? await getSheet(first.id) : { itemId: '', blocks: [] }
  assert(
    report,
    sheet.blocks.length === 3 && sheet.blocks.map((block) => block.kind).join(',') === 'text,stats,list',
    `an item's sheet loads through the store with its three blocks (got ${sheet.blocks.map((b) => b.kind).join(',')})`
  )
  const sheetRaw = first ? JSON.parse(await read(join(fixture.root, 'storybible', 'sheets', `${first.id}.json`))) : {}
  assert(
    report,
    sheetRaw.version === 1 && sheetRaw.itemId === first?.id && Array.isArray(sheetRaw.blocks),
    "a sheet file has saveSheet's own shape: version, itemId, blocks"
  )
  const sheetFiles = await listFiles(join(fixture.root, 'storybible', 'sheets'))
  assert(report, sheetFiles.length === fixture.truth.entities.length, `there is one sheet per item (${sheetFiles.length})`)
}

// ---- 7. the constants the generator keeps its own copy of -----------------

function copiedConstants(report: TestReport): void {
  section(report, 'the constants the generator copies')

  assert(
    report,
    JSON.stringify(GENERATOR_STATUSES) === JSON.stringify(DEFAULT_STATUSES),
    'the generator\'s status list is still DEFAULT_STATUSES'
  )
  assert(
    report,
    JSON.stringify(GENERATOR_TYPES) === JSON.stringify(DEFAULT_STORY_BIBLE_TYPES),
    'its Story Bible types are still DEFAULT_STORY_BIBLE_TYPES'
  )
  assert(
    report,
    GENERATOR_STRUCTURAL.map((folder) => `${folder.id}:${folder.name}`).join('|') ===
      STRUCTURAL_FOLDERS.map((folder) => `${folder.id}:${folder.name}`).join('|'),
    'and its five structural folders are the app\'s, with the same ids, names and order'
  )
}

// ---- entry point ----------------------------------------------------------

async function run(report: TestReport): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'chapterflow-generator-test-'))
  setProjectRoot(parent)
  try {
    copiedConstants(report)
    try {
      await determinism(report, parent)
    } catch (error) {
      assert(report, false, `the determinism section threw: ${String((error as Error)?.message ?? error)}`)
    }

    // One shape's sections must not be able to carry off the other's. The
    // generator fails loudly rather than writing a fixture it cannot stand
    // behind, and a throw from inside one shape would otherwise abandon every
    // section after it — the defect 2026-09-11 and 2026-09-12 both found in
    // their own suites.
    for (const shape of ['small', 'realistic']) {
      try {
        const fixture = await build(parent, shape, `${shape}-checked`)
        await plantedWordCounts(report, fixture, shape)
        await plantedEntities(report, fixture, shape)
        await storeShapes(report, fixture, shape)
        await spanTagIndex(report, fixture, shape)
        await storyBible(report, fixture, shape)
        note(report, `${shape}: ${fixture.truth.totals.documents} documents, ${fixture.truth.totals.words} words`)
      } catch (error) {
        section(report, `the ${shape} shape`)
        assert(report, false, `the ${shape} fixture could not be built or checked: ${String((error as Error)?.message ?? error)}`)
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

app.on('window-all-closed', () => {})

app.whenReady().then(() => void main())
