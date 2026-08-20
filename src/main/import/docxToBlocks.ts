import JSZip from 'jszip'
import { xml2js } from 'xml-js'
import type { Align, Block, BlockKind, Run } from '../export/htmlToBlocks'
import type { ImportWarningKind } from '../../shared/import'

/**
 * Reads a .docx into the app's own flat Block/Run model — the exact same
 * representation htmlToBlocks produces from saved documents, so imported
 * content is indistinguishable from anything else once it lands.
 *
 * A .docx is a ZIP of XML parts. Everything the app can represent lives in
 * word/document.xml, except bullet-vs-numbered, which requires resolving a
 * numbering id through word/numbering.xml. Anything Word can express that
 * this app cannot (tables, images, footnotes, tracked-change markup, …) is
 * either flattened to its text or dropped — and every such case is counted
 * so the import can report it rather than lose it silently.
 */

interface XmlNode {
  type?: string
  name?: string
  text?: string
  attributes?: Record<string, string>
  elements?: XmlNode[]
}

export interface DocxParseResult {
  blocks: Block[]
  warnings: Partial<Record<ImportWarningKind, number>>
}

function children(node: XmlNode | undefined): XmlNode[] {
  return node?.elements ?? []
}

function findChild(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return children(node).find((c) => c.name === name)
}

function attr(node: XmlNode | undefined, name: string): string | undefined {
  return node?.attributes?.[name]
}

/** An OOXML on/off toggle: present means on unless it says w:val="0"/"false". */
function toggleOn(rPr: XmlNode | undefined, name: string): boolean {
  const el = findChild(rPr, name)
  if (!el) return false
  const val = attr(el, 'w:val')
  return val !== '0' && val !== 'false' && val !== 'off'
}

function normalizeColor(value: string | undefined): string | undefined {
  if (!value || value === 'auto') return undefined
  return /^[0-9a-fA-F]{6}$/.test(value) ? `#${value.toLowerCase()}` : value
}

const HIGHLIGHT_NAMES: Record<string, string> = {
  yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff',
  blue: '#0000ff', red: '#ff0000', darkBlue: '#000080', darkCyan: '#008080',
  darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000',
  darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0'
}

class WarningTally {
  private counts: Partial<Record<ImportWarningKind, number>> = {}
  add(kind: ImportWarningKind, n = 1): void {
    this.counts[kind] = (this.counts[kind] ?? 0) + n
  }
  get result(): Partial<Record<ImportWarningKind, number>> {
    return this.counts
  }
}

/** Maps a numbering id to 'bullet' | 'ordered' by resolving w:num -> w:abstractNum
 *  -> that level's w:numFmt in numbering.xml. Word only tells you which list
 *  definition a paragraph belongs to, never directly whether it's bulleted. */
function buildNumberingMap(numberingXml: string | null): Map<string, BlockKind> {
  const map = new Map<string, BlockKind>()
  if (!numberingXml) return map
  try {
    const root = xml2js(numberingXml, { compact: false }) as XmlNode
    const numbering = findChild(root, 'w:numbering')
    if (!numbering) return map

    const abstractFormat = new Map<string, BlockKind>()
    for (const abstract of children(numbering).filter((c) => c.name === 'w:abstractNum')) {
      const abstractId = attr(abstract, 'w:abstractNumId')
      if (!abstractId) continue
      // Level 0 decides the kind; deeper levels flatten into it anyway.
      const lvl = children(abstract).find((c) => c.name === 'w:lvl' && attr(c, 'w:ilvl') === '0')
        ?? children(abstract).find((c) => c.name === 'w:lvl')
      const fmt = attr(findChild(lvl, 'w:numFmt'), 'w:val')
      abstractFormat.set(abstractId, fmt === 'bullet' ? 'bullet' : 'ordered')
    }

    for (const num of children(numbering).filter((c) => c.name === 'w:num')) {
      const numId = attr(num, 'w:numId')
      const abstractId = attr(findChild(num, 'w:abstractNumId'), 'w:val')
      if (!numId || !abstractId) continue
      map.set(numId, abstractFormat.get(abstractId) ?? 'ordered')
    }
  } catch {
    // Malformed numbering.xml — every list falls back to bullet below.
  }
  return map
}

