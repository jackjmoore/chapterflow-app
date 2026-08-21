import { PAGE_DIMENSIONS_MM, type PageSize } from '../../shared/preferences'

const PX_PER_MM = 96 / 25.4

/** Visible gutter between two stacked pages. Also the amount by which a page
 *  boundary's push-down exceeds the paper margins, so it lives here rather
 *  than in CSS alone — the layout maths needs it. */
export const PAGE_GAP_PX = 24

let measureHost: HTMLDivElement | null = null
let measureContent: HTMLDivElement | null = null

/** A single hidden `.editor .ProseMirror` node, off-screen but genuinely
 *  laid out, reused across calls. Nesting `.ProseMirror` inside `.editor`
 *  means it picks up the exact same typography CSS the visible editor uses
 *  (font, size, line-height, paragraph/heading spacing) with zero duplicated
 *  rules — "actual formatting" comes from the real stylesheet, not a guess. */
function ensureMeasureNodes(): { content: HTMLDivElement } {
  if (!measureHost || !measureContent) {
    measureHost = document.createElement('div')
    measureHost.className = 'editor page-measure-host'
    measureHost.setAttribute('aria-hidden', 'true')

    measureContent = document.createElement('div')
    measureContent.className = 'ProseMirror page-measure-content'

    measureHost.appendChild(measureContent)
    document.body.appendChild(measureHost)
  }
  return { content: measureContent }
}

/** Blocks that hold text directly, and so get a line box when empty. */
const TEXTBLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'LI'])

/**
 * Gives empty paragraphs the height they actually occupy on screen.
 *
 * `editor.getHTML()` serializes an empty paragraph as `<p></p>`, but a block
 * with no inline content generates no line box, so it measures zero pixels
 * tall. ProseMirror's own view never shows one that way: it renders a
 * trailing `<br>` into every empty textblock, which is why pressing Enter
 * gives you a blank line you can see and put a cursor on.
 *
 * Without this, a run of blank lines — a screenful of them, from holding
 * Enter — measured as a document of no height at all, so pagination never
 * found anything to break and the text ran off the page no matter how long
 * you waited. The measurement rig has to reproduce what the editor renders,
 * not what it serializes.
 */
function giveEmptyBlocksALineBox(root: HTMLElement): void {
  for (const el of Array.from(root.querySelectorAll('*')) as HTMLElement[]) {
    if (!TEXTBLOCK_TAGS.has(el.tagName)) continue
    // An element child means real content — an image, or a footnote marker
    // whose textContent is empty but which still occupies a line.
    if (el.childElementCount > 0) continue
    if ((el.textContent ?? '') !== '') continue
    el.appendChild(document.createElement('br'))
  }
}

export interface PageGeometry {
  /** The whole sheet, paper edge to paper edge. */
  pageWidthPx: number
  pageHeightPx: number
  /** Page margin, applied as the writing column's padding. */
  marginPx: number
  /** The text area inside the margins. */
  usableWidthPx: number
  usableHeightPx: number
}

/** Physical page size in CSS pixels at 96dpi. The single place the mm→px
 *  conversion happens, so the measurement rig, the rendered sheets, and the
 *  writing column can never disagree about how big a page is. */
export function pageGeometry(pageSize: PageSize, marginMm: number): PageGeometry {
  const { widthMm, heightMm } = PAGE_DIMENSIONS_MM[pageSize]
  const marginPx = marginMm * PX_PER_MM
  return {
    pageWidthPx: widthMm * PX_PER_MM,
    pageHeightPx: heightMm * PX_PER_MM,
    marginPx,
    usableWidthPx: (widthMm - marginMm * 2) * PX_PER_MM,
    usableHeightPx: (heightMm - marginMm * 2) * PX_PER_MM
  }
}

/**
 * A point where content has to move down onto the next page.
 *
 * `blockIndex` indexes the document's top-level blocks. `charOffset` is where
 * inside that block the break falls, counted in ProseMirror positions — null
 * means the break sits before the whole block. Paragraphs longer than the
 * space left on a page are split at a line boundary rather than moved whole,
 * which is what a real paginated view does and what stops a long paragraph
 * from running through the gutter.
 */
export interface PageBreak {
  blockIndex: number
  charOffset: number | null
  gapPx: number
}

/** Text and inline atoms of one block, flattened so a Range endpoint can be
 *  placed at any character offset. Offsets count inline atoms (a footnote
 *  marker, an image) as one, matching how ProseMirror counts positions. */
