/**
 * Ranking and query-handling tests, run against a freshly generated demo
 * project so the vocabulary is real: 40 chapters, ~1,070 distinct words, a
 * long tail of words used once or twice, and Story Bible names that also occur
 * heavily in the prose.
 *
 * That overlap is the point. A name like "Wren Halloway" appears both as a
 * character's own sheet and 126 times in the manuscript, and the whole reason
 * for tiers is that those are not the same kind of result.
 */
import { app } from 'electron'
import { execFileSync } from 'child_process'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { setProjectRoot } from '../src/main/projectRoot'
import * as searchIndex from '../src/main/searchIndex'
import * as searchRank from '../src/main/searchRank'
import * as searchHistoryStore from '../src/main/searchHistoryStore'
import type { RankedMatch, SearchTier } from '../src/shared/search'
import { assert, createReport, note, section, summarize } from './harness'

const tiersIn = (matches: RankedMatch[]): SearchTier[] => [...new Set(matches.map((m) => m.tier))].sort()
const inTier = (matches: RankedMatch[], tier: SearchTier): RankedMatch[] => matches.filter((m) => m.tier === tier)

async function main(): Promise<void> {
  const report = createReport()
  const outDir = process.env.OUT_DIR ?? '.'
  const base = await mkdtemp(join(tmpdir(), 'chapterflow-rank-'))
  const project = join(base, 'project')

  try {
    execFileSync(process.execPath, [join(process.cwd(), 'scripts', 'make-demo-project.mjs'), project], {
      stdio: 'ignore',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    })
    setProjectRoot(project)
    searchIndex.install()
    await searchIndex.open()

    // ---- the rule list is an ordered list ---------------------------------
    section(report, 'the tier rules read as an ordered list')
    const names = searchRank.tierNames()
    note(report, names.join('  |  '))
    assert(report, names.length === 6, `six rules, in order (${names.length})`)
    assert(
      report,
      names[0].startsWith('1.') && names[5].startsWith('6.'),
      'rules are numbered 1..6 in declaration order'
    )
    assert(report, names[2] === '3. Documents', `documents have a tier of their own ("${names[2]}")`)

    // ---- recency is actually on the entries -------------------------------
    section(report, 'entries carry edit recency')
    const anyName = searchRank.search('Wren Halloway').matches
    assert(report, anyName.every((m) => m.entry.updatedAt > 0), 'every ranked entry has a non-zero updatedAt')
    const proseEntry = anyName.find((m) => m.entry.kind === 'prose')
    // Every Story Bible item lives in one file. If entries took the file's
    // mtime, all sixteen would carry the same timestamp and recency would be
    // useless as a tiebreaker between them.
    const allItems = new Set(
      searchIndex
        .query('a')
        .filter((m) => m.entry.kind === 'storyBibleName')
        .map((m) => m.entry.updatedAt)
    )
    assert(
      report,
      allItems.size > 1,
      `Story Bible items keep their own dates rather than sharing the file's mtime (${allItems.size} distinct)`
    )
    assert(
      report,
      !!proseEntry && Math.abs(proseEntry.entry.updatedAt - Date.now()) < 5 * 60 * 1000,
      'a document with no record-level date falls back to its file mtime'
    )

    // ---- the headline case: a name vs mentions of that name ---------------
    section(report, 'a Story Bible name outranks prose mentions of it, in a different tier')
    const wren = searchRank.search('Wren Halloway')
    note(report, `${wren.matches.length} results, tiers ${tiersIn(wren.matches).join('/')}`)
    assert(report, wren.matches[0].tier === 1, `the first result is tier 1 (${wren.matches[0].tier})`)
    assert(
      report,
      wren.matches[0].entry.kind === 'storyBibleName',
      `and it is the item's own sheet (${wren.matches[0].entry.kind})`
    )
    assert(report, wren.matches[0].tierName === 'Exact match', `it reports its own tier name ("${wren.matches[0].tierName}")`)

    const wrenProse = inTier(wren.matches, 6)
    assert(report, wrenProse.length > 0, `prose mentions are present (${wrenProse.length} chapters)`)
    assert(report, wrenProse.every((m) => m.entry.kind === 'prose'), 'tier 6 holds nothing but prose')
    assert(
      report,
      inTier(wren.matches, 1).every((m) => m.entry.kind !== 'prose'),
      'no prose has leaked into tier 1'
    )
    assert(
      report,
      wren.matches.findIndex((m) => m.tier === 6) > wren.matches.findIndex((m) => m.tier === 1),
      'every tier-1 result sorts ahead of every tier-6 result'
    )

    // ---- aliases reach tier 1 too -----------------------------------------
    section(report, 'aliases are names as well')
    const carto = searchRank.search('the cartographer')
    assert(report, carto.matches[0].tier === 1, `an exact alias is tier 1 (${carto.matches[0].tier})`)
    assert(
      report,
      carto.matches[0].entry.kind === 'storyBibleAlias' && carto.matches[0].entry.title === 'Wren Halloway',
      'and resolves to the item it belongs to'
    )

    // ---- partial names: tier 2, boundary-anchored prefix ------------------
    section(report, 'a partly-typed name reaches its item without dragging in prose')
    const partial = searchRank.search('Wre')
    const partialTiers = tiersIn(partial.matches)
    note(report, `"Wre" -> ${partial.matches.length} results, tiers ${partialTiers.join('/')}`)
    assert(report, inTier(partial.matches, 2).length > 0, 'a prefix of a name lands in tier 2')
    assert(
      report,
      inTier(partial.matches, 2).some((m) => m.entry.title === 'Wren Halloway'),
      'Wren Halloway is among them'
    )
    assert(report, inTier(partial.matches, 6).length === 0, 'a partial word returns no prose at all')

    // The prefix is anchored at a word boundary on the left: the "Ral"/"feral"
    // rule, in the form that matters for entity matching.
    const inner = searchRank.search('ren')
    assert(
      report,
      !inner.matches.some((m) => m.entry.title === 'Wren Halloway' && m.tier <= 2),
      '"ren" does not match inside "Wren" — the prefix is boundary-anchored'
    )

    // ---- a short query must not drag in the whole manuscript -------------
    section(report, 'prose needs a real query; names do not')
    for (const short of ['S', 'W', 'ha']) {
      const hits = searchRank.search(short)
      const prose = inTier(hits.matches, 6)
      assert(
        report,
        prose.length === 0,
        `"${short}" (${short.length} char) returns no prose (${prose.length} of ${hits.matches.length})`
      )
    }
    const oneLetter = searchRank.search('W')
    note(report, `"W" -> ${oneLetter.matches.length} results, tiers ${tiersIn(oneLetter.matches).join('/')}`)
    assert(report, oneLetter.matches.length > 0, 'but a single letter still suggests things by name')
    assert(
      report,
      oneLetter.matches.every((m) => m.tier <= 3),
      `and everything it returns is a name or a document (tiers ${tiersIn(oneLetter.matches).join('/')})`
    )
    assert(
      report,
      oneLetter.matches.every((m) => m.entry.kind !== 'comment' && m.entry.kind !== 'footnote'),
      'one keystroke does not pull in comments or footnotes either'
    )
    assert(
      report,
      oneLetter.matches.some((m) => m.entry.title === 'Wren Halloway'),
      'typing one letter narrows towards a character'
    )
    // Three characters is where prose is allowed back in.
    assert(report, inTier(searchRank.search('har').matches, 6).length === 0, '"har" is still too short for prose')
    assert(
      report,
      inTier(searchRank.search('harbour').matches, 6).length > 0,
      'a full word returns prose again'
    )

    // ---- documents rank as the thing you named ---------------------------
    section(report, 'a chapter title is a name, not a record')
    const chapter = searchRank.search('Harbour Business')
    const titles = chapter.matches.filter((m) => m.entry.kind === 'documentTitle')
    note(report, `"Harbour Business" -> tiers ${tiersIn(chapter.matches).join('/')}, ${titles.length} title hit(s)`)
    assert(report, titles.length > 0, 'the chapter is found by its own name')
    assert(report, titles.every((m) => m.tier === 3), `and lands in tier 3 (${[...new Set(titles.map((m) => m.tier))].join('/')})`)
    assert(
      report,
      chapter.matches.filter((m) => m.tier === 4).every((m) => m.entry.kind !== 'documentTitle'),
      'no document has been left among the records'
    )
    const firstTitle = chapter.matches.findIndex((m) => m.entry.kind === 'documentTitle')
    const firstRecord = chapter.matches.findIndex((m) => m.tier === 4)
    assert(
      report,
      firstRecord === -1 || firstTitle < firstRecord,
      'documents sort ahead of tags, timeline entries and tracker rows'
    )
    // A partly-typed chapter name works the way a partly-typed character name does.
    const partialTitle = searchRank.search('Harbour Busi')
    assert(
      report,
      partialTitle.matches.some((m) => m.entry.kind === 'documentTitle' && m.tier === 3),
      'a partly-typed chapter name still finds the chapter'
    )

    // ---- word boundaries in prose ----------------------------------------
    section(report, 'prose matching is whole-word')
    const sound = searchRank.search('sound')
    assert(report, inTier(sound.matches, 2).length > 0, '"sound" reaches the Lexicon entry "sounding" as a partial name')
    assert(
      report,
      inTier(sound.matches, 6).length === 0,
      '"sound" matches no prose, because "sounding" is not the word "sound"'
    )
    const sounding = searchRank.search('sounding')
    assert(report, sounding.matches[0].tier === 1, '"sounding" in full is an exact Lexicon match (tier 1)')
    assert(report, inTier(sounding.matches, 6).length > 0, 'and now the prose mentions appear too')

    // ---- a Lexicon word carries its meaning ------------------------------
    section(report, 'a Lexicon word and its meaning')
    const bath = searchRank.search('bathylith')
    assert(report, bath.matches[0].tier === 1, `the word itself is tier 1 (${bath.matches[0].tier})`)
    assert(report, bath.matches[0].entry.kind === 'lexicon', 'and it is the Lexicon entry')
    // The meaning does not contain the word, so it is not itself a match —
    // it rides along on the word's own result, which is what a result row
    // needs in order to be useful without being opened.
    assert(
      report,
      (bath.matches[0].entry.subtitle ?? '').startsWith('A submerged shelf'),
      `the word's result carries its meaning ("${bath.matches[0].entry.subtitle ?? ''}")`
    )
    const wrenRow = searchRank.search('Wren Halloway').matches[0]
    assert(
      report,
      (wrenRow.entry.subtitle ?? '').startsWith('Character · '),
      `a Story Bible result carries its type and summary ("${wrenRow.entry.subtitle ?? ''}")`
    )

    // ---- baseline: full-text search with nothing else involved -----------
    section(report, 'prose-only search from the vocabulary tail')
    const rare = searchRank.search('wainscoted')
    note(report, `"wainscoted" -> ${rare.matches.length} result(s)`)
    assert(report, rare.matches.length > 0, 'a word used once in 20,000 is still found')
    assert(report, rare.matches.every((m) => m.tier === 6), 'and it is prose, in tier 6, with nothing above it')
    assert(report, rare.matches[0].offsets.length > 0, 'the hit carries offsets, so a snippet can be built')
    assert(
      report,
      rare.matches[0].entry.text.slice(rare.matches[0].offsets[0], rare.matches[0].offsets[0] + 10).toLowerCase() ===
        'wainscoted',
      'the offset points at the word itself'
    )

    // ---- tier 5 ordering: occurrences, then recency ----------------------
    section(report, 'tier 6 orders by occurrence count before recency')
    const harbour = inTier(searchRank.search('harbour').matches, 6)
    note(report, `"harbour" -> ${harbour.length} chapters, top counts ${harbour.slice(0, 5).map((m) => m.occurrences).join(', ')}`)
    assert(report, harbour.length > 3, `enough chapters to order (${harbour.length})`)
    let descending = true
    for (let i = 1; i < harbour.length; i += 1) {
      if (harbour[i].occurrences > harbour[i - 1].occurrences) descending = false
    }
    assert(report, descending, 'occurrence counts never increase down the list')
    assert(report, harbour[0].occurrences > 1, `the top chapter mentions it more than once (${harbour[0].occurrences})`)
    // The case that motivated this: the most recently edited chapter is not
    // automatically first.
    const mostRecent = [...harbour].sort((a, b) => b.entry.updatedAt - a.entry.updatedAt)[0]
    assert(
      report,
      harbour[0].occurrences >= mostRecent.occurrences,
      'the top result is not merely the most recently edited chapter'
    )

    // ---- multi-word: AND, with phrase preferred inside a tier ------------
    section(report, 'multi-word queries are AND, with contiguous matches first')
    const twoWord = searchRank.search('Kestrel Point')
    const twoWordProse = inTier(twoWord.matches, 6)
    assert(report, twoWordProse.length > 0, `"Kestrel Point" finds prose (${twoWordProse.length})`)
    assert(
      report,
      twoWordProse.every((m) => /\bkestrel\b/i.test(m.entry.text) && /\bpoint\b/i.test(m.entry.text)),
      'every prose hit contains both words — AND, not OR'
    )
    const firstScattered = twoWordProse.findIndex((m) => !m.phrase)
    const lastPhrase = twoWordProse.map((m) => m.phrase).lastIndexOf(true)
    assert(
      report,
      firstScattered === -1 || lastPhrase === -1 || lastPhrase < firstScattered,
      'contiguous phrase matches sort ahead of scattered ones within the tier'
    )
    assert(
      report,
      searchRank.search('Kestrel zzzznotpresent').matches.length === 0,
      'one absent term is enough to return nothing — not OR'
    )

    // ---- filtering by kind still works -----------------------------------
    section(report, 'kind filters')
    const filtered = searchRank.search('harbour', { kinds: ['prose'] })
    assert(report, filtered.matches.every((m) => m.entry.kind === 'prose'), 'a kind filter is honoured')
    assert(
      report,
      filtered.matches.length < searchRank.search('harbour').matches.length,
      'and narrows the result set'
    )

    // ---- limit is applied after ranking, not before ----------------------
    section(report, 'truncation happens after ranking')
    const limited = searchRank.search('harbour', { limit: 3 })
    assert(report, limited.matches.length === 3, 'limit is respected')
    assert(report, limited.truncated, 'and reported as truncated')
    assert(
      report,
      limited.matches[0].entry.id === searchRank.search('harbour').matches[0].entry.id,
      'the top result is the same as it would be unlimited — the cut is after ranking'
    )

    // ---- an absent term --------------------------------------------------
    assert(report, searchRank.search('zzzznotpresentanywhere').matches.length === 0, 'an absent term returns nothing')
    assert(report, searchRank.search('   ').matches.length === 0, 'a blank query returns nothing')

    // ---- recent searches -------------------------------------------------
    section(report, 'recent searches persist, dedupe and clear')
    assert(report, (await searchHistoryStore.list()).length === 0, 'history starts empty')

    await searchHistoryStore.record('harbour')
    await searchHistoryStore.record('Wren Halloway')
    await searchHistoryStore.record('bathylith')
    let history = await searchHistoryStore.list()
    assert(report, history.length === 3, `three searches recorded (${history.length})`)
    assert(report, history[0].query === 'bathylith', 'most recent first')

    await searchHistoryStore.record('HARBOUR')
    history = await searchHistoryStore.list()
    assert(report, history.length === 3, `repeating a search does not duplicate it (${history.length})`)
    assert(report, history[0].query === 'HARBOUR', 'it moves to the top, stored as it was typed')

    await searchHistoryStore.record('  ')
    assert(report, (await searchHistoryStore.list()).length === 3, 'a blank search is not recorded')

    for (let i = 0; i < 60; i += 1) await searchHistoryStore.record(`query number ${i}`)
    assert(report, (await searchHistoryStore.list()).length === 50, 'the list is capped at 50')

    // Persistence is the file, not the process: read it back cold.
    const reloaded = await searchHistoryStore.list()
    assert(report, reloaded[0].query === 'query number 59', 'history survives being read back from disk')
    assert(report, reloaded[0].at > 0, 'each entry carries a timestamp')

    await searchHistoryStore.clear()
    assert(report, (await searchHistoryStore.list()).length === 0, 'clearing empties the list')

    // Recording a search must not make the index reindex — searchHistory.json
    // is deliberately not a source. If it were, every search would reindex.
    const before = searchIndex.stats().reindexedSources
    await searchHistoryStore.record('a search that must not be indexed')
    await searchIndex.settled()
    assert(
      report,
      searchIndex.stats().reindexedSources === before,
      'recording a search re-indexes nothing'
    )
    assert(
      report,
      searchRank.search('must not be indexed').matches.length === 0,
      'and the search history is not itself searchable'
    )
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
