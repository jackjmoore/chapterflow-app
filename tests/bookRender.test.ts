/**
 * The book renderer end to end, against a real temp project in a real
 * Electron main process: the page map is the primary test surface (the
 * assembler's own decisions — parity, blanks, folio sequences), and the
 * bytes are then checked against it (page count, /PageLabels, outline,
 * mirrored MediaBox gutter, stamped header text). What no byte check can
 * prove — optical drop, hyphenation, stamp positions — is the visual pass
 * in SPEC.md, not this file.
 */
import { app } from 'electron'
import { mkdtemp, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { inflateSync } from 'zlib'
import { PDFDocument } from 'pdf-lib'
import { setProjectRoot } from '../src/main/projectRoot'
import * as binderStore from '../src/main/binderStore'
import * as documentStore from '../src/main/documentStore'
import { createFrontMatter, createBackMatter } from '../src/main/templates'
import { validateCompileScope } from '../src/main/compile/validate'
import { htmlToBlocks } from '../src/main/export/htmlToBlocks'
import { renderBookPdf, type BookPageMapEntry } from '../src/main/export/bookPdf'
import { planBook, BOOK_TRIMS } from '../src/shared/book'
import { draftChildren, matterFolder } from '../src/shared/binder'
import { assert, createReport, note, section, summarize, type TestReport } from './harness'

function streamsText(buffer: Buffer): string {
  const raw = buffer.toString('latin1')
  const parts: string[] = [raw]
  let index = 0
  while (true) {
    const start = buffer.indexOf('stream', index)
    if (start === -1) break
    let dataStart = start + 'stream'.length
    if (buffer[dataStart] === 0x0d) dataStart += 1
    if (buffer[dataStart] === 0x0a) dataStart += 1
    const end = buffer.indexOf('endstream', dataStart)
    if (end === -1) break
    try {
      parts.push(inflateSync(buffer.subarray(dataStart, end)).toString('latin1'))
    } catch {
      // Not inflatable — the raw text already covers it.
    }
    index = end + 'endstream'.length
  }
  return parts.join('\n')
}

async function run(report: TestReport, outDir: string): Promise<void> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'chapterflow-book-test-'))
  setProjectRoot(projectRoot)
  binderStore.invalidateCache()

  await binderStore.setProjectName('The Long Winter')
  await binderStore.setAuthorName('Jane Marlowe')

  const part = await binderStore.createFolder(null, 'Part One')
  await binderStore.setFolderIsPart(part.id, true)
  const ch1 = await binderStore.createDocument(part.id, 'The Lamplighter')
  await binderStore.setChapterNumber(ch1.id, 1)
  // Long enough to overflow its opening page on a 5×8 trim — the suite needs
  // plain body pages to check running headers and the mirrored gutter.
  const filler = Array.from(
    { length: 30 },
    (_, i) => `<p>Paragraph ${i + 1} of the chapter carries on for long enough that the chapter cannot fit on its opening page, which is what puts ordinary body pages into the sample.</p>`
  ).join('')
  await documentStore.saveDocument(
    ch1.id,
    '<p>The lamp guttered and went out, and for a while nobody moved in the long room.</p>' +
      '<p>The second paragraph follows close-set, separated by its indent alone.</p>' +
      '<p>***</p>' +
      '<p>After the scene break the paragraph opens flush left again.</p>' +
      filler
  )
  const sceneFolder = await binderStore.createFolder(part.id, 'The Storm')
  const sceneA = await binderStore.createDocument(sceneFolder.id, 'Scene A')
  await documentStore.saveDocument(sceneA.id, '<p>The storm came up the valley an hour before dark.</p>')
  const sceneB = await binderStore.createDocument(sceneFolder.id, 'Scene B')
  await documentStore.saveDocument(sceneB.id, '<p>By morning the road had washed out below the mill.</p>')

  const epilogue = await binderStore.createDocument(null, 'Epilogue')
  await documentStore.saveDocument(
    epilogue.id,
    '<p>Afterwards, the town rebuilt.</p><div data-chapter-break="true"></div><p>The lamps were electric now.</p>'
  )

  const frontId = await createFrontMatter()
  const preface = await binderStore.createDocument(frontId, 'Preface')
  await documentStore.saveDocument(preface.id, '<p>A word before the story begins.</p>')
  const backId = await createBackMatter()

  section(report, 'validation, book preset')
  const validation = await validateCompileScope({ mode: 'all' }, 'book')
  const bookFindings = validation.findings.filter((f) => f.kind.startsWith('book-'))
  assert(
    report,
    bookFindings.length === 1 && bookFindings[0].kind === 'book-structure',
    `the inline chapter break is the one book finding (got ${bookFindings.map((f) => f.kind).join(', ') || 'none'})`
  )
  assert(
    report,
    !validation.findings.some((f) => f.kind === 'book-front-matter'),
    'four-document front matter satisfies the display-page expectation'
  )

  section(report, 'plan')
  const state = await binderStore.getState()
  const matter = matterFolder(state.tree)
  const matterItems = matter ? matter.children : []
  const plan = planBook(
    draftChildren(state.tree),
    matterItems.filter((n) => n.id !== backId),
    matterItems.filter((n) => n.id === backId)
  )
  assert(report, plan.frontDisplayIds.length === 4 && plan.frontTextIds.length === 1, 'half title through dedication are display pages; the preface is a text page')
  assert(report, plan.body.length === 2, 'one part plus the epilogue')

  section(report, 'page map')
  const trim = 'trim5x8'
  const render = await renderBookPdf(
    plan,
    async (id) => htmlToBlocks(await documentStore.loadDocument(id)),
    {
      trim,
      title: 'The Long Winter',
      authorName: 'Jane Marlowe',
      sceneBreakMark: '* * *',
      includeContents: true,
      imageSources: {}
    }
  )
  const outPath = join(outDir, 'book-regression.pdf')
  await writeFile(outPath, render.output)
  note(report, `wrote ${outPath} (${render.output.length} bytes, ${render.pageMap.length} pages)`)

  const map = render.pageMap
  const byKind = (kind: BookPageMapEntry['kind']): BookPageMapEntry[] => map.filter((e) => e.kind === kind)
  const first = (kind: BookPageMapEntry['kind']): BookPageMapEntry | undefined => byKind(kind)[0]

  assert(report, map[0].kind === 'front-display' && map[0].recto, 'the half title is physical page 1, recto')
  const display = byKind('front-display')
  assert(report, display.length === 4 && display.every((e) => !e.folio.visible && e.folio.sequence === 'roman'), 'all four display pages are blind roman pages')
  assert(report, display[1].recto && !display[2].recto, 'the title page sits recto with the copyright on its verso, no blank between')
  const contents = first('contents')
  assert(report, !!contents && contents.recto && contents.folio.visible && contents.folio.sequence === 'roman', 'the Contents is a recto page with a visible roman folio')
  const text = first('front-text')
  assert(report, !!text && text.folio.visible && text.folio.sequence === 'roman', 'the preface shows a roman folio')

  const partPage = first('part-title')
  assert(report, !!partPage && partPage.folio.sequence === 'arabic' && partPage.folio.number === 1 && !partPage.folio.visible, 'the part-title page is Arabic 1, blind')
  assert(report, !!partPage && partPage.recto, 'the part-title page is recto')
  const openings = byKind('chapter-opening')
  // The Lamplighter, Scene A, Scene B (the grouping folder never merges
  // its documents), and the Epilogue.
  assert(report, openings.length === 4, `four chapter openings (got ${openings.length})`)
  assert(report, openings[0].recto && openings[0].folio.number === 3, 'chapter 1 opens recto on Arabic 3, behind the part title and its blank verso')
  assert(report, openings.every((e) => e.folio.visible), 'chapter openings carry a visible folio (bottom center)')
  assert(report, map[partPage!.physicalIndex + 1].kind === 'blank', 'the part title is backed by a blank verso')

  const back = byKind('back')
  assert(report, back.length >= 2 && back.every((e) => e.folio.sequence === 'arabic' && e.folio.visible), 'back matter continues the visible Arabic sequence')

  // No sequence ever skips: within each region, numbers step by exactly one
  // per physical page, blanks included.
  const arabicStart = map.findIndex((e) => e.folio.sequence === 'arabic')
  let sequencesClean = true
  for (const entry of map) {
    const expected = entry.physicalIndex < arabicStart ? entry.physicalIndex + 1 : entry.physicalIndex - arabicStart + 1
    if (entry.folio.number !== expected) sequencesClean = false
  }
  assert(report, sequencesClean, 'roman and Arabic sequences count every physical page with no skips')
  assert(report, map.every((e) => e.recto === (e.physicalIndex % 2 === 0)), 'parity: odd physical pages are recto throughout')

  section(report, 'bytes against the map')
  assert(report, render.output.subarray(0, 5).toString() === '%PDF-', 'output is a real PDF')
  const loaded = await PDFDocument.load(render.output)
  assert(report, loaded.getPageCount() === map.length, `page count matches the map (${loaded.getPageCount()} vs ${map.length})`)

  const raw = render.output.toString('latin1')
  assert(report, raw.includes('/PageLabels'), '/PageLabels written (viewers show i, ii… then 1, 2…)')
  assert(report, raw.includes('/Outlines'), 'document outline present')
  assert(report, /\/Count 5/.test(raw), 'outline lists the part and all four chapters')

  const shift = ((BOOK_TRIMS[trim].innerIn - BOOK_TRIMS[trim].outerIn) / 2) * 72
  const bodyRecto = map.find((e) => e.kind === 'body' && e.recto)
  const bodyVerso = map.find((e) => e.kind === 'body' && !e.recto)
  assert(report, !!bodyRecto && !!bodyVerso, 'the sample produced both a recto and a verso body page')
  if (bodyRecto && bodyVerso) {
    const rectoBox = loaded.getPage(bodyRecto.physicalIndex).getMediaBox()
    const versoBox = loaded.getPage(bodyVerso.physicalIndex).getMediaBox()
    assert(
      report,
      Math.abs(rectoBox.x + shift) < 0.01 && Math.abs(versoBox.x - shift) < 0.01,
      `gutter: MediaBox origins mirror by ±${shift}pt (got ${rectoBox.x} / ${versoBox.x})`
    )
  }
  const blankPage = map.find((e) => e.kind === 'blank')
  if (blankPage) {
    assert(report, loaded.getPage(blankPage.physicalIndex).getMediaBox().x === 0, 'blank pages are unshifted')
  }

  // pdf-lib hex-encodes stamped text, so the check searches for the WinAnsi
  // hex of the header strings rather than the literals.
  const text2 = streamsText(render.output).toUpperCase()
  const hexOf = (s: string): string => Buffer.from(s, 'latin1').toString('hex').toUpperCase()
  assert(report, text2.includes(hexOf('The Long Winter')), 'the recto running header text is stamped')
  assert(report, text2.includes(hexOf('Jane Marlowe')), 'the verso running header text is stamped')

  // Chapter words only. The fixture's chapters run to roughly a thousand
  // words; front/back matter would add its own recognizable phrases, so the
  // sharper check is the absence of matter text from the plain-text count
  // source — asserted structurally in book.test.ts — and a sane range here.
  assert(report, render.wordCount > 500 && render.wordCount < 2000, `word count covers chapters only (got ${render.wordCount})`)
  assert(report, render.viewHtml.includes('book-chapter-opening') && render.viewHtml.includes('The Lamplighter'), 'viewer HTML carries the book structure')

  section(report, 'continuous document separation')
  // Same plan, 'divider' separation: the part's three chapters flow as one
  // segment and the epilogue as another, so exactly two pages are chapter
  // openings; later openings render in run-on form with the scene marker
  // between documents; and the book runs shorter than the paged render.
  const continuous = await renderBookPdf(
    plan,
    async (id) => htmlToBlocks(await documentStore.loadDocument(id)),
    {
      trim,
      title: 'The Long Winter',
      authorName: 'Jane Marlowe',
      sceneBreakMark: '* * *',
      includeContents: true,
      separation: 'divider',
      imageSources: {}
    }
  )
  const cOpenings = continuous.pageMap.filter((e) => e.kind === 'chapter-opening')
  assert(report, cOpenings.length === 2, `one opening per continuous stretch (got ${cOpenings.length})`)
  assert(report, continuous.pageMap.length < map.length, `the continuous book runs shorter (${continuous.pageMap.length} vs ${map.length} pages)`)
  assert(report, continuous.viewHtml.includes('book-run-on'), 'later openings render in run-on form')
  assert(report, continuous.viewHtml.includes('chf-scene-break'), 'the scene marker separates consecutive documents')
  assert(report, /\/Count 3/.test(continuous.output.toString('latin1')), 'the outline lists the part and one entry per stretch')
}

async function main(): Promise<void> {
  const report = createReport()
  const outDir = process.env.OUT_DIR ?? '.'
  try {
    await run(report, outDir)
  } catch (error) {
    report.lines.push(`  FAIL  threw: ${String((error as Error)?.stack ?? error)}`)
    report.failures += 1
  }
  await writeFile(`${outDir}/report.txt`, summarize(report))
  process.exit(report.failures > 0 ? 1 : 0)
}

app.on('window-all-closed', () => {})
app.whenReady().then(() => void main())