/** Collects the runs of one paragraph, descending through wrappers Word uses
 *  (hyperlinks, tracked-change containers, smart tags) rather than skipping
 *  them, so their text is never lost. */
function collectRuns(node: XmlNode, out: Run[], tally: WarningTally): void {
  for (const child of children(node)) {
    switch (child.name) {
      case 'w:r':
        pushRun(child, out, tally)
        break
      case 'w:hyperlink':
        // Link text is kept; there is no link mark in the editor schema.
        tally.add('hyperlinksFlattened')
        collectRuns(child, out, tally)
        break
      case 'w:ins':
        // An accepted insertion IS the current text.
        tally.add('trackedChangesAccepted')
        collectRuns(child, out, tally)
        break
      case 'w:del':
        // Deleted text (w:delText) is not part of the final document.
        tally.add('trackedChangesAccepted')
        break
      case 'w:smartTag':
      case 'w:sdtContent':
      case 'w:sdt':
        collectRuns(child, out, tally)
        break
      case 'w:commentRangeStart':
      case 'w:commentReference':
        tally.add('commentsDropped')
        break
      default:
        break
    }
  }
}

function pushRun(runNode: XmlNode, out: Run[], tally: WarningTally): void {
  const rPr = findChild(runNode, 'w:rPr')

  let text = ''
  for (const child of children(runNode)) {
    if (child.name === 'w:t') {
      text += children(child).map((t) => t.text ?? '').join('')
    } else if (child.name === 'w:tab') {
      text += ' '
    } else if (child.name === 'w:br' || child.name === 'w:cr') {
      text += ' '
    } else if (child.name === 'w:drawing' || child.name === 'w:pict' || child.name === 'w:object') {
      tally.add('imagesDropped')
    } else if (child.name === 'w:footnoteReference' || child.name === 'w:endnoteReference') {
      tally.add('footnotesDropped')
    } else if (child.name === 'w:commentReference') {
      tally.add('commentsDropped')
    }
  }
  if (!text) return

  if (toggleOn(rPr, 'w:strike') || toggleOn(rPr, 'w:dstrike') || findChild(rPr, 'w:vertAlign')) {
    tally.add('unsupportedFormattingDropped')
  }

  const run: Run = { text }
  if (toggleOn(rPr, 'w:b')) run.bold = true
  if (toggleOn(rPr, 'w:i')) run.italic = true
  const u = findChild(rPr, 'w:u')
  if (u && attr(u, 'w:val') !== 'none') run.underline = true
  const color = normalizeColor(attr(findChild(rPr, 'w:color'), 'w:val'))
  if (color) run.color = color
  const highlightName = attr(findChild(rPr, 'w:highlight'), 'w:val')
  const shading = normalizeColor(attr(findChild(rPr, 'w:shd'), 'w:fill'))
  const highlight = highlightName ? (HIGHLIGHT_NAMES[highlightName] ?? highlightName) : shading
  if (highlight) run.highlight = highlight

  out.push(run)
}

const ALIGN_MAP: Record<string, Align> = {
  left: 'left', start: 'left',
  center: 'center', centre: 'center',
  right: 'right', end: 'right',
  both: 'justify', distribute: 'justify'
}

/** Word style ids vary by locale/version ("Heading1", "heading 1", "Ttulo1"),
 *  so match the digit rather than the whole string. */
function headingLevelFromStyle(styleId: string | undefined): number | null {
  if (!styleId) return null
  const normalized = styleId.replace(/\s+/g, '').toLowerCase()
  if (!normalized.startsWith('heading') && !normalized.startsWith('berschrift')) return null
  const match = /(\d+)/.exec(normalized)
  return match ? Number(match[1]) : null
}