interface Segment {
  node: Node
  kind: 'text' | 'atom'
  start: number
  length: number
}

function inlineSegments(block: HTMLElement): { segments: Segment[]; total: number } {
  const segments: Segment[] = []
  let offset = 0

  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const length = (child as Text).length
        if (length > 0) {
          segments.push({ node: child, kind: 'text', start: offset, length })
          offset += length
        }
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const el = child as HTMLElement
      const tag = el.tagName
      // Leaf inline elements are atoms: a Range endpoint cannot go inside
      // them, and ProseMirror counts each as a single position.
      if (tag === 'BR' || tag === 'IMG' || el.hasAttribute('data-footnote') || el.childNodes.length === 0) {
        segments.push({ node: el, kind: 'atom', start: offset, length: 1 })
        offset += 1
        continue
      }
      walk(el)
    }
  }

  walk(block)
  return { segments, total: offset }
}

/** Places a Range's end at a character offset within the block. */
function setRangeEnd(range: Range, segments: Segment[], offset: number): boolean {
  for (const segment of segments) {
    const end = segment.start + segment.length
    if (offset > end) continue
    if (segment.kind === 'text') {
      range.setEnd(segment.node, offset - segment.start)
    } else if (offset === end) {
      range.setEndAfter(segment.node)
    } else {
      range.setEndBefore(segment.node)
    }
    return true
  }
  return false
}

/**
 * Finds the line boundary inside a block at or above `yLimit` (measured from
 * the block's own top), so the remainder can be moved to the next page.
 *
 * Binary searches on character offset and asks the browser where that much
 * text actually ends — the only reliable way to find a line boundary, since
 * line breaking depends on the font, the measure, and every inline mark in
 * the paragraph. Returns null when the block cannot usefully be split there,
 * in which case the caller moves it whole instead.
 */
function lineSplit(
  block: HTMLElement,
  yLimit: number
): { charOffset: number; lineTop: number } | null {
  const { segments, total } = inlineSegments(block)
  if (total === 0) return null

  const blockTop = block.getBoundingClientRect().top
  const range = document.createRange()
  range.setStart(block, 0)

  const bottomAt = (offset: number): number => {
    if (!setRangeEnd(range, segments, offset)) return Number.POSITIVE_INFINITY
    const rect = range.getBoundingClientRect()
    // A degenerate rect (offset 0, or a collapsed range) has no useful bottom.
    if (rect.height === 0 && rect.top === 0) return 0
    return rect.bottom - blockTop
  }

  // Largest offset whose text still ends at or above the limit.
  let low = 0
  let high = total
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (bottomAt(mid) <= yLimit) low = mid
    else high = mid - 1
  }

  if (low <= 0 || low >= total) return null
  const lineTop = bottomAt(low)
  if (lineTop <= 0) return null
  return { charOffset: low, lineTop }
}

export interface Pagination {
  /** Real pages, counting a block that straddles a boundary as living wholly
   *  on the later page — not a height ratio. */
  pageCount: number
  breaks: PageBreak[]
  geometry: PageGeometry
  /** Height the sheet stack occupies, for the container's min-height. */
  stackHeightPx: number
}

/**
 * Works out where page breaks actually fall.
 *
 * The measurement rig is the same one the page count has always used: the
 * document's real HTML, laid out off-screen at the page's usable width with
 * the real editor stylesheet. What's new is that this reads each top-level
 * block's own position and height rather than only the total, because a
 * total can tell you how many pages' worth of text there is but never where
 * one page ends.
 *
 * The distinction matters and is why a ratio could not simply be reused: a
 * height ratio implicitly assumes content can be sliced at any pixel offset.
 * Real pages break between lines, so the count depends on where those lines
 * fall. That produces at least as many pages as the ratio, usually more.
 *
 * Paragraphs are split at a line boundary, not moved whole — the same as
 * Word or any PDF viewer, and the only way a paragraph longer than a page
 * can be shown at all. Headings are the exception: they move whole, since a
 * heading split across a page break is a typographic error rather than a
 * long paragraph.
 *
 * A single line taller than a whole page (an oversized image) has nowhere
 * legal to go, so it is left to overflow its sheet rather than looping.
 */
