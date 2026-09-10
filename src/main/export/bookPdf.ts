import { BrowserWindow } from 'electron'
import { hyphenateSync } from 'hyphen/en-us'
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage
} from 'pdf-lib'
import {
  BOOK_TRIMS,
  CHAPTER_DROP_INCHES,
  chapterNumberLine,
  toRomanLower,
  type BookChapterPlan,
  type BookPlan,
  type BookTrim
} from '../../shared/book'
import { countWords } from '../../shared/wordCount'
import type { DocumentSeparation } from '../../shared/compile'
import { blocksToHtml, escapeHtml, footnotesToHtml } from './blocksToHtml'
import { numberFootnotes } from './footnotes'
import { blocksToPlainText } from './toPlainText'
import type { Block } from './htmlToBlocks'

/**
 * The book-interior renderer (see SPEC.md). Chromium's printToPDF cannot
 * express any of this preset's folio rules — one header template, an
 * Arabic-only counter that never restarts, no roman numerals, no per-page
 * suppression, no mirrored margins — so the book is rendered as independent
 * segments with no Chromium headers at all, then assembled with pdf-lib:
 * blank versos inserted for recto seating, folios and running headers
 * stamped with full knowledge of each page's parity and sequence, the
 * outline and /PageLabels written last.
 *
 * The gutter: segments are rendered with symmetric horizontal margins of
 * (outer+inner)/2, and each assembled page's MediaBox origin is shifted by
 * ±(inner−outer)/2 so the content sits toward the outer edge — recto pages
 * gain their left (spine) margin, verso pages their right. Shifting the box
 * rather than rewriting content streams is deterministic against whatever
 * operators Chromium emits; stamps compensate for the origin when drawn.
 */

const PT_PER_IN = 72

/** Book typography, shared with toPdf.wrapHtml's book branch so the stored
 *  compile viewer shows the same setting the interior uses. Page padding is
 *  deliberately not here — segments and the viewer pad differently. */
export const BOOK_BODY_CSS = `
  body {
    margin: 0;
    background: #ffffff;
    color: #000000;
    font-family: 'Iowan Old Style', 'Palatino Linotype', Georgia, serif;
    font-size: 11pt;
    line-height: 1.45;
    text-align: justify;
    hyphens: auto;
  }
  /* Indent-based separation: no vertical gaps, no first-line indent on a
     paragraph that opens a chapter or follows anything but another
     paragraph — p + p is the whole rule, structure-driven, never manual. */
  p { margin: 0; text-indent: 0; }
  p + p { text-indent: 1.4em; }
  .chf-scene-break { text-align: center; text-indent: 0; margin: 0.7em 0; }
  .chf-scene-break + p { text-indent: 0; }
  h1, h2, h3 { margin: 1.2em 0 0.5em; font-weight: 700; line-height: 1.25; text-align: left; }
  h1 { font-size: 15pt; }
  h2 { font-size: 13pt; }
  h3 { font-size: 11.5pt; }
  blockquote { margin: 0.7em 0 0.7em 1.4em; font-style: italic; }
  blockquote + p { text-indent: 0; }
  ul, ol { margin: 0.7em 0; padding-left: 1.6em; }
  li { margin: 0.1em 0; }
  li > p { margin: 0; text-indent: 0; }

  .book-chapter-opening { margin-top: ${CHAPTER_DROP_INCHES}in; text-align: center; }
  /* Continuous document separation: an opening that follows the divider
     mid-page keeps its form but not the new-page drop. */
  .book-chapter-opening.book-run-on { margin-top: 1.6em; }
  .book-run-on .book-chapter-title { margin-bottom: 1.2em; }
  .book-chapter-number { font-size: 9.5pt; letter-spacing: 0.22em; margin: 0 0 0.9em; }
  /* Explicit centering: the generic h1 rule above sets text-align left,
     which beats inheritance from the centered opening container. */
  .book-chapter-title { font-size: 16pt; font-weight: 700; line-height: 1.2; margin: 0 0 2.4em; text-align: center; }
  .book-part-opening { margin-top: ${CHAPTER_DROP_INCHES}in; text-align: center; }
  .book-part-title { font-size: 18pt; font-weight: 700; line-height: 1.2; margin: 0; text-align: center; }

  /* Matter and Contents are display pages, not body prose. */
  .book-matter { text-align: left; }
  .book-matter p { text-indent: 0; margin: 0 0 0.5em; }
  .book-contents { text-align: center; }
  .book-contents-title { font-size: 13pt; letter-spacing: 0.22em; margin: ${CHAPTER_DROP_INCHES}in 0 2em; }
  .book-contents-part { font-weight: 700; margin: 1.1em 0 0.4em; }
  .book-contents-entry { margin: 0.35em 0; }

  .chf-endnotes h2 { text-align: center; font-size: 13pt; letter-spacing: 0.22em; margin: ${CHAPTER_DROP_INCHES}in 0 2em; }
  .chf-endnotes ol { list-style: none; padding-left: 0; }
  .chf-endnotes li { margin: 0.4em 0; font-size: 9.5pt; text-indent: 0; }
  .chf-footnote-ref a, .chf-fn-back { text-decoration: none; color: inherit; }

  .chf-figure { margin: 0.8em 0; text-align: center; break-inside: avoid; }
  .chf-figure img { max-width: 100%; height: auto; }
`

