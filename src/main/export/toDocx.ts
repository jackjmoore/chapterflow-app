import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  TextRun,
  convertInchesToTwip,
  type ISectionOptions
} from 'docx'
import { SCENE_BREAK_MARK, effectiveMarginMm, type ExportOptions } from '../../shared/export'
import { isSceneBreakBlock } from './blocksToHtml'
import type { Align, Block, Run } from './htmlToBlocks'

export const HEADING_LEVELS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3]

const ALIGN_MAP: Record<Align, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED
}

const NAMED_COLORS: Record<string, string> = {
  black: '000000', white: 'ffffff', red: 'ff0000', green: '008000', lime: '00ff00',
  blue: '0000ff', yellow: 'ffff00', cyan: '00ffff', aqua: '00ffff', magenta: 'ff00ff',
  fuchsia: 'ff00ff', gray: '808080', grey: '808080', silver: 'c0c0c0', maroon: '800000',
  olive: '808000', navy: '000080', purple: '800080', teal: '008080', orange: 'ffa500'
}

/**
 * docx needs a bare 6-digit hex. The colors reaching here are whatever CSS the
 * editor saved, and a browser normalizes an inline `color: #ff0000` to
 * `rgb(255, 0, 0)` when TipTap re-reads it — so a document containing any
 * colored text arrives here in rgb() form after its first load/save cycle.
 * Returns undefined for anything unrecognized so one odd color value can never
 * fail an entire export.
 */
function hex(color: string): string | undefined {
  const value = color.trim().toLowerCase()

  const named = NAMED_COLORS[value]
  if (named) return named

  if (value.startsWith('#')) {
    const digits = value.slice(1)
    if (/^[0-9a-f]{6}$/.test(digits)) return digits
    // #abc shorthand
    if (/^[0-9a-f]{3}$/.test(digits)) return digits.split('').map((d) => d + d).join('')
    if (/^[0-9a-f]{8}$/.test(digits)) return digits.slice(0, 6)
    return undefined
  }

  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(value)
  if (rgb) {
    const channel = (raw: string): string =>
      Math.max(0, Math.min(255, Math.round(Number(raw)))).toString(16).padStart(2, '0')
    return `${channel(rgb[1])}${channel(rgb[2])}${channel(rgb[3])}`
  }

  return undefined
}

function toTextRun(run: Run): TextRun {
  // An unrecognized color drops to "no color" rather than emitting an invalid
  // value — the run's text still exports.
  const fill = run.highlight ? hex(run.highlight) : undefined
  return new TextRun({
    text: run.text,
    bold: run.bold,
    italics: run.italic,
    underline: run.underline ? {} : undefined,
    color: run.color ? hex(run.color) : undefined,
    shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined
  })
}

function toParagraph(block: Block, orderedLevel: number): Paragraph {
  const children = block.runs.length ? block.runs.map(toTextRun) : [new TextRun('')]
  const alignment = block.align ? ALIGN_MAP[block.align] : undefined

  if (block.kind === 'heading') {
    return new Paragraph({ heading: HEADING_LEVELS[(block.level ?? 1) - 1], alignment, children })
  }
  if (block.kind === 'blockquote') {
    return new Paragraph({ indent: { left: 720 }, alignment, children })
  }
  if (block.kind === 'bullet') {
    return new Paragraph({ bullet: { level: 0 }, alignment, children })
  }
  if (block.kind === 'ordered') {
    return new Paragraph({
      numbering: { reference: 'export-ordered-list', level: 0, instance: orderedLevel },
      alignment,
      children
    })
  }
  return new Paragraph({ alignment, children })
}

/** Converts a shared Block[] model into docx Paragraphs — used for both a single
 *  document export and as one section's worth of content in a project export. */
