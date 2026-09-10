import { PAGE_DIMENSIONS_MM, type PageSize } from '../../shared/preferences'

const PX_PER_MM = 96 / 25.4

/** Visible gutter between two stacked pages. Also the amount by which a page
 *  boundary's push-down exceeds the paper margins, so it lives here rather
 *  than in CSS alone — the layout maths needs it. */
export const PAGE_GAP_PX = 24

let measureHost: HTMLDivElement | null = null
let measureContent: HTMLDivElement | null = null

/** Builds one hidden `.editor .ProseMirror` pair, off-screen but genuinely
 *  laid out. Nesting `.ProseMirror` inside `.editor` means it picks up the
 *  exact same typography CSS the visible editor uses (font, size,
 *  line-height, paragraph/heading spacing) with zero duplicated rules —
 *  "actual formatting" comes from the real stylesheet, not a guess. */
function createMeasureNodes(): { host: HTMLDivElement; content: HTMLDivElement } {
  const host = document.createElement('div')
  host.className = 'editor page-measure-host'
  host.setAttribute('aria-hidden', 'true')

  const content = document.createElement('div')
  content.className = 'ProseMirror page-measure-content'

  host.appendChild(content)
  document.body.appendChild(host)
  return { host, content }
}

/** The one-shot rig: reused across calls, rebuilt from scratch on each. */
function ensureMeasureNodes(): { content: HTMLDivElement } {
  if (!measureHost || !measureContent) {
    const nodes = createMeasureNodes()
    measureHost = nodes.host
    measureContent = nodes.content
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
export function giveEmptyBlocksALineBox(root: ParentNode): void {
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

/** Distance from one page's content-area top to the next: the text area,
 *  plus the two margins and the visible gutter that separate the sheets. */
function strideOf(geometry: PageGeometry): number {
  return geometry.usableHeightPx + geometry.marginPx * 2 + PAGE_GAP_PX
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

function emptyPagination(geometry: PageGeometry): Pagination {
  return { pageCount: 1, breaks: [], geometry, stackHeightPx: geometry.pageHeightPx }
}

/** The flow's running state between one block and the next. */
interface FlowState {
  page: number
  gapTotal: number
  /** Set by a manual page or chapter break, and consumed by the next block. */
  forcedBreakPending: boolean
}

const INITIAL_FLOW: FlowState = { page: 0, gapTotal: 0, forcedBreakPending: false }

function sameFlow(a: FlowState, b: FlowState): boolean {
  return a.page === b.page && a.gapTotal === b.gapTotal && a.forcedBreakPending === b.forcedBreakPending
}

/** Every block's natural position and height, read in one pass after layout. */
function measureBlocks(content: HTMLElement): { blocks: HTMLElement[]; tops: number[]; heights: number[] } {
  const blocks = Array.from(content.children) as HTMLElement[]
  const contentTop = content.offsetTop
  const tops = blocks.map((block) => block.offsetTop - contentTop)
  const heights = blocks.map((block) => block.offsetHeight)
  return { blocks, tops, heights }
}

/**
 * Places one block in the flow, advancing the state and appending whatever
 * breaks it produces. Works from the block's *natural* (gap-free) top, so
 * the same function serves a full pass and an incremental one resumed
 * partway through the document.
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
function placeBlock(
  block: HTMLElement,
  index: number,
  naturalTop: number,
  height: number,
  state: FlowState,
  usableHeightPx: number,
  stride: number,
  breaks: PageBreak[]
): void {
  const unsplittable = /^H[1-6]$/.test(block.tagName)

  // A break the writer inserted from the Insert menu is pagination input,
  // not decoration: whatever follows it starts a new page whether or not
  // the natural flow would have broken there. Both kinds break the page —
  // a chapter break additionally carries meaning for manuscript export.
  if (state.forcedBreakPending) {
    state.forcedBreakPending = false
    const target = (state.page + 1) * stride
    const top = naturalTop + state.gapTotal
    if (target > top) {
      state.gapTotal += target - top
      breaks.push({ blockIndex: index, charOffset: null, gapPx: target - top })
      state.page += 1
    }
  }

  if (block.hasAttribute('data-page-break') || block.hasAttribute('data-chapter-break')) {
    state.forcedBreakPending = true
    // The marker itself is zero-height and stays on the page it ends.
    return
  }

  // How much of this block (in its own coordinates) is already placed.
  // A block longer than a page needs a break per page it spans.
  let consumed = 0
  // Hard stop: every iteration must either place the rest of the block or
  // advance a page, so this can only be reached by a layout pathology.
  for (let guard = 0; guard < 512; guard += 1) {
    const segmentTop = naturalTop + consumed + state.gapTotal
    const pageEnd = state.page * stride + usableHeightPx
    if (segmentTop + (height - consumed) <= pageEnd) break

    const target = (state.page + 1) * stride
    const yLimit = pageEnd - naturalTop - state.gapTotal
    const split =
      unsplittable || (consumed > 0 && height - consumed <= usableHeightPx) ? null : lineSplit(block, yLimit)

    if (split && split.lineTop > consumed) {
      const push = target - (naturalTop + split.lineTop + state.gapTotal)
      if (push <= 0) {
        state.page += 1
        continue
      }
      state.gapTotal += push
      breaks.push({ blockIndex: index, charOffset: split.charOffset, gapPx: push })
      consumed = split.lineTop
      state.page += 1
      continue
    }

    // Nothing splittable here: move what's left down whole. Only possible
    // before any of the block has been placed — once part of it sits on a
    // page, the remainder is already anchored.
    const push = target - segmentTop
    if (consumed === 0 && push > 0 && height <= usableHeightPx) {
      state.gapTotal += push
      breaks.push({ blockIndex: index, charOffset: null, gapPx: push })
      state.page += 1
      break
    }

    // Taller than a page with no line boundary to use: let it overflow and
    // advance past the pages it covers.
    state.page += 1
    if (naturalTop + state.gapTotal + height <= state.page * stride + usableHeightPx) break
  }
}

function finishPagination(
  tops: number[],
  heights: number[],
  final: FlowState,
  geometry: PageGeometry,
  stride: number,
  breaks: PageBreak[]
): Pagination {
  const last = tops.length - 1
  const contentBottom = tops[last] + heights[last] + final.gapTotal
  const pageCount = Math.max(1, final.page + 1, Math.ceil((contentBottom + 1) / stride))
  return {
    pageCount,
    breaks,
    geometry,
    stackHeightPx: pageCount * stride - PAGE_GAP_PX
  }
}

/**
 * Works out where page breaks actually fall, from scratch.
 *
 * The measurement rig is the same one the page count has always used: the
 * document's real HTML, laid out off-screen at the page's usable width with
 * the real editor stylesheet. This reads each top-level block's own position
 * and height rather than only the total, because a total can tell you how
 * many pages' worth of text there is but never where one page ends.
 *
 * The distinction matters and is why a ratio could not simply be reused: a
 * height ratio implicitly assumes content can be sliced at any pixel offset.
 * Real pages break between lines, so the count depends on where those lines
 * fall. That produces at least as many pages as the ratio, usually more.
 *
 * This is the right call for content that arrives as one HTML string and is
 * measured once — Book View, the split pane's page count, an export preview.
 * The live editor uses paginateBlocks() below, which is the same arithmetic
 * over a persistent copy of the document that only re-lays-out what changed.
 */
export function paginate(html: string, pageSize: PageSize, marginMm: number): Pagination {
  const geometry = pageGeometry(pageSize, marginMm)
  if (geometry.usableWidthPx <= 0 || geometry.usableHeightPx <= 0) return emptyPagination(geometry)

  const { content } = ensureMeasureNodes()
  content.style.width = `${geometry.usableWidthPx}px`
  content.innerHTML = html && html.trim() ? html : '<p></p>'
  giveEmptyBlocksALineBox(content)

  const { blocks, tops, heights } = measureBlocks(content)
  if (blocks.length === 0) return emptyPagination(geometry)

  const stride = strideOf(geometry)
  const state: FlowState = { ...INITIAL_FLOW }
  const breaks: PageBreak[] = []
  for (let i = 0; i < blocks.length; i += 1) {
    placeBlock(blocks[i], i, tops[i], heights[i], state, geometry.usableHeightPx, stride, breaks)
  }
  return finishPagination(tops, heights, state, geometry, stride, breaks)
}

/** What the incremental rig remembers between passes. */
interface IncrementalRun {
  geometryKey: string
  /** One serialized top-level block per entry — what the rig's DOM holds. */
  blocks: string[]
  tops: number[]
  heights: number[]
  /** The flow state on arrival at each block. */
  arrivals: FlowState[]
  /** The breaks each block produced, carrying its own index. */
  breaksByBlock: PageBreak[][]
  final: FlowState
}

let incrementalContent: HTMLDivElement | null = null
let lastRun: IncrementalRun | null = null

function ensureIncrementalNodes(): HTMLDivElement {
  if (!incrementalContent) incrementalContent = createMeasureNodes().content
  return incrementalContent
}

/** Forgets the previous pass, so the next paginateBlocks() starts cold. */
export function resetIncrementalPagination(): void {
  lastRun = null
}

/** Swaps the rig's children in [start, end) for freshly parsed blocks,
 *  leaving every other block's DOM — and its layout — untouched. */
function replaceBlockRange(content: HTMLElement, start: number, end: number, html: string[]): void {
  const children = content.children
  // Read before removing: the collection is live, but the node is not.
  const anchor = children[end] ?? null
  for (let k = end - 1; k >= start; k -= 1) content.removeChild(children[k])
  if (html.length === 0) return
  const template = document.createElement('template')
  template.innerHTML = html.join('')
  giveEmptyBlocksALineBox(template.content)
  content.insertBefore(template.content, anchor)
}

/**
 * The live editor's pagination: the same measurement as paginate(), over a
 * copy of the document that persists between passes.
 *
 * Re-laying-out a whole manuscript from an HTML string was the cost that
 * made typing stutter on a long document — measured at 55 to 85ms per pass
 * on 100,000 words, every half second while typing. Almost none of that was
 * the pagination arithmetic; it was the browser parsing half a megabyte of
 * HTML and laying every paragraph out again to answer a question about one
 * of them. So the rig keeps the blocks it laid out last time, swaps only the
 * ones whose serialized HTML differs, and reads every block's position back
 * from a layout the browser has already done.
 *
 * The arithmetic is resumed rather than repeated. Blocks before the first
 * change keep the breaks they produced last time, since every input to them
 * is identical. Blocks after the last change are recomputed only if the edit
 * moved them: when the edited block kept its height — typing within a line,
 * the common case — the flow arrives at the unchanged tail in the same state
 * as before, and the tail's breaks are reused outright. When it grew or
 * shrank a line, the tail is re-run, which still costs a fraction of the
 * old full pass because nothing is parsed or laid out again.
 *
 * Callers hand over one HTML string per top-level block, in order. The
 * strings are compared by value, so a serializer that returns the same
 * string for an unchanged node makes the diff essentially free.
 */
export function paginateBlocks(blockHtml: string[], pageSize: PageSize, marginMm: number): Pagination {
  const geometry = pageGeometry(pageSize, marginMm)
  if (geometry.usableWidthPx <= 0 || geometry.usableHeightPx <= 0) return emptyPagination(geometry)

  // An empty document is still one empty paragraph, as paginate() has it.
  const next = blockHtml.length > 0 ? blockHtml : ['<p></p>']
  const content = ensureIncrementalNodes()
  const geometryKey = `${pageSize}/${marginMm}`
  let prev = lastRun && lastRun.geometryKey === geometryKey ? lastRun : null

  let prefix = 0
  let suffix = 0
  if (prev) {
    const old = prev.blocks
    const shared = Math.min(old.length, next.length)
    while (prefix < shared && old[prefix] === next[prefix]) prefix += 1
    while (suffix < shared - prefix && old[old.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix += 1
    replaceBlockRange(content, prefix, old.length - suffix, next.slice(prefix, next.length - suffix))
  } else {
    content.style.width = `${geometry.usableWidthPx}px`
    content.innerHTML = next.join('')
    giveEmptyBlocksALineBox(content)
  }

  let measured = measureBlocks(content)
  if (prev && measured.blocks.length !== next.length) {
    // The patched DOM and the block list disagree (a block whose HTML parsed
    // to something other than one element). Start over for this pass rather
    // than index breaks against the wrong blocks.
    content.innerHTML = next.join('')
    giveEmptyBlocksALineBox(content)
    measured = measureBlocks(content)
    prev = null
    prefix = 0
    suffix = 0
  }
  const { blocks, tops, heights } = measured
  if (blocks.length === 0) return emptyPagination(geometry)

  const stride = strideOf(geometry)

  // Resume at the first block whose content or geometry differs. Content
  // before the prefix is identical by construction; its positions are
  // re-checked anyway, so a layout surprise degrades to a longer pass rather
  // than a wrong one.
  let from = prev ? prefix : 0
  if (prev) {
    for (let i = 0; i < from; i += 1) {
      if (tops[i] !== prev.tops[i] || heights[i] !== prev.heights[i]) {
        from = i
        break
      }
    }
  }

  const arrivals: FlowState[] = prev ? prev.arrivals.slice(0, from) : []
  const breaksByBlock: PageBreak[][] = prev ? prev.breaksByBlock.slice(0, from) : []
  const resumeFrom = !prev || from === 0 ? INITIAL_FLOW : from < prev.arrivals.length ? prev.arrivals[from] : prev.final
  const state: FlowState = { ...resumeFrom }

  // The unchanged tail can be reused only if the edit left it where it was:
  // same positions and heights for every block in it. Checked once, up
  // front, so the per-block test below is a single state comparison.
  const shift = prev ? next.length - prev.blocks.length : 0
  const suffixStart = next.length - suffix
  let tailInPlace = prev !== null && suffix > 0
  if (tailInPlace && prev) {
    for (let j = suffixStart; j < next.length; j += 1) {
      if (tops[j] !== prev.tops[j - shift] || heights[j] !== prev.heights[j - shift]) {
        tailInPlace = false
        break
      }
    }
  }

  let final: FlowState | null = null
  for (let i = from; i < blocks.length; i += 1) {
    if (tailInPlace && prev && i >= suffixStart && sameFlow(state, prev.arrivals[i - shift])) {
      for (let j = i; j < blocks.length; j += 1) {
        const oldIndex = j - shift
        arrivals[j] = prev.arrivals[oldIndex]
        breaksByBlock[j] = prev.breaksByBlock[oldIndex].map((b) => ({ ...b, blockIndex: j }))
      }
      final = prev.final
      break
    }
    arrivals[i] = { ...state }
    const produced: PageBreak[] = []
    placeBlock(blocks[i], i, tops[i], heights[i], state, geometry.usableHeightPx, stride, produced)
    breaksByBlock[i] = produced
  }
  if (!final) final = { ...state }

  lastRun = { geometryKey, blocks: next, tops, heights, arrivals, breaksByBlock, final }
  return finishPagination(tops, heights, final, geometry, stride, breaksByBlock.flat())
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

/**
 * Where each page's content begins, in the coordinates of the *natural*
 * (gap-free) flow.
 *
 * The editor shows pages by inserting gap decorations into one continuous
 * flow; a plain re-render of the same HTML has no gaps, so its coordinates
 * are the natural ones. paginate() already knows both spaces: every break's
 * push satisfies `naturalStart = target − gapTotalAfter`, where target is the
 * page's top in gapped coordinates — so the starts fall out of the breaks by
 * accumulation, with no re-measurement. Book View clips windows of this
 * natural flow at these offsets to show page N, which is what keeps its pages
 * character-identical to the editor's sheets.
 *
 * Pages the break list doesn't cover (an unsplittable line taller than a
 * page, which paginate leaves to overflow) fall back to the same arithmetic
 * with the final gap total — approximate for exactly the content the editor
 * itself renders as overflow.
 */
export function pageStartOffsets(pagination: Pagination): number[] {
  const { pageCount, breaks, geometry } = pagination
  const stride = geometry.usableHeightPx + geometry.marginPx * 2 + PAGE_GAP_PX
  const starts: number[] = [0]
  let gapTotal = 0
  for (const pageBreak of breaks) {
    gapTotal += pageBreak.gapPx
    starts.push(starts.length * stride - gapTotal)
  }
  while (starts.length < pageCount) {
    starts.push(starts.length * stride - gapTotal)
  }
  return starts.slice(0, pageCount)
}
