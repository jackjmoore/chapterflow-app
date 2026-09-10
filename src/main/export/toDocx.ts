import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  ImageRun,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  TextRun,
  convertInchesToTwip,
  type ISectionOptions
} from 'docx'
import { CHAPTER_DROP_INCHES } from '../../shared/book'
import { effectiveMarginMm, type ExportOptions } from '../../shared/export'
import { PAGE_DIMENSIONS_MM } from '../../shared/preferences'
import { isSceneBreakBlock } from './blocksToHtml'
import { fitWithin, imageSize } from './imageSize'
import type { Align, Block, Run } from './htmlToBlocks'

/** An image resolved to bytes, ready for ImageRun. Callers resolve these
 *  before rendering, since the block walk itself is synchronous. */
export interface DocxImage {
  data: Buffer
  mime: string
}

/** docx only accepts these four container formats. WebP — which the image
 *  picker does accept, and which displays and exports to PDF perfectly well —
 *  has no representation in the Word format at all, so it maps to undefined
 *  and the image is skipped rather than written as a corrupt part. */
const DOCX_IMAGE_TYPES: Record<string, 'jpg' | 'png' | 'gif' | 'bmp'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/bmp': 'bmp'
}

/**
 * Collects footnote text in document order while paragraphs are built, so the
 * numbers docx assigns line up with the order the markers appear.
 *
 * Word footnotes live in a separate part of the .docx package, referenced by
 * id from the body — so unlike every other renderer, the note text can't be
 * emitted inline as it's encountered. It has to be gathered here and handed
 * to the Document constructor afterwards. Shared across sections so a
 * whole-project export numbers continuously rather than restarting per file.
 */
export interface FootnoteCollector {
  notes: { id: number; text: string }[]
}

export function createFootnoteCollector(): FootnoteCollector {
  return { notes: [] }
}

/** Word reserves footnote ids 0 and 1 for the separator marks it inserts into
 *  every document, so real notes have to start at 2 or they collide. */
const FIRST_FOOTNOTE_ID = 2

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

/** Builds a paragraph's children, turning footnote marker runs into real
 *  Word footnote references and registering their text with the collector. */
function toChildren(block: Block, footnotes: FootnoteCollector): (TextRun | FootnoteReferenceRun)[] {
  const children: (TextRun | FootnoteReferenceRun)[] = []
  for (const run of block.runs) {
    if (run.footnote !== undefined) {
      const id = FIRST_FOOTNOTE_ID + footnotes.notes.length
      footnotes.notes.push({ id, text: run.footnote })
      children.push(new FootnoteReferenceRun(id))
      continue
    }
    children.push(toTextRun(run))
  }
  return children.length ? children : [new TextRun('')]
}

function toParagraph(
  block: Block,
  orderedLevel: number,
  footnotes: FootnoteCollector,
  manuscript: boolean
): Paragraph {
  const children = toChildren(block, footnotes)
  // Standard manuscript format is never justified — writer-applied
  // justification drops to the default left there; other alignments (a
  // centered dedication line) are kept.
  const effectiveAlign = manuscript && block.align === 'justify' ? undefined : block.align
  const alignment = effectiveAlign ? ALIGN_MAP[effectiveAlign] : undefined

  if (block.kind === 'heading') {
    // keepNext: a heading must never strand alone at a page foot — it stays
    // with the first paragraph beneath it, matching the PDF's break-after:
    // avoid.
    return new Paragraph({ heading: HEADING_LEVELS[(block.level ?? 1) - 1], alignment, keepNext: true, children })
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

/** Printable column width in pixels at 96dpi, used to scale oversized images
 *  down. Letter width less one-inch margins, the manuscript default. */
const MAX_IMAGE_WIDTH_PX = 624

export interface DocxRenderOptions {
  manuscript?: boolean
  /** Normalize typed scene dividers (`***`, `---`) to this one centered
   *  marker — `#` for manuscript format, the project's scene-break setting
   *  for standard. Absent leaves dividers as typed. */
  sceneBreakMark?: string
  /** Shared across every section of a project export, so footnote numbering
   *  runs continuously through the whole manuscript. */
  footnotes?: FootnoteCollector
  /** Image id → bytes, resolved by the caller before rendering. */
  images?: Record<string, DocxImage>
}

/** Converts a shared Block[] model into docx Paragraphs — used for both a single
 *  document export and as one section's worth of content in a project export. */
export function blocksToDocxParagraphs(blocks: Block[], options: DocxRenderOptions = {}): Paragraph[] {
  const { manuscript = false, images = {} } = options
  const footnotes = options.footnotes ?? createFootnoteCollector()
  let orderedInstance = 0
  let prevWasOrdered = false
  const paragraphs: Paragraph[] = []
  for (const block of blocks) {
    if (options.sceneBreakMark && block.kind === 'paragraph' && isSceneBreakBlock(block)) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          // Manuscript's default first-line indent would push a centered
          // marker off-center.
          indent: { firstLine: 0 },
          children: [new TextRun(options.sceneBreakMark)]
        })
      )
      prevWasOrdered = false
      continue
    }

    if (block.kind === 'pageBreak' || block.kind === 'chapterBreak') {
      paragraphs.push(new Paragraph({ children: [new PageBreak()] }))
      // Manuscript convention: a new chapter opens partway down its page
      // rather than at the top margin. Only chapter breaks get it — that
      // semantic difference is why they aren't just page breaks. The drop is
      // the one shared measurement (CHAPTER_DROP_INCHES), same as the PDF
      // path's .chf-section-title / .chf-chapter-break rules and book mode.
      if (manuscript && block.kind === 'chapterBreak') {
        paragraphs.push(
          new Paragraph({ spacing: { before: convertInchesToTwip(CHAPTER_DROP_INCHES) }, children: [new TextRun('')] })
        )
      }
      prevWasOrdered = false
      continue
    }

    if (block.kind === 'chapterLine') {
      // A bottom border on an empty centered paragraph — Word has no
      // horizontal-rule primitive, and this is how one is conventionally drawn.
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 240, after: 240 },
          indent: { firstLine: 0 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '888888', space: 1 } },
          children: [new TextRun('')]
        })
      )
      prevWasOrdered = false
      continue
    }

    if (block.kind === 'image') {
      const image = block.imageId ? images[block.imageId] : undefined
      const size = image ? imageSize(image.data) : null
      const type = image ? DOCX_IMAGE_TYPES[image.mime] : undefined
      // A missing file, an unreadable header, or a format Word can't hold
      // (WebP) drops the image rather than failing the export or writing a
      // box Word will refuse to open.
      if (image && size && type) {
        const fitted = fitWithin(size, MAX_IMAGE_WIDTH_PX)
        paragraphs.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            indent: { firstLine: 0 },
            children: [
              new ImageRun({
                type,
                data: image.data,
                transformation: { width: fitted.width, height: fitted.height },
                altText: block.alt ? { name: block.alt, description: block.alt, title: block.alt } : undefined
              })
            ]
          })
        )
      }
      prevWasOrdered = false
      continue
    }

    if (block.kind === 'ordered' && !prevWasOrdered) orderedInstance += 1
    prevWasOrdered = block.kind === 'ordered'
    paragraphs.push(toParagraph(block, orderedInstance, footnotes, manuscript))
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

