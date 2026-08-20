import { parse, HTMLElement, Node, NodeType } from 'node-html-parser'

export interface Run {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  highlight?: string
}

export type BlockKind = 'paragraph' | 'heading' | 'blockquote' | 'bullet' | 'ordered'
export type Align = 'left' | 'center' | 'right' | 'justify'

export interface Block {
  kind: BlockKind
  level?: number
  align?: Align
  runs: Run[]
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

    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
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