function isQuoteStyle(styleId: string | undefined): boolean {
  if (!styleId) return false
  const n = styleId.replace(/\s+/g, '').toLowerCase()
  return n === 'quote' || n === 'intensequote' || n === 'blockquote'
}

function paragraphToBlock(
  pNode: XmlNode,
  numbering: Map<string, BlockKind>,
  tally: WarningTally
): Block | null {
  const pPr = findChild(pNode, 'w:pPr')
  const styleId = attr(findChild(pPr, 'w:pStyle'), 'w:val')

  const runs: Run[] = []
  collectRuns(pNode, runs, tally)

  const alignRaw = attr(findChild(pPr, 'w:jc'), 'w:val')
  const align = alignRaw ? ALIGN_MAP[alignRaw] : undefined

  const numPr = findChild(pPr, 'w:numPr')
  if (numPr) {
    const numId = attr(findChild(numPr, 'w:numId'), 'w:val')
    const ilvl = attr(findChild(numPr, 'w:ilvl'), 'w:val')
    if (ilvl && Number(ilvl) > 0) tally.add('nestedListsFlattened')
    // numId="0" means "list formatting removed" in OOXML.
    if (numId && numId !== '0') {
      const kind = numbering.get(numId) ?? 'bullet'
      return { kind, align, runs }
    }
  }

  const headingLevel = headingLevelFromStyle(styleId)
  if (headingLevel !== null) {
    if (headingLevel > 3) tally.add('headingsClamped')
    return { kind: 'heading', level: Math.min(Math.max(headingLevel, 1), 3), align, runs }
  }

  if (isQuoteStyle(styleId)) return { kind: 'blockquote', align, runs }

  return { kind: 'paragraph', align, runs }
}

/** Table cells become ordinary paragraphs in document order. The grid is lost
 *  (the app has no table node) but the words are not, which matters more. */
function tableToBlocks(tblNode: XmlNode, numbering: Map<string, BlockKind>, tally: WarningTally): Block[] {
  const blocks: Block[] = []
  const walk = (node: XmlNode): void => {
    for (const child of children(node)) {
      if (child.name === 'w:p') {
        const block = paragraphToBlock(child, numbering, tally)
        if (block && block.runs.length > 0) blocks.push(block)
      } else if (child.name === 'w:tr' || child.name === 'w:tc' || child.name === 'w:tbl') {
        walk(child)
      }
    }
  }
  walk(tblNode)
  return blocks
}

/** Yields to the event loop periodically so a large import can't starve other
 *  main-process IPC (autosave in particular) while it parses. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

const YIELD_EVERY_N_PARAGRAPHS = 500

export async function docxToBlocks(fileBuffer: Buffer): Promise<DocxParseResult> {
  const zip = await JSZip.loadAsync(fileBuffer)

  const documentFile = zip.file('word/document.xml')
  if (!documentFile) throw new Error('Not a Word document (no word/document.xml inside)')

  const [documentXml, numberingXml] = await Promise.all([
    documentFile.async('string'),
    zip.file('word/numbering.xml')?.async('string') ?? Promise.resolve(null)
  ])

  const numbering = buildNumberingMap(numberingXml)
  const tally = new WarningTally()

  const root = xml2js(documentXml, { compact: false }) as XmlNode
  const document = findChild(root, 'w:document')
  const body = findChild(document, 'w:body')
  if (!body) throw new Error('Word document has no body')

  const blocks: Block[] = []
  let processed = 0

  for (const node of children(body)) {
    if (node.name === 'w:p') {
      const block = paragraphToBlock(node, numbering, tally)
      if (block) blocks.push(block)
    } else if (node.name === 'w:tbl') {
      tally.add('tablesFlattened')
      blocks.push(...tableToBlocks(node, numbering, tally))
    }
    processed += 1
    if (processed % YIELD_EVERY_N_PARAGRAPHS === 0) await yieldToEventLoop()
  }

  // Trailing empty paragraphs are an artifact of how Word ends a body.
  while (blocks.length > 0 && blocks[blocks.length - 1].runs.length === 0) blocks.pop()

  return { blocks, warnings: tally.result }
}