/**
 * Page geometry for every .docx section, from the shared millimetre table.
 *
 * The size was previously omitted altogether, so exports came out at Word's
 * own default page size no matter what Page Setup said — the one path that
 * genuinely did not read the shared geometry. It applies to both presets:
 * page size is the writer's setting, not a manuscript convention.
 */
export function sectionPageProperties(options: ExportOptions): Partial<ISectionOptions> {
  const marginTwips = Math.round((effectiveMarginMm(options) / MM_PER_INCH) * 1440)
  const { widthMm, heightMm } = PAGE_DIMENSIONS_MM[options.pageSize]
  return {
    properties: {
      page: {
        size: {
          width: Math.round((widthMm / MM_PER_INCH) * 1440),
          height: Math.round((heightMm / MM_PER_INCH) * 1440)
        },
        margin: { top: marginTwips, bottom: marginTwips, left: marginTwips, right: marginTwips }
      }
    }
  }
}

/** The manuscript preset adds its running header on top of the page geometry. */
export function manuscriptSectionProperties(options: ExportOptions): Partial<ISectionOptions> {
  return {
    ...sectionPageProperties(options),
    headers: { default: manuscriptHeader(options) },
    // Supplied empty so Word doesn't inherit a footer from elsewhere.
    footers: { default: new Footer({ children: [new Paragraph({ children: [] })] }) }
  }
}

export async function sectionsToDocxBuffer(
  sections: ISectionOptions[],
  options?: ExportOptions,
  footnotes?: FootnoteCollector
): Promise<Buffer> {
  const manuscript = options?.preset === 'manuscript'
  // Real Word footnotes: the body carries FootnoteReferenceRuns, and their
  // text goes into the package's own footnotes part, keyed by the same ids.
  // Word renders and numbers them at the foot of the correct page itself.
  const footnoteConfig = footnotes?.notes.length
    ? Object.fromEntries(
        footnotes.notes.map((note) => [note.id, { children: [new Paragraph({ children: [new TextRun(note.text)] })] }])
      )
    : undefined

  const doc = new Document({
    styles: manuscript ? manuscriptStyles() : undefined,
    // Asks Word to refresh fields on open — the Contents TOC field a project
    // export carries has no page numbers until Word lays the document out.
    features: { updateFields: true },
    footnotes: footnoteConfig,
    numbering: {
      config: [
        {
          reference: 'export-ordered-list',
          levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }]
        }
      ]
    },
    // Page geometry applies to every export; the manuscript preset layers its
    // running header on top of it.
    sections: options
      ? sections.map((s) => ({
          ...(manuscript ? manuscriptSectionProperties(options) : sectionPageProperties(options)),
          ...s
        }))
      : sections
  })
  return Packer.toBuffer(doc)
}

export async function blocksToDocxBuffer(
  blocks: Block[],
  render: DocxRenderOptions = {}
): Promise<Buffer> {
  const footnotes = render.footnotes ?? createFootnoteCollector()
  const children = blocksToDocxParagraphs(blocks, { ...render, footnotes })
  return sectionsToDocxBuffer([{ children }], undefined, footnotes)
}