/** Fragmentation rules that only matter when a segment is actually paged —
 *  kept out of BOOK_BODY_CSS so the (unpaged) viewer doesn't carry them. */
const BOOK_PAGED_CSS = `
  * { box-sizing: border-box; }
  p { orphans: 3; widows: 3; }
  h1, h2, h3 { break-after: avoid; break-inside: avoid; }
  blockquote { break-inside: avoid; }
  .chf-scene-break { break-after: avoid; }
  /* Inline page/chapter breaks both act as plain page breaks here — book
     chapters come from binder structure, and validation says so. */
  .chf-page-break, .chf-chapter-break { break-after: page; height: 0; }
  .chf-page-break:last-child, .chf-chapter-break:last-child { break-after: avoid; }
  .chf-chapter-line {
    width: 38%; margin: 1.2em auto; border-top: 1px solid currentColor;
    opacity: 0.45; break-after: avoid; break-inside: avoid;
  }
`

export interface BookRenderOptions {
  trim: BookTrim
  title: string
  authorName: string | null
  sceneBreakMark: string
  includeContents: boolean
  /** How consecutive chapters share pages — see DocumentSeparation. 'page'
   *  renders each chapter as its own segment (a fresh page by construction);
   *  'divider' flows a stretch of consecutive chapters as one segment with
   *  the scene marker between documents. Defaults to 'page'. */
  separation?: DocumentSeparation
  /** Image id → data URI, resolved by the caller like the other PDF paths. */
  imageSources?: Record<string, string>
}

export interface BookPageMapEntry {
  physicalIndex: number
  kind:
    | 'front-display'
    | 'contents'
    | 'front-text'
    | 'part-title'
    | 'chapter-opening'
    | 'body'
    | 'back'
    | 'blank'
  folio: { sequence: 'roman' | 'arabic'; number: number; visible: boolean }
  recto: boolean
}

export interface BookRender {
  output: Buffer
  viewHtml: string
  pageMap: BookPageMapEntry[]
  /** Chapter content only — matter never counts, same rule as elsewhere. */
  wordCount: number
}

type SegmentKind = Exclude<BookPageMapEntry['kind'], 'blank' | 'body' | 'chapter-opening'> | 'chapter'

interface Segment {
  kind: SegmentKind
  html: string
  /** Seat this segment's first page on a recto, inserting a blank if needed. */
  forceRecto: boolean
  /** Force a blank after this segment so what follows starts recto — the
   *  conventional empty verso behind a part-title page. */
  blankVersoAfter?: boolean
  /** PDF outline entry pointing at this segment's first page. */
  outlineTitle?: string
}

function chapters(plan: BookPlan): BookChapterPlan[] {
  return plan.body.flatMap((entry) => (entry.kind === 'part' ? entry.chapters : [entry]))
}

function wrapSegment(inner: string): string {
  // No body padding: CSS padding on body applies only at the start and end
  // of the box, not at every page fragment, so a multi-page chapter's later
  // pages would run to the trim edge (and under the stamped header). The
  // page frame comes from printToPDF's own margins, which repeat per page.
  const css = BOOK_PAGED_CSS + BOOK_BODY_CSS + 'body { padding: 0; }'
  // lang matters: Chromium's hyphenation is inert without it, and justified
  // text without hyphenation is the one combination the rules forbid.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css}</style></head><body>${inner}</body></html>`
}

function chapterOpeningHtml(chapter: BookChapterPlan, runOn: boolean): string {
  const numberLine = chapterNumberLine(chapter.chapterNumber)
  return (
    `<div class="book-chapter-opening${runOn ? ' book-run-on' : ''}">` +
    (numberLine ? `<div class="book-chapter-number">${escapeHtml(numberLine)}</div>` : '') +
    `<h1 class="book-chapter-title">${escapeHtml(chapter.title)}</h1>` +
    '</div>'
  )
}