export function paginate(html: string, pageSize: PageSize, marginMm: number): Pagination {
  const geometry = pageGeometry(pageSize, marginMm)
  const { usableWidthPx, usableHeightPx, pageHeightPx } = geometry

  const empty: Pagination = {
    pageCount: 1,
    breaks: [],
    geometry,
    stackHeightPx: pageHeightPx
  }
  if (usableWidthPx <= 0 || usableHeightPx <= 0) return empty

  const { content } = ensureMeasureNodes()
  content.style.width = `${usableWidthPx}px`
  content.innerHTML = html && html.trim() ? html : '<p></p>'
  giveEmptyBlocksALineBox(content)

  const blocks = Array.from(content.children) as HTMLElement[]
  if (blocks.length === 0) return empty

  // Distance from one page's content-area top to the next: the text area,
  // plus the two margins and the visible gutter that separate the sheets.
  const stride = usableHeightPx + geometry.marginPx * 2 + PAGE_GAP_PX

  const contentTop = content.offsetTop
  const breaks: PageBreak[] = []
  let gapTotal = 0
  let page = 0
  // Set by a manual page or chapter break, and consumed by the next block.
  let forcedBreakPending = false

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]
    const naturalTop = block.offsetTop - contentTop
    const height = block.offsetHeight
    const unsplittable = /^H[1-6]$/.test(block.tagName)

    // A break the writer inserted from the Insert menu is pagination input,
    // not decoration: whatever follows it starts a new page whether or not
    // the natural flow would have broken there. Both kinds break the page —
    // a chapter break additionally carries meaning for manuscript export.
    if (forcedBreakPending) {
      forcedBreakPending = false
      const target = (page + 1) * stride
      const top = naturalTop + gapTotal
      if (target > top) {
        gapTotal += target - top
        breaks.push({ blockIndex: i, charOffset: null, gapPx: target - top })
        page += 1
      }
    }

    if (block.hasAttribute('data-page-break') || block.hasAttribute('data-chapter-break')) {
      forcedBreakPending = true
      // The marker itself is zero-height and stays on the page it ends.
      continue
    }

    // How much of this block (in its own coordinates) is already placed.
    // A block longer than a page needs a break per page it spans.
    let consumed = 0
    // Hard stop: every iteration must either place the rest of the block or
    // advance a page, so this can only be reached by a layout pathology.
    for (let guard = 0; guard < 512; guard += 1) {
      const segmentTop = naturalTop + consumed + gapTotal
      const pageEnd = page * stride + usableHeightPx
      if (segmentTop + (height - consumed) <= pageEnd) break

      const target = (page + 1) * stride
      const yLimit = pageEnd - naturalTop - gapTotal
      const split = unsplittable || consumed > 0 && height - consumed <= usableHeightPx
        ? null
        : lineSplit(block, yLimit)

      if (split && split.lineTop > consumed) {
        const push = target - (naturalTop + split.lineTop + gapTotal)
        if (push <= 0) {
          page += 1
          continue
        }
        gapTotal += push
        breaks.push({ blockIndex: i, charOffset: split.charOffset, gapPx: push })
        consumed = split.lineTop
        page += 1
        continue
      }

      // Nothing splittable here: move what's left down whole. Only possible
      // before any of the block has been placed — once part of it sits on a
      // page, the remainder is already anchored.
      const push = target - segmentTop
      if (consumed === 0 && push > 0 && height <= usableHeightPx) {
        gapTotal += push
        breaks.push({ blockIndex: i, charOffset: null, gapPx: push })
        page += 1
        break
      }

      // Taller than a page with no line boundary to use: let it overflow and
      // advance past the pages it covers.
      page += 1
      if (naturalTop + gapTotal + height <= page * stride + usableHeightPx) break
    }
  }

  const last = blocks[blocks.length - 1]
  const contentBottom = last.offsetTop - contentTop + last.offsetHeight + gapTotal
  const pageCount = Math.max(1, page + 1, Math.ceil((contentBottom + 1) / stride))

  return {
    pageCount,
    breaks,
    geometry,
    stackHeightPx: pageCount * stride - PAGE_GAP_PX
  }
}

/**
 * How many pages the document occupies.
 *
 * Derived from paginate() rather than computed separately, so the number in
 * the footer and the sheets on screen come from one calculation and cannot
 * drift apart. This used to return a fractional height ratio; it now returns
 * whole pages, because a page you can see is a whole page.
 */
export function computePageCount(html: string, pageSize: PageSize, marginMm: number): number {
  return paginate(html, pageSize, marginMm).pageCount
}
