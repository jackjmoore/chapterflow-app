import { parse, HTMLElement, Node, NodeType } from 'node-html-parser'

export interface Run {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  highlight?: string
  /** A footnote marker sits in the run stream where the superscript appears.
   *  `text` is empty for these; `footnote` carries the note's own text. The
   *  running number is never stored — every renderer derives it from document
   *  order, so deleting note 2 renumbers the rest with no bookkeeping. */
  footnote?: string
}

export type BlockKind =
  | 'paragraph'
  | 'heading'
  | 'blockquote'
  | 'bullet'
  | 'ordered'
  | 'pageBreak'
  | 'chapterBreak'
  | 'chapterLine'
  | 'image'
export type Align = 'left' | 'center' | 'right' | 'justify'

export interface Block {
  kind: BlockKind
  level?: number
  align?: Align
  runs: Run[]
  /** Set only on `image` blocks — the file's id inside the project's own
   *  documents/images folder. Renderers resolve it to bytes themselves. */
  imageId?: string
  alt?: string
}

/** node-html-parser returns `undefined` — not `null` — for an attribute that
 *  isn't present, so a `!== null` test is true for every element and the
 *  first branch of a dispatch chain swallows all the rest. Always go through
 *  this. */
function hasAttr(el: HTMLElement, name: string): boolean {
  return el.getAttribute(name) != null
}

function extractStyle(el: HTMLElement, prop: string): string | undefined {
  const style = el.getAttribute('style')
  if (!style) return undefined
  const match = new RegExp(`${prop}\\s*:\\s*([^;]+)`, 'i').exec(style)
  return match ? match[1].trim() : undefined
}

function collectRuns(
  node: Node,
  inherited: { bold?: boolean; italic?: boolean; underline?: boolean; color?: string; highlight?: string },
  out: Run[]
): void {
  if (node.nodeType === NodeType.TEXT_NODE) {
    const text = node.rawText
    if (text) out.push({ text, ...inherited })
    return
  }
  if (node.nodeType !== NodeType.ELEMENT_NODE) return
  const el = node as HTMLElement
  const tag = el.tagName?.toLowerCase()

  // A footnote marker is an atom: it contributes a run of its own and has no
  // text children worth descending into.
  if (tag === 'sup' && hasAttr(el, 'data-footnote')) {
    out.push({ text: '', footnote: el.getAttribute('data-footnote') ?? '' })
    return
  }

  const next = { ...inherited }
  if (tag === 'strong' || tag === 'b') next.bold = true
  if (tag === 'em' || tag === 'i') next.italic = true
  if (tag === 'u') next.underline = true
  const color = extractStyle(el, 'color')
  if (color && tag !== 'mark') next.color = color
  const bg = extractStyle(el, 'background-color')
  if (bg || tag === 'mark') next.highlight = bg || next.highlight || '#ffff00'
  for (const child of el.childNodes) collectRuns(child, next, out)
}

function runsOf(el: HTMLElement): Run[] {
  const runs: Run[] = []
  for (const child of el.childNodes) collectRuns(child, {}, runs)
  return runs
}

function alignOf(el: HTMLElement): Align | undefined {
  const align = extractStyle(el, 'text-align')
  if (align === 'left' || align === 'center' || align === 'right' || align === 'justify') return align
  return undefined
}

/** Unwraps a single <p> wrapper some TipTap nodes (blockquote, li) place around their content. */
function innerParagraph(el: HTMLElement): HTMLElement {
  const children = el.childNodes.filter((n) => n.nodeType === NodeType.ELEMENT_NODE) as HTMLElement[]
  if (children.length === 1 && children[0].tagName?.toLowerCase() === 'p') return children[0]
  return el
}

/** Parses TipTap-generated HTML (a bounded, known tag/attribute set) into a flat block model
 *  shared by all four export formats — one parser, multiple renderers. */
export function htmlToBlocks(html: string): Block[] {
  const root = parse(html)
  const blocks: Block[] = []

  for (const node of root.childNodes) {
    if (node.nodeType !== NodeType.ELEMENT_NODE) continue
    const el = node as HTMLElement
    const tag = el.tagName?.toLowerCase()

    // Structural atoms carry no runs — they're recognized by the data
    // attribute their TipTap node serializes, never by a bare tag, so a
    // chapter line stays distinguishable from a page break.
    if (tag === 'div' && hasAttr(el, 'data-page-break')) {
      blocks.push({ kind: 'pageBreak', runs: [] })
    } else if (tag === 'div' && hasAttr(el, 'data-chapter-break')) {
      blocks.push({ kind: 'chapterBreak', runs: [] })
    } else if (tag === 'div' && hasAttr(el, 'data-chapter-line')) {
      blocks.push({ kind: 'chapterLine', runs: [] })
    } else if (tag === 'img' && hasAttr(el, 'data-image-id')) {
      blocks.push({
        kind: 'image',
        runs: [],
        imageId: el.getAttribute('data-image-id') ?? undefined,
        alt: el.getAttribute('alt') ?? undefined
      })
    } else if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      blocks.push({ kind: 'heading', level: Number(tag[1]), align: alignOf(el), runs: runsOf(el) })
    } else if (tag === 'blockquote') {
      const inner = innerParagraph(el)
      blocks.push({ kind: 'blockquote', align: alignOf(inner), runs: runsOf(inner) })
    } else if (tag === 'ul' || tag === 'ol') {
      const kind: BlockKind = tag === 'ul' ? 'bullet' : 'ordered'
      for (const li of el.childNodes) {
        if (li.nodeType !== NodeType.ELEMENT_NODE) continue
        const liEl = li as HTMLElement
        if (liEl.tagName?.toLowerCase() !== 'li') continue
        const inner = innerParagraph(liEl)
        blocks.push({ kind, align: alignOf(inner), runs: runsOf(inner) })
      }
    } else if (tag === 'p') {
      blocks.push({ kind: 'paragraph', align: alignOf(el), runs: runsOf(el) })
    }
  }

  return blocks
}
