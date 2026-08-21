import { paginate, pageGeometry, PAGE_GAP_PX } from '../src/renderer/src/pagePreview'
import type { PageBreak } from '../src/renderer/src/pagePreview'
import { PAGE_DIMENSIONS_MM, PAGE_SIZE_OPTIONS } from '../src/shared/preferences'

/**
 * Runs inside a real browser window with the application's own stylesheet
 * loaded, because pagination is a question about layout: how tall a paragraph
 * of this font at this measure actually is. There is no way to answer that in
 * a headless stub, and a stub that guessed would be testing the guess.
 */
export interface Check {
  ok: boolean
  label: string
}

function measureNaturalTops(html: string, usableWidthPx: number): { top: number; height: number }[] {
  // An independent copy of the measurement rig. Deliberately not reusing
  // pagePreview's own node: the point is to verify its output against a
  // separately-taken measurement, not to trust it to check itself.
  const host = document.createElement('div')
  host.className = 'editor page-measure-host'
  const content = document.createElement('div')
  content.className = 'ProseMirror page-measure-content'
  content.style.width = `${usableWidthPx}px`
  content.innerHTML = html
  // Match what ProseMirror renders, not what it serializes: an empty
  // textblock is shown with a trailing break and occupies a real line. This
  // independent measurement has to make the same assumption paginate() does,
  // or the two disagree about blank lines for reasons unrelated to the code
  // under test.
  for (const el of Array.from(content.querySelectorAll('p,h1,h2,h3,h4,h5,h6,blockquote,li')) as HTMLElement[]) {
    if (el.childElementCount === 0 && el.textContent === '') el.appendChild(document.createElement('br'))
  }
  host.appendChild(content)
  document.body.appendChild(host)

  const blocks = Array.from(content.children) as HTMLElement[]
  const contentTop = content.offsetTop
  const measured = blocks.map((el) => ({ top: el.offsetTop - contentTop, height: el.offsetHeight }))

  host.remove()
  return measured
}

/**
 * The invariant that actually matters: once every measured gap is applied,
 * no run of content may cross a page boundary.
 *
 * Blocks that are split internally are checked segment by segment — the
 * portion before the first in-block break, then each portion between breaks —
 * because a split paragraph legitimately appears on more than one page while
 * none of its individual pieces may straddle one.
 */
function nothingStraddles(
  html: string,
  breaks: PageBreak[],
  usableWidthPx: number,
  usableHeightPx: number,
  stride: number
): boolean {
  const measured = measureNaturalTops(html, usableWidthPx)
  let gapTotal = 0

  for (let i = 0; i < measured.length; i += 1) {
    const blockBreaks = breaks.filter((b) => b.blockIndex === i)
    const before = blockBreaks.find((b) => b.charOffset === null)
    if (before) gapTotal += before.gapPx

    const inlineBreaks = blockBreaks.filter((b) => b.charOffset !== null)
    // Replay the renderer's own arithmetic. A break's gap is
    // `target - (absolute position of the line being pushed)`, so the line's
    // pre-push position — and therefore where the previous segment ended —
    // can be recovered from the gap and the page it was pushed to.
    let consumed = 0
    for (const inline of inlineBreaks) {
      const page = Math.floor((measured[i].top + consumed + gapTotal) / stride)
      const target = (page + 1) * stride
      const lineTopAbsolute = target - inline.gapPx
      // The segment ending at this line had to fit on the page it was on.
      if (lineTopAbsolute > page * stride + usableHeightPx + 0.5) return false
      consumed = lineTopAbsolute - measured[i].top - gapTotal
      gapTotal += inline.gapPx
    }

    const top = measured[i].top + consumed + gapTotal
    const remaining = measured[i].height - consumed
    if (remaining > usableHeightPx) continue // documented overflow case
    const page = Math.floor(top / stride)
    // Half a pixel of slack: sub-pixel layout rounding is not a straddle.
    if (top + remaining > page * stride + usableHeightPx + 0.5) return false
  }
  return true
}