export function blocksToDocxParagraphs(blocks: Block[], manuscript = false): Paragraph[] {
  let orderedInstance = 0
  let prevWasOrdered = false
  const paragraphs: Paragraph[] = []
  for (const block of blocks) {
    if (manuscript && block.kind === 'paragraph' && isSceneBreakBlock(block)) {
      paragraphs.push(
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(SCENE_BREAK_MARK)] })
      )
      prevWasOrdered = false
      continue
    }
    if (block.kind === 'ordered' && !prevWasOrdered) orderedInstance += 1
    prevWasOrdered = block.kind === 'ordered'
    paragraphs.push(toParagraph(block, orderedInstance))
  }
  return paragraphs
}

const MM_PER_INCH = 25.4

/**
 * Document-level styling for standard manuscript format: Times New Roman 12pt
 * (24 half-points), true double spacing (240 twips = one line, so 480 = two),
 * a half-inch first-line indent, and no space between paragraphs. Applied to
 * the default style so it reaches every paragraph without touching the block
 * model or the per-run formatting the writer actually chose.
 */
function manuscriptStyles() {
  return {
    default: {
      document: {
        run: { font: 'Times New Roman', size: 24, color: '000000' },
        paragraph: { spacing: { line: 480, before: 0, after: 0 }, indent: { firstLine: convertInchesToTwip(0.5) } }
      },
      heading1: {
        run: { font: 'Times New Roman', size: 24, bold: false, color: '000000' },
        paragraph: { alignment: AlignmentType.CENTER, spacing: { line: 480, before: 0, after: 480 }, indent: { firstLine: 0 } }
      },
      heading2: {
        run: { font: 'Times New Roman', size: 24, bold: false, color: '000000' },
        paragraph: { alignment: AlignmentType.CENTER, spacing: { line: 480, before: 0, after: 480 }, indent: { firstLine: 0 } }
      },
      heading3: {
        run: { font: 'Times New Roman', size: 24, bold: false, color: '000000' },
        paragraph: { alignment: AlignmentType.CENTER, spacing: { line: 480, before: 0, after: 480 }, indent: { firstLine: 0 } }
      }
    }
  }
}

/** `Surname / TITLE / 3` in the top-right, the convention agents read. */
function manuscriptHeader(options: ExportOptions): Header {
  const trimmed = (options.authorName ?? '').trim()
  const surname = trimmed ? trimmed.split(/\s+/).slice(-1)[0] : ''
  const label = [surname, options.title.toUpperCase()].filter(Boolean).join(' / ')
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        indent: { firstLine: 0 },
        spacing: { line: 240 },
        children: [
          new TextRun({ text: label ? `${label} / ` : '', font: 'Times New Roman', size: 24 }),
          new TextRun({ children: [PageNumber.CURRENT], font: 'Times New Roman', size: 24 })
        ]
      })
    ]
  })
}

/** Section-level page geometry + running header for the manuscript preset. */
export function manuscriptSectionProperties(options: ExportOptions): Partial<ISectionOptions> {
  const marginTwips = Math.round((effectiveMarginMm(options) / MM_PER_INCH) * 1440)
  return {
    properties: {
      page: {
        margin: { top: marginTwips, bottom: marginTwips, left: marginTwips, right: marginTwips }
      }
    },
    headers: { default: manuscriptHeader(options) },
    // Supplied empty so Word doesn't inherit a footer from elsewhere.
    footers: { default: new Footer({ children: [new Paragraph({ children: [] })] }) }
  }
}

export async function sectionsToDocxBuffer(
  sections: ISectionOptions[],
  options?: ExportOptions
): Promise<Buffer> {
  const manuscript = options?.preset === 'manuscript'
  const doc = new Document({
    styles: manuscript ? manuscriptStyles() : undefined,
    numbering: {
      config: [
        {
          reference: 'export-ordered-list',
          levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }]
        }
      ]
    },
    sections: manuscript && options ? sections.map((s) => ({ ...manuscriptSectionProperties(options), ...s })) : sections
  })
  return Packer.toBuffer(doc)
}

export async function blocksToDocxBuffer(blocks: Block[]): Promise<Buffer> {
  return sectionsToDocxBuffer([{ children: blocksToDocxParagraphs(blocks) }])
}