function contentsHtml(plan: BookPlan): string {
  const entries: string[] = []
  for (const item of plan.body) {
    if (item.kind === 'part') {
      entries.push(`<div class="book-contents-part">${escapeHtml(item.title)}</div>`)
      for (const chapter of item.chapters) {
        entries.push(`<div class="book-contents-entry">${escapeHtml(chapter.title)}</div>`)
      }
    } else {
      entries.push(`<div class="book-contents-entry">${escapeHtml(item.title)}</div>`)
    }
  }
  return `<div class="book-contents"><div class="book-contents-title">CONTENTS</div>${entries.join('')}</div>`
}

async function renderSegmentPdf(win: BrowserWindow, html: string, trim: BookTrim): Promise<Buffer> {
  const spec = BOOK_TRIMS[trim]
  const sideIn = (spec.outerIn + spec.innerIn) / 2
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  return await win.webContents.printToPDF({
    printBackground: true,
    preferCSSPageSize: false,
    pageSize: { width: spec.widthIn, height: spec.heightIn },
    // Real per-page margins (symmetric horizontally; the gutter comes from
    // the assembly-time MediaBox shift). Body padding cannot do this job —
    // it doesn't repeat at page fragments.
    margins: { top: spec.topIn, bottom: spec.bottomIn, left: sideIn, right: sideIn }
  })
}