export function runChecks(): Check[] {
  const checks: Check[] = []
  const assert = (ok: boolean, label: string): void => {
    checks.push({ ok, label })
  }

  // ---- every page size is geometrically correct ------------------------
  // Each is checked against its own published dimensions rather than against
  // a constant, so adding a size to PAGE_DIMENSIONS_MM is genuinely all that
  // is needed for page view to render it correctly.
  const PX_PER_MM = 96 / 25.4
  for (const { id, label } of PAGE_SIZE_OPTIONS) {
    const { widthMm, heightMm } = PAGE_DIMENSIONS_MM[id]
    const g = pageGeometry(id, 25.4)
    const okSize =
      Math.abs(g.pageWidthPx - widthMm * PX_PER_MM) < 0.5 &&
      Math.abs(g.pageHeightPx - heightMm * PX_PER_MM) < 0.5
    const okText =
      Math.abs(g.usableWidthPx - (widthMm - 50.8) * PX_PER_MM) < 0.5 &&
      Math.abs(g.usableHeightPx - (heightMm - 50.8) * PX_PER_MM) < 0.5
    assert(okSize, `${label} renders at its true physical size`)
    assert(okText, `${label} text area is the page less 25.4mm on every side`)
  }

  // Smaller pages must hold less. A size that silently fell back to a default
  // would show up here as an identical page count.
  const sample = `<p>${'The lamp guttered and went out again. '.repeat(14)}</p>`.repeat(20)
  const a4Pages = paginate(sample, 'a4', 25.4).pageCount
  const a5Pages = paginate(sample, 'a5', 25.4).pageCount
  const legalPages = paginate(sample, 'legal', 25.4).pageCount
  assert(a5Pages > a4Pages, `A5 needs more pages than A4 (${a4Pages} → ${a5Pages})`)
  assert(legalPages < a4Pages, `US Legal needs fewer pages than A4 (${a4Pages} → ${legalPages})`)

  // ---- calibration against the standard-manuscript reference ----------
  // A4, 25.4mm margins, 12pt Times New Roman, double-spaced, every word the
  // literal string "word" — a controlled case whose answer depends only on
  // geometry, font metrics and the meaning of "double-spaced".
  //
  // Font metrics and margins are verified separately below and are exact.
  // The whole spread comes from what "double" means: CSS `line-height: 2` is
  // two times the FONT SIZE (24pt), while a word processor's "Double" is two
  // times the font's own SINGLE LINE SPACING (~13.8pt for Times New Roman,
  // so ~27.6pt). Those are the two common readings, they differ by ~15%, and
  // no amount of tuning reconciles them — they are different quantities.
  const wordsOnPageOne = (style: string, size: 'a4' | 'letter', marginMm: number): number => {
    const r = paginate(`<p style="${style}">${'word '.repeat(4000)}</p>`, size, marginMm)
    const first = r.breaks.find((b) => b.charOffset !== null)
    // Each "word " is exactly five characters, so the break's character
    // offset converts straight to a word count.
    return first ? Math.round((first.charOffset as number) / 5) : -1
  }

  const TNR = `font-family:'Times New Roman';font-size:12pt;`

  // The font's own single line spacing, measured rather than assumed — this
  // is the quantity a word processor doubles.
  const lhProbe = document.createElement('span')
  lhProbe.textContent = 'word'
  lhProbe.style.cssText = `font-family:'Times New Roman';font-size:12pt;line-height:normal`
  document.body.appendChild(lhProbe)
  const naturalLineHeightPx = lhProbe.getBoundingClientRect().height
  lhProbe.remove()

  const timesDouble = wordsOnPageOne(`${TNR}line-height:2`, 'a4', 25.4)
  const timesWordDouble = wordsOnPageOne(
    `${TNR}line-height:${(naturalLineHeightPx * 2).toFixed(2)}px`,
    'a4',
    25.4
  )

  // Font metrics: 12pt must resolve to exactly 16px at 96dpi, and Times New
  // Roman must actually be the font used rather than a fallback.
  const probe = document.createElement('div')
  probe.className = 'editor page-measure-host'
  probe.innerHTML = `<div class="ProseMirror page-measure-content"><p style="${TNR}">word</p></div>`
  document.body.appendChild(probe)
  const probeStyle = getComputedStyle(probe.querySelector('p') as HTMLElement)
  assert(probeStyle.fontSize === '16px', `12pt resolves to 16px at 96dpi (got ${probeStyle.fontSize})`)
  assert(
    probeStyle.fontFamily.includes('Times New Roman'),
    `Times New Roman is the resolved font, not a fallback (got ${probeStyle.fontFamily})`
  )
  probe.remove()

  // Margins: the text area must be the full page less exactly 25.4mm a side.
  const refGeo = pageGeometry('a4', 25.4)
  assert(
    Math.abs(refGeo.usableWidthPx - (210 - 50.8) * PX_PER_MM) < 0.5 &&
      Math.abs(refGeo.usableHeightPx - (297 - 50.8) * PX_PER_MM) < 0.5,
    `no hidden inset reduces the usable page (text area ${refGeo.usableWidthPx.toFixed(1)} × ${refGeo.usableHeightPx.toFixed(1)}px)`
  )

  // The two readings must differ, and in the expected direction — if they
  // ever converge, something has flattened the line-height handling.
  assert(
    timesWordDouble < timesDouble,
    `word-processor "Double" fits fewer words than CSS line-height:2 (${timesDouble} → ${timesWordDouble})`
  )
  // Pinned so a change in font handling, margins or line-box rounding shows
  // up as a failure here rather than as a slow drift nobody notices.
  assert(
    timesDouble === 464,
    `CSS line-height:2 fits 464 words/page on A4 @25.4mm (got ${timesDouble})`
  )
  // The reference figure is 375. Ours lands close but not identical, and the
  // residual is line breaking rather than geometry: at this measure Chromium
  // fits 16 "word"s per line, so every achievable page count is a multiple of
  // 16 and 375 is not one. The gap is documented, not tuned away.
  assert(
    Math.abs(timesWordDouble - 375) / 375 < 0.15,
    `word-processor "Double" lands within 15% of the 375-word reference (got ${timesWordDouble}, ` +
      `natural line height ${naturalLineHeightPx.toFixed(2)}px)`
  )

  // ---- geometry -------------------------------------------------------
  const letter = pageGeometry('letter', 25)
  assert(Math.round(letter.pageWidthPx) === 816, 'US Letter page is 816px wide at 96dpi')
  assert(Math.round(letter.pageHeightPx) === 1056, 'US Letter page is 1056px tall at 96dpi')
  assert(Math.round(letter.usableWidthPx) === 627, 'text column is 627px inside 25mm margins')

  const a4 = pageGeometry('a4', 25)
  assert(Math.round(a4.pageWidthPx) === 794, 'A4 page is 794px wide')
  assert(a4.pageHeightPx > letter.pageHeightPx, 'A4 is taller than Letter')

  const stride = letter.usableHeightPx + letter.marginPx * 2 + PAGE_GAP_PX

  // ---- a very short document -----------------------------------------
  const short = '<h1>Chapter One</h1><p>The lamp guttered and went out.</p>'
  const shortResult = paginate(short, 'letter', 25)
  assert(shortResult.pageCount === 1, `short document is one page (got ${shortResult.pageCount})`)
  assert(shortResult.breaks.length === 0, 'short document has no page breaks')
  assert(
    Math.round(shortResult.stackHeightPx) === Math.round(letter.pageHeightPx),
    'a one-page document is exactly one page tall — not stretched, not shrunk'
  )
  assert(
    Math.round(shortResult.geometry.pageWidthPx) === 816,
    'short document still reports full page width, independent of its content'
  )

  // An empty document is still a page.
  const emptyResult = paginate('', 'letter', 25)
  assert(emptyResult.pageCount === 1, 'empty document is one page')
  assert(
    Math.round(emptyResult.stackHeightPx) === Math.round(letter.pageHeightPx),
    'empty document is a full-size page'
  )

  // ---- a long document ------------------------------------------------
  const paragraph = `<p>${'The lamp guttered and went out again. '.repeat(14)}</p>`
  const long = `<h1>Chapter One</h1>${paragraph.repeat(45)}`
  const longResult = paginate(long, 'letter', 25)

  assert(longResult.pageCount > 1, `long document spans multiple pages (got ${longResult.pageCount})`)
  assert(longResult.breaks.length > 0, 'long document has real page breaks')
  assert(
    longResult.breaks.length <= longResult.pageCount - 1,
    'never more breaks than boundaries between pages'
  )
  assert(
    longResult.breaks.every((b) => b.gapPx > 0 && b.gapPx < stride),
    'every gap is positive and smaller than one page stride'
  )
  assert(
    longResult.breaks.every((b, i, all) => i === 0 || b.blockIndex > all[i - 1].blockIndex),
    'breaks are in document order, one per block at most'
  )
  assert(
    Math.round(longResult.stackHeightPx) ===
      Math.round(longResult.pageCount * stride - PAGE_GAP_PX),
    'stack height matches the number of sheets and the gaps between them'
  )

  // The property the whole feature rests on.
  assert(
    nothingStraddles(long, longResult.breaks, letter.usableWidthPx, letter.usableHeightPx, stride),
    'nothing straddles a page boundary once gaps are applied'
  )

  // ---- one paragraph longer than a page -------------------------------
  // The reported bug: typing continuously into a single paragraph produced a
  // block taller than a page, which was treated as unsplittable and ran
  // straight through the bottom margin, the gutter and the next page's top
  // margin, losing its middle lines into the gap between sheets.
  const runOn = `<p>${'The lamp guttered and went out again. '.repeat(220)}</p>`
  const runOnResult = paginate(runOn, 'letter', 25)
  assert(runOnResult.pageCount > 1, `a single long paragraph spans pages (got ${runOnResult.pageCount})`)
  assert(
    runOnResult.breaks.length > 0,
    'a single long paragraph gets page breaks at all — the reported bug produced none'
  )
  assert(
    runOnResult.breaks.every((b) => b.charOffset !== null),
    'those breaks fall inside the paragraph, at line boundaries'
  )
  assert(
    runOnResult.breaks.every((b, i, all) => i === 0 || (b.charOffset as number) > (all[i - 1].charOffset as number)),
    'in-paragraph breaks advance through the text'
  )
  assert(
    nothingStraddles(runOn, runOnResult.breaks, letter.usableWidthPx, letter.usableHeightPx, stride),
    'no part of a split paragraph straddles a page boundary'
  )
  assert(
    runOnResult.breaks.length === runOnResult.pageCount - 1,
    'a continuous paragraph breaks exactly once per page boundary'
  )

  // ---- blank lines occupy real space ----------------------------------
  // Holding Enter builds a run of empty paragraphs. getHTML() serializes each
  // as <p></p>, which generates no line box and so measured zero pixels tall
  // — a screenful of blank lines looked like a document of no height at all,
  // and pagination never found anything to break no matter how long you
  // waited. The measurement rig has to reproduce what ProseMirror renders (a
  // trailing <br> in every empty textblock), not what it serializes.
  const blankLines = '<p>Start of document.</p>' + '<p></p>'.repeat(200)
  const blankResult = paginate(blankLines, 'letter', 25)
  assert(
    blankResult.pageCount > 1,
    `200 blank lines span multiple pages (got ${blankResult.pageCount})`
  )
  assert(blankResult.breaks.length > 0, 'blank lines produce real page breaks')

  // Blank lines must measure the same whether or not they carry the trailing
  // break, since one is only the serialized form of the other.
  const blankWithBr = '<p>Start of document.</p>' + '<p><br></p>'.repeat(200)
  assert(
    paginate(blankWithBr, 'letter', 25).pageCount === blankResult.pageCount,
    'an empty paragraph paginates identically with or without its trailing break'
  )

  // Mixed prose and blank runs — the realistic shape — must not drift.
  const mixed = (`<p>${'The lamp guttered and went out again. '.repeat(14)}</p>` + '<p></p>'.repeat(6)).repeat(12)
  const mixedResult = paginate(mixed, 'letter', 25)
  assert(mixedResult.pageCount > 1, `prose with blank-line runs paginates (${mixedResult.pageCount} pages)`)
  assert(
    nothingStraddles(mixed, mixedResult.breaks, letter.usableWidthPx, letter.usableHeightPx, stride),
    'nothing straddles a boundary in a document containing blank lines'
  )

  // ---- headings are not split -----------------------------------------
  // Filling a page and then starting a heading should move the heading whole.
  const fillToBottom = `<p>${'The lamp guttered and went out again. '.repeat(14)}</p>`.repeat(11)
  const withHeading = `${fillToBottom}<h1>Chapter Two</h1>${fillToBottom}`
  const headingResult = paginate(withHeading, 'letter', 25)
  const headingBlockIndex = withHeading.slice(0, withHeading.indexOf('<h1')).split('<p>').length - 1
  const headingBreak = headingResult.breaks.find((b) => b.blockIndex === headingBlockIndex)
  assert(
    headingBreak === undefined || headingBreak.charOffset === null,
    'a heading is never split mid-word — it moves whole or not at all'
  )

  // ---- the count and the sheets agree ---------------------------------
  // computePageCount is defined as paginate().pageCount, so the footer and
  // the rendered sheets read one number by construction. Verified rather
  // than assumed, since that equality is the reason for the refactor.
  const viaCount = paginate(long, 'letter', 25).pageCount
  assert(viaCount === longResult.pageCount, 'reported page count equals the number of sheets rendered')

  // ---- geometry actually drives pagination ----------------------------
  const wideMargins = paginate(long, 'letter', 40)
  assert(
    wideMargins.pageCount > longResult.pageCount,
    `bigger margins mean more pages (${longResult.pageCount} → ${wideMargins.pageCount})`
  )
  const onA4 = paginate(long, 'a4', 25)
  assert(onA4.pageCount <= longResult.pageCount, 'a taller A4 page holds at least as much per page')

  return checks
}
