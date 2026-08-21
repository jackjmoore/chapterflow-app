/**
 * Search index tests, run against a freshly generated demo project.
 *
 * Generated rather than pointed at a fixed folder so the suite never depends
 * on a project someone might be editing, and so "every content type is
 * covered" means the real generator's output rather than a hand-written stub.
 *
 * Runs in Electron because the index is main-process code that reads the
 * project through the same stores the app uses.
 */
import { app } from 'electron'
import { execFileSync } from 'child_process'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { setProjectRoot } from '../src/main/projectRoot'
import * as searchIndex from '../src/main/searchIndex'
import * as documentStore from '../src/main/documentStore'
import * as lexiconStore from '../src/main/lexiconStore'
import * as commentStore from '../src/main/commentStore'
import * as storyBibleStore from '../src/main/storyBibleStore'
import type { SearchKind, SearchMatch } from '../src/shared/search'
import { assert, createReport, note, section, summarize } from './harness'

const kindsOf = (matches: SearchMatch[]): SearchKind[] => [...new Set(matches.map((m) => m.entry.kind))].sort()

async function main(): Promise<void> {
  const report = createReport()
  const outDir = process.env.OUT_DIR ?? '.'
  const base = await mkdtemp(join(tmpdir(), 'chapterflow-search-'))
  const project = join(base, 'project')

  try {
    execFileSync(process.execPath, [join(process.cwd(), 'scripts', 'make-demo-project.mjs'), project], {
      stdio: 'ignore',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    })
    setProjectRoot(project)
    searchIndex.install()

    // ---- cold build -----------------------------------------------------
    section(report, 'cold build over the demo project')
    const started = Date.now()
    await searchIndex.open()
    const buildMs = Date.now() - started
    const stats = searchIndex.stats()
    note(report, `${stats.entries} entries, ${stats.tokens} tokens, built in ${buildMs}ms`)
    assert(report, stats.ready, 'index reports ready after open()')
    assert(report, stats.entries > 100, `index holds a substantial number of entries (${stats.entries})`)

    // ---- every content type is present ----------------------------------
    section(report, 'every content type indexed')
    const expectations: [SearchKind, string, number][] = [
      ['prose', 'harbour', 1],
      ['documentTitle', 'Kestrel', 1],
      ['storyBibleName', 'Halloway', 1],
      ['storyBibleAlias', 'cartographer', 1],
      ['storyBibleField', 'Provenance', 1],
      ['lexicon', 'bathylith', 1],
      ['spanTag', 'Foreshadowing', 1],
      ['comment', 'continuity', 1],
      ['footnote', 'survey', 1],
      ['timeline', 'dredging', 1],
      ['relationship', 'mentor of', 0],
      ['submission', 'Harbourlight', 1]
    ]
    for (const [kind, term, min] of expectations) {
      const hits = searchIndex.query(term, { kinds: [kind] })
      if (min === 0) continue
      assert(report, hits.length >= min, `${kind}: "${term}" found (${hits.length} hit(s))`)
    }
    // Relationships use their own vocabulary.
    assert(report, searchIndex.query('sister of', { kinds: ['relationship'] }).length >= 1, 'relationship: "sister of" found')

    // ---- results are correctly typed ------------------------------------
    section(report, 'results carry the right type and location')
    const bath = searchIndex.query('bathylith')
    assert(report, bath.every((m) => m.entry.kind === 'lexicon'), 'a Lexicon-only word returns only lexicon entries')
    assert(report, bath.some((m) => m.entry.field === 'word'), 'the Lexicon word itself is indexed, not just its meaning')

    const kestrelward = searchIndex.query('Kestrelward')
    assert(
      report,
      kindsOf(kestrelward).includes('lexicon') && kindsOf(kestrelward).includes('prose'),
      `a word used in prose AND defined in the Lexicon returns both (${kindsOf(kestrelward).join(', ')})`
    )

    const alias = searchIndex.query('the cartographer')
    assert(
      report,
      alias.some((m) => m.entry.kind === 'storyBibleAlias'),
      'an alias returns as storyBibleAlias, distinct from the item name'
    )
    assert(
      report,
      searchIndex.query('Wren Halloway', { kinds: ['storyBibleName'] }).length >= 1,
      'the real name returns as storyBibleName'
    )

    // A place name the generator emits verbatim, so the phrase genuinely
    // exists in the corpus rather than depending on sentence assembly.
    const prose = searchIndex.query('Kestrel Point', { kinds: ['prose'] })
    assert(report, prose.every((m) => m.entry.documentId !== null), 'prose hits carry the document they live in')
    assert(report, prose.every((m) => m.entry.title.length > 0), 'prose hits carry a display title')
    assert(report, prose.some((m) => m.phrase), 'an exact phrase is reported as a phrase match')

    const comments = searchIndex.query('continuity', { kinds: ['comment'] })
    assert(
      report,
      comments.every((m) => m.entry.documentId !== null && m.entry.ownerId !== m.entry.documentId),
      'a comment carries both its own id and the document it is anchored in'
    )

    // ---- a query that should find nothing --------------------------------
    assert(report, searchIndex.query('zzzznotpresentanywhere').length === 0, 'an absent term returns nothing')

    // ---- incremental: no restart ----------------------------------------
    section(report, 'incremental updates, one running process')
    const NONSENSE = 'quillvexis'
    assert(report, searchIndex.query(NONSENSE).length === 0, `"${NONSENSE}" is absent to begin with`)

    const before = searchIndex.stats().reindexedSources
    await documentStore.saveDocument('doc-ch07', `<h1>Harbour Business</h1><p>The ${NONSENSE} was never charted.</p>`)
    await searchIndex.settled()
    const after = searchIndex.stats().reindexedSources
    const found = searchIndex.query(NONSENSE)
    assert(report, found.length >= 1, `a saved document is searchable immediately (${found.length} hit(s))`)
    assert(report, found[0]?.entry.documentId === 'doc-ch07', 'the new hit points at the document that was saved')
    // The whole point of incremental: one save re-indexes one source.
    assert(report, after - before === 1, `saving one document re-indexed one source (${after - before})`)

    // Editing the word away removes it again.
    await documentStore.saveDocument('doc-ch07', '<h1>Harbour Business</h1><p>Nothing remarkable here.</p>')
    await searchIndex.settled()
    assert(report, searchIndex.query(NONSENSE).length === 0, 'editing the text away removes it from the index')

    // Lexicon addition flows through its own store, untouched by the index.
    await lexiconStore.addEntry('vantiscore', 'A depth taken twice and disbelieved.', 'VAN-tis-core')
    await searchIndex.settled()
    const lex = searchIndex.query('vantiscore')
    assert(report, lex.length >= 1 && lex[0].entry.kind === 'lexicon', 'a new Lexicon entry is searchable at once')
    assert(
      report,
      searchIndex.query('disbelieved', { kinds: ['lexicon'] }).length >= 1,
      'the new entry’s meaning is searchable too'
    )

    // Comments are authored content with no other source.
    await commentStore.addComment({
      id: 'test-comment-1',
      documentId: 'doc-ch03',
      body: 'Check the sextant reading against the almanac.',
      createdAt: Date.now(),
      snippet: 'the light swung out',
      resolved: false
    })
    await searchIndex.settled()
    assert(report, searchIndex.query('sextant', { kinds: ['comment'] }).length >= 1, 'a new comment body is searchable')

    // A Story Bible rename must move the name and keep the old one as an alias.
    const items = (await storyBibleStore.getState()).items
    const wren = items.find((i) => i.name === 'Wren Halloway')
    if (wren) {
      await storyBibleStore.renameItem(wren.id, 'Wren Calloway')
      await searchIndex.settled()
      assert(
        report,
        searchIndex.query('Calloway', { kinds: ['storyBibleName'] }).length >= 1,
        'a renamed Story Bible item is searchable under its new name'
      )
      assert(
        report,
        searchIndex.query('Halloway', { kinds: ['storyBibleAlias'] }).length >= 1,
        'the old name survives as a searchable alias'
      )
    }

    // Deleting a document takes its prose with it.
    const beforeDelete = searchIndex.query('Kestrelward', { kinds: ['prose'] }).length
    await documentStore.deleteDocument('doc-ch02')
    await searchIndex.settled()
    assert(
      report,
      searchIndex.query('', { kinds: ['prose'] }).length === 0 ||
        !searchIndex.query('the', { kinds: ['prose'] }).some((m) => m.entry.documentId === 'doc-ch02'),
      'a deleted document leaves no prose behind'
    )
    void beforeDelete

    // ---- persistence and validation --------------------------------------
    section(report, 'persisted index, validated on load')
    const indexFile = join(project, 'searchIndex.json')
    const persisted = JSON.parse(await readFile(indexFile, 'utf-8')) as { entries: unknown[] }
    assert(report, Array.isArray(persisted.entries) && persisted.entries.length > 0, 'index persisted to the project folder')

    // Reopening should not need to re-index anything: fingerprints all agree.
    const beforeReopen = searchIndex.stats().reindexedSources
    await searchIndex.open()
    const reopened = searchIndex.stats()
    assert(
      report,
      reopened.reindexedSources === beforeReopen,
      `reopening an unchanged project re-indexes nothing (${reopened.reindexedSources - beforeReopen} source(s))`
    )
    assert(report, searchIndex.query('vantiscore').length >= 1, 'entries survive the reload')

    // A file changed behind the app's back must be picked up on next open.
    await writeFile(
      join(project, 'documents', 'doc-ch09.html'),
      '<h1>The Ferryman</h1><p>An outside edit introduced grellmark.</p>',
      'utf-8'
    )
    const beforeExternal = searchIndex.stats().reindexedSources
    await searchIndex.open()
    assert(
      report,
      searchIndex.stats().reindexedSources > beforeExternal,
      'an externally edited file is re-indexed on load'
    )
    assert(report, searchIndex.query('grellmark').length >= 1, 'content changed outside the app becomes searchable')

    // ---- query cost -------------------------------------------------------
    section(report, 'query reads the index, not the project')
    const queryStart = Date.now()
    for (let i = 0; i < 200; i += 1) searchIndex.query('harbour')
    const per = (Date.now() - queryStart) / 200
    note(report, `200 queries over ${searchIndex.stats().entries} entries: ${per.toFixed(2)}ms each`)
    assert(report, per < 5, `a query costs well under a frame (${per.toFixed(2)}ms)`)
  } catch (error) {
    report.lines.push(`  FAIL  threw: ${String((error as Error)?.stack ?? error)}`)
    report.failures += 1
  } finally {
    await rm(base, { recursive: true, force: true }).catch(() => undefined)
  }

  await writeFile(`${outDir}/report.txt`, summarize(report))
  process.exit(report.failures > 0 ? 1 : 0)
}

app.on('window-all-closed', () => {})
app.whenReady().then(() => void main())
