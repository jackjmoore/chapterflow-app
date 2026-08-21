/**
 * Regression tests for the export block model and the three renderers that
 * can run outside Electron (docx, markdown, plain text).
 *
 * The docx assertions deliberately unzip the produced package and inspect the
 * real OOXML inside it rather than checking that a file was written: a .docx
 * whose footnotes never made it into word/footnotes.xml, or whose footnote
 * part isn't declared in [Content_Types].xml, is a file Word will open with
 * the notes silently missing. Only the XML proves otherwise.
 *
 * The PDF renderer needs a live Electron process and lives in pdf.test.ts.
 */
import { mkdtemp, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import JSZip from 'jszip'
import { htmlToBlocks } from '../src/main/export/htmlToBlocks'
import {
  blocksToDocxParagraphs,
  createFootnoteCollector,
  sectionsToDocxBuffer
} from '../src/main/export/toDocx'
import { numberFootnotes } from '../src/main/export/footnotes'
import { blocksToMarkdown } from '../src/main/export/toMarkdown'
import { blocksToPlainText } from '../src/main/export/toPlainText'
import { blocksToHtml, footnotesToHtml } from '../src/main/export/blocksToHtml'
import { imageSize, fitWithin } from '../src/main/export/imageSize'
import { assert, createReport, note, section, summarize } from './harness'
import { wordsIn, normalizeWord } from '../src/shared/lexicon'

/** Exactly what TipTap serializes for a document using every Insert-menu node. */
const SAMPLE_HTML = [
  '<h1>Chapter One</h1>',
  '<p>The lamp guttered<sup data-footnote="Whale oil, not gas — this is 1841."></sup> and went out.</p>',
  '<div data-chapter-line="true"></div>',
  '<p>She waited a long time in the dark.<sup data-footnote="Compare the opening of ch. 9."></sup></p>',
  '<div data-page-break="true"></div>',
  '<p>Morning came grey.</p>',
  '<div data-chapter-break="true"></div>',
  '<h1>Chapter Two</h1>',
  '<p>A <strong>bold</strong> new day.</p>',
  // A comment anchor must export its text but never its identity.
  '<p>She <span data-comment-id="c1">hesitated</span> at the door.</p>'
].join('')

/** A 1×1 PNG, for the image-dimension reader. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

async function main(): Promise<void> {
  const report = createReport()
  const outDir = await mkdtemp(join(tmpdir(), 'chapterflow-export-test-'))
  const blocks = htmlToBlocks(SAMPLE_HTML)

  section(report, 'block model')
  const kinds = blocks.map((b) => b.kind)
  assert(report, kinds.includes('chapterLine'), 'chapter line parsed out of HTML')
  assert(report, kinds.includes('pageBreak'), 'page break parsed out of HTML')
  assert(report, kinds.includes('chapterBreak'), 'chapter break parsed out of HTML')
  // Regression: node-html-parser returns undefined (not null) for a missing
  // attribute, so a `!== null` test matched every <div> and the first branch
  // of the dispatch swallowed chapter breaks and chapter lines entirely.
  assert(
    report,
    kinds.filter((k) => k === 'pageBreak').length === 1,
    'exactly one page break (dispatch does not swallow other div types)'
  )
  assert(
    report,
    blocks.some((b) => b.runs.some((r) => r.text.includes('hesitated'))),
    'commented text still exports as ordinary text'
  )

  section(report, 'footnote numbering')
  const notes = numberFootnotes(blocks)
  assert(report, notes.length === 2, `two footnotes collected (got ${notes.length})`)
  assert(report, notes[0]?.number === 1 && notes[1]?.number === 2, 'numbered 1,2 in document order')
  assert(report, notes[0]?.text.startsWith('Whale oil'), 'first footnote text preserved')

  section(report, 'docx package')
  const footnotes = createFootnoteCollector()
  const children = blocksToDocxParagraphs(blocks, { footnotes })
  const buffer = await sectionsToDocxBuffer([{ children }], undefined, footnotes)
  const docxPath = join(outDir, 'export-regression.docx')
  await writeFile(docxPath, buffer)
  note(report, `wrote ${docxPath} (${buffer.length} bytes)`)

  const zip = await JSZip.loadAsync(buffer)
  assert(report, Object.keys(zip.files).includes('word/footnotes.xml'), 'package contains word/footnotes.xml')

  const footnotesXml = (await zip.file('word/footnotes.xml')?.async('string')) ?? ''
  assert(report, footnotesXml.includes('Whale oil'), 'footnote 1 text present in footnotes.xml')
  assert(report, footnotesXml.includes('Compare the opening'), 'footnote 2 text present in footnotes.xml')

  const documentXml = (await zip.file('word/document.xml')?.async('string')) ?? ''
  assert(report, documentXml.includes('w:footnoteReference'), 'body carries real w:footnoteReference runs')
  assert(
    report,
    (documentXml.match(/w:footnoteReference/g) ?? []).length === 2,
    'exactly two footnote references in the body'
  )
  // Word reserves ids 0 and 1 for its own separator notes, so real notes must
  // start at 2 — a collision makes Word drop or misnumber them.
  assert(report, !/w:footnoteReference w:id="[01]"/.test(documentXml), 'footnote ids avoid Word-reserved 0 and 1')
  assert(report, documentXml.includes('w:type="page"'), 'page break emitted as a real page-type w:br')
  assert(report, documentXml.includes('w:pBdr'), 'chapter line emitted as a paragraph border')
  assert(report, !documentXml.includes('data-comment-id'), 'comment ids never leak into the manuscript')

  const rels = (await zip.file('word/_rels/document.xml.rels')?.async('string')) ?? ''
  assert(report, rels.includes('footnotes.xml'), 'footnotes part referenced from document rels')

  const contentTypes = (await zip.file('[Content_Types].xml')?.async('string')) ?? ''
  assert(report, contentTypes.includes('footnotes+xml'), 'footnotes content type declared')

  section(report, 'markdown')
  const md = blocksToMarkdown(blocks)
  assert(report, md.includes('[^1]'), 'footnote reference [^1] present')
  assert(report, md.includes('[^1]: Whale oil'), 'footnote definition present')
  assert(report, md.includes('---'), 'chapter line rendered as ---')

  section(report, 'plain text')
  const txt = blocksToPlainText(blocks)
  assert(report, txt.includes('[1]'), 'footnote marker [1] present')
  assert(report, txt.includes('Notes'), 'notes section present')
  assert(report, txt.includes('\f'), 'page break rendered as a form feed')

  section(report, 'pdf input html')
  const html = blocksToHtml(blocks) + footnotesToHtml(notes)
  assert(report, html.includes('chf-chapter-line'), 'chapter line div present')
  assert(report, html.includes('chf-page-break'), 'page break div present')
  assert(report, html.includes('chf-endnotes'), 'endnote section present')
  assert(report, html.includes('chf-fnref-1'), 'footnote backlink anchors present')

  section(report, 'image sizing')
  const size = imageSize(TINY_PNG)
  assert(report, size?.width === 1 && size?.height === 1, 'PNG header dimensions read correctly')
  assert(report, imageSize(Buffer.from('not an image')) === null, 'unrecognized bytes return null, not a throw')
  const fitted = fitWithin({ width: 1200, height: 600 }, 624)
  assert(report, fitted.width === 624 && fitted.height === 312, 'oversized image scales preserving aspect ratio')
  const small = fitWithin({ width: 100, height: 50 }, 624)
  assert(report, small.width === 100 && small.height === 50, 'small image is not stretched up')

  // ---- lexicon word splitting -----------------------------------------
  // Suppression works per word because that is all the spellchecker ever
  // reports; a multi-word name has to contribute each of its words.
  section(report, 'lexicon word splitting')
  const split = wordsIn('Anna-Maria de Vries')
  assert(
    report,
    JSON.stringify(split) === JSON.stringify(['Anna-Maria', 'de', 'Vries']),
    `a multi-word name splits into its checkable words (got ${JSON.stringify(split)})`
  )
  assert(report, wordsIn('Kae’lith').length === 1, 'an apostrophe stays inside the word')
  assert(report, wordsIn('a b').length === 0, 'single letters are not worth suppressing')
  assert(report, normalizeWord('  Wren ') === 'wren', 'matching is case-insensitive and trimmed')

  console.log(summarize(report))
  if (report.failures > 0) process.exitCode = 1
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