export async function renderBookPdf(
  plan: BookPlan,
  loadBlocks: (id: string) => Promise<Block[]>,
  options: BookRenderOptions
): Promise<BookRender> {
  const spec = BOOK_TRIMS[options.trim]
  const widthPt = spec.widthIn * PT_PER_IN
  const heightPt = spec.heightIn * PT_PER_IN
  const gutterShiftPt = ((spec.innerIn - spec.outerIn) / 2) * PT_PER_IN
  const blockOptions = { sceneBreakMark: options.sceneBreakMark, imageSources: options.imageSources ?? {} }

  // Load everything once, up front — segment building below is synchronous.
  const blocksById = new Map<string, Block[]>()
  const allIds = [
    ...plan.frontDisplayIds,
    ...plan.frontTextIds,
    ...chapters(plan).map((c) => c.documentId),
    ...plan.backIds
  ]
  for (const id of allIds) {
    if (!blocksById.has(id)) blocksById.set(id, await loadBlocks(id))
  }

  const chapterBlocks = chapters(plan).flatMap((c) => blocksById.get(c.documentId) ?? [])
  const wordCount = countWords(blocksToPlainText(chapterBlocks))

  // Soft hyphens, inserted into prose runs before rendering: Electron ships
  // without Chromium's hyphenation dictionaries (a downloaded browser
  // component), so `hyphens: auto` is silently inert here — and justified
  // text without hyphenation is exactly what the typography rules forbid.
  // The CSS default (`hyphens: manual`) honors the soft hyphens. Headings,
  // scene-break markers, and display pages are left untouched.
  const hyphenated = (blocks: Block[]): Block[] =>
    blocks.map((block) =>
      block.kind === 'paragraph' || block.kind === 'blockquote' || block.kind === 'bullet' || block.kind === 'ordered'
        ? { ...block, runs: block.runs.map((run) => (run.text ? { ...run, text: hyphenateSync(run.text) } : run)) }
        : block
    )

  const matterHtml = (id: string, hyphenate = false): string => {
    const blocks = blocksById.get(id) ?? []
    return `<section class="book-matter">${blocksToHtml(hyphenate ? hyphenated(blocks) : blocks, blockOptions)}</section>`
  }

  const chapterHtml = (chapter: BookChapterPlan, runOn: boolean): string =>
    chapterOpeningHtml(chapter, runOn) +
    blocksToHtml(hyphenated(blocksById.get(chapter.documentId) ?? []), blockOptions)

  // -- Segments, in book order --------------------------------------------
  const segments: Segment[] = []

  // Display pages: half title recto, title recto, copyright on the title's
  // verso (never a blank between), dedication recto — the seeded order.
  const displayRecto = [true, true, false, true]
  plan.frontDisplayIds.forEach((id, index) => {
    segments.push({ kind: 'front-display', html: matterHtml(id), forceRecto: displayRecto[index] ?? true })
  })

  const hasBody = chapters(plan).length > 0 || plan.body.length > 0
  if (options.includeContents && hasBody) {
    segments.push({ kind: 'contents', html: contentsHtml(plan), forceRecto: true })
  }

  for (const id of plan.frontTextIds) {
    segments.push({ kind: 'front-text', html: matterHtml(id, true), forceRecto: true })
  }

  // The one place the documentSeparation setting acts: under 'page' every
  // chapter is its own segment, which begins a fresh page by construction;
  // under 'divider' a stretch of consecutive chapters renders as ONE segment,
  // the scene marker between documents and later openings in run-on form.
  // Part-title pages always break a stretch. A combined segment has a single
  // first page, so the PDF outline can only point at the stretch's start —
  // it lists the stretch's first chapter; the printed Contents still lists
  // every chapter (it never carried page numbers).
  const divider = `<p class="chf-scene-break">${escapeHtml(options.sceneBreakMark)}</p>`
  const pushChapterSegments = (stretch: BookChapterPlan[]): void => {
    if (stretch.length === 0) return
    if ((options.separation ?? 'page') === 'divider') {
      segments.push({
        kind: 'chapter',
        html: stretch.map((chapter, index) => chapterHtml(chapter, index > 0)).join(divider),
        forceRecto: stretch[0].opensRecto,
        outlineTitle: stretch[0].title
      })
      return
    }
    for (const chapter of stretch) {
      segments.push({
        kind: 'chapter',
        html: chapterHtml(chapter, false),
        forceRecto: chapter.opensRecto,
        outlineTitle: chapter.title
      })
    }
  }

  let stretch: BookChapterPlan[] = []
  for (const entry of plan.body) {
    if (entry.kind === 'part') {
      pushChapterSegments(stretch)
      stretch = []
      segments.push({
        kind: 'part-title',
        html: `<div class="book-part-opening"><h1 class="book-part-title">${escapeHtml(entry.title)}</h1></div>`,
        forceRecto: true,
        blankVersoAfter: true,
        outlineTitle: entry.title
      })
      pushChapterSegments(entry.chapters)
    } else {
      stretch.push(entry)
    }
  }
  pushChapterSegments(stretch)

  const endnotes = footnotesToHtml(numberFootnotes(chapterBlocks))
  if (endnotes) segments.push({ kind: 'back', html: endnotes, forceRecto: false })

  for (const id of plan.backIds) {
    segments.push({ kind: 'back', html: matterHtml(id, true), forceRecto: false })
  }

  // -- Render every segment through one reused offscreen window -----------
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: false } })
  const rendered: { segment: Segment; bytes: Buffer }[] = []
  try {
    for (const segment of segments) {
      rendered.push({ segment, bytes: await renderSegmentPdf(win, wrapSegment(segment.html), options.trim) })
    }
  } finally {
    win.destroy()
  }

  // -- Assemble ------------------------------------------------------------
  const out = await PDFDocument.create()
  const pageMap: BookPageMapEntry[] = []
  const outlineTargets: { title: string; pageIndex: number }[] = []

  const nextIsRecto = (): boolean => pageMap.length % 2 === 0
  const pushBlank = (): void => {
    out.addPage([widthPt, heightPt])
    pageMap.push({
      physicalIndex: pageMap.length,
      kind: 'blank',
      folio: { sequence: 'roman', number: 0, visible: false }, // sequenced below
      recto: nextIsRecto()
    })
  }

  let carryForceRecto = false
  for (const { segment, bytes } of rendered) {
    if ((segment.forceRecto || carryForceRecto) && !nextIsRecto()) pushBlank()
    carryForceRecto = false
    const src = await PDFDocument.load(bytes)
    const copied = await out.copyPages(src, src.getPageIndices())
    if (segment.outlineTitle) outlineTargets.push({ title: segment.outlineTitle, pageIndex: pageMap.length })
    copied.forEach((page, index) => {
      out.addPage(page)
      const kind: BookPageMapEntry['kind'] =
        segment.kind === 'chapter' ? (index === 0 ? 'chapter-opening' : 'body') : segment.kind
      pageMap.push({
        physicalIndex: pageMap.length,
        kind,
        folio: { sequence: 'roman', number: 0, visible: false },
        recto: pageMap.length % 2 === 0
      })
    })
    if (segment.blankVersoAfter && !nextIsRecto()) pushBlank()
  }

  // -- Sequence the folios --------------------------------------------------
  // Arabic restarts at the first body page — the Part I title page when parts
  // exist (blind), otherwise Chapter 1's opening. Blanks inserted before that
  // boundary count roman; after it, Arabic. Nothing skips, nothing resets.
  const firstBody = pageMap.findIndex((e) => e.kind === 'part-title' || e.kind === 'chapter-opening')
  const arabicStart = firstBody === -1 ? pageMap.length : firstBody
  for (const entry of pageMap) {
    const arabic = entry.physicalIndex >= arabicStart
    entry.folio = {
      sequence: arabic ? 'arabic' : 'roman',
      number: arabic ? entry.physicalIndex - arabicStart + 1 : entry.physicalIndex + 1,
      visible:
        entry.kind === 'contents' ||
        entry.kind === 'front-text' ||
        entry.kind === 'chapter-opening' ||
        entry.kind === 'body' ||
        entry.kind === 'back'
    }
  }

  // -- Gutter shift, then stamps -------------------------------------------
  const font = await out.embedFont(StandardFonts.TimesRoman)
  const topPt = spec.topIn * PT_PER_IN
  const bottomPt = spec.bottomIn * PT_PER_IN
  const outerPt = spec.outerIn * PT_PER_IN
  const size = 9.5

  const drawAtVisual = (page: PDFPage, originX: number, text: string, xVisual: number, y: number, f: PDFFont): void => {
    page.drawText(text, { x: xVisual + originX, y, size, font: f, color: rgb(0, 0, 0) })
  }

  for (const entry of pageMap) {
    const page = out.getPage(entry.physicalIndex)
    if (entry.kind === 'blank') continue

    // Recto: spine is the left edge — content shifts right (origin moves
    // left); verso mirrors. Stamps below add originX to visual positions.
    const originX = entry.recto ? -gutterShiftPt : gutterShiftPt
    page.setMediaBox(originX, 0, widthPt, heightPt)
    page.setCropBox(originX, 0, widthPt, heightPt)

    if (!entry.folio.visible) continue
    const folioText =
      entry.folio.sequence === 'roman' ? toRomanLower(entry.folio.number) : String(entry.folio.number)
    const folioWidth = font.widthOfTextAtSize(folioText, size)

    if (entry.kind === 'body' || entry.kind === 'back') {
      // Outer-corner folio sharing the header line; header centered.
      const y = heightPt - topPt / 2 - size / 3
      const folioX = entry.recto ? widthPt - outerPt - folioWidth : outerPt
      drawAtVisual(page, originX, folioText, folioX, y, font)
      const headerText = entry.recto ? options.title : (options.authorName ?? '')
      if (headerText.trim()) {
        const headerWidth = font.widthOfTextAtSize(headerText, size)
        drawAtVisual(page, originX, headerText, (widthPt - headerWidth) / 2, y, font)
      }
    } else {
      // Openers and roman text pages: folio at bottom center, no header.
      drawAtVisual(page, originX, folioText, (widthPt - folioWidth) / 2, bottomPt / 2 - size / 3, font)
    }
  }

  // -- Outline (parts and chapters) and /PageLabels ------------------------
  if (outlineTargets.length > 0) {
    const ctx = out.context
    const outlineRef = ctx.nextRef()
    const itemRefs = outlineTargets.map(() => ctx.nextRef())
    outlineTargets.forEach((target, i) => {
      ctx.assign(
        itemRefs[i],
        ctx.obj({
          Title: PDFHexString.fromText(target.title),
          Parent: outlineRef,
          Dest: [out.getPage(target.pageIndex).ref, PDFName.of('XYZ'), null, null, null],
          ...(i > 0 ? { Prev: itemRefs[i - 1] } : {}),
          ...(i < outlineTargets.length - 1 ? { Next: itemRefs[i + 1] } : {})
        })
      )
    })
    ctx.assign(
      outlineRef,
      ctx.obj({
        Type: PDFName.of('Outlines'),
        First: itemRefs[0],
        Last: itemRefs[itemRefs.length - 1],
        Count: itemRefs.length
      })
    )
    out.catalog.set(PDFName.of('Outlines'), outlineRef)
  }

  // Viewers show i, ii… then 1, 2… matching the stamped folios.
  out.catalog.set(
    PDFName.of('PageLabels'),
    out.context.obj({ Nums: [0, { S: PDFName.of('r') }, arabicStart, { S: PDFName.of('D') }] })
  )

  // The frozen in-app view: the same content in the same typography, without
  // folios, blanks, or the gutter — the stored PDF is the artifact of record.
  const viewHtml = segments.map((s) => s.html).join('')

  // Classic xref rather than object streams: maximally compatible output for
  // print-shop tooling, and the catalog (outline, page labels) stays
  // byte-inspectable, which the regression suite relies on.
  return { output: Buffer.from(await out.save({ useObjectStreams: false })), viewHtml, pageMap, wordCount }
}
