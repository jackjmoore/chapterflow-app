import { isSceneBreakText } from '../../shared/export'
import type { Block, Run } from './htmlToBlocks'

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** A paragraph whose entire visible text is a divider glyph run. */
export function isSceneBreakBlock(block: Block): boolean {
  return isSceneBreakText(block.runs.map((r) => r.text).join(''))
}

function runToHtml(run: Run, footnoteNumber: number | null): string {
  // A footnote marker renders as its number and nothing else — the note text
  // is emitted separately (as an endnote for PDF, see footnotesToHtml).
  if (run.footnote !== undefined) {
    const n = footnoteNumber ?? 0
    return `<sup class="chf-footnote-ref" id="chf-fnref-${n}"><a href="#chf-fn-${n}">${n}</a></sup>`
  }
  let inner = escapeHtml(run.text)
  if (run.bold) inner = `<strong>${inner}</strong>`
  if (run.italic) inner = `<em>${inner}</em>`
  if (run.underline) inner = `<u>${inner}</u>`
  const styles: string[] = []
  if (run.color) styles.push(`color: ${run.color}`)
  if (run.highlight) styles.push(`background-color: ${run.highlight}`)
  return styles.length ? `<span style="${styles.join('; ')}">${inner}</span>` : inner
}

export interface BlocksToHtmlOptions {
  /** Wrap list-item and blockquote content in <p>, matching how TipTap itself
   *  serializes those nodes. The PDF path doesn't need it (it prints the HTML
   *  directly); import does, so an imported document's saved file is the same
   *  shape a natively-created one would have, not just equivalent after the
   *  editor re-serializes it on first save. */
  paragraphWrappedNodes?: boolean
  /** Normalize whatever the writer typed as a scene divider (`***`, `---`) to
   *  this one centered marker — `#` for manuscript format, the project's
   *  scene-break setting for standard. Absent leaves dividers exactly as
   *  written (the import path, which must not rewrite content). */
  sceneBreakMark?: string
  /** Drop writer-applied justification, rendering those paragraphs with the
   *  default left alignment — standard manuscript format is never justified. */
  stripJustify?: boolean
  /** Image id → data URI, for the PDF path. The import path passes nothing,
   *  and images without an entry here are dropped rather than rendered as a
   *  broken-image box. */
  imageSources?: Record<string, string>
}

/** The inverse of htmlToBlocks — used to render the shared Block model back to
 *  HTML for the PDF export path (which prints through a real browser engine)
 *  and for file import.
 *
 *  `imageSources` maps an image id to a data URI. Omitted for the import path
 *  (which has no images to resolve) and supplied for PDF, where the printing
 *  browser needs something it can actually fetch — `data:` rather than a file
 *  path, matching how the editor itself displays them. */
export function blocksToHtml(blocks: Block[], options: BlocksToHtmlOptions = {}): string {
  const wrap = options.paragraphWrappedNodes ?? false
  const imageSources = options.imageSources ?? {}
  const parts: string[] = []
  const alignAttr = (block: Block): string => {
    const align = options.stripJustify && block.align === 'justify' ? undefined : block.align
    return align ? ` style="text-align: ${align}"` : ''
  }
  // Footnote numbering is global to the document and must survive the list
  // grouping below, so it's tracked across the whole walk rather than per
  // block. Same order numberFootnotes() produces, by construction.
  let footnoteCounter = 0
  const renderRuns = (runs: Block['runs']): string =>
    runs
      .map((run) => {
        if (run.footnote !== undefined) {
          footnoteCounter += 1
          return runToHtml(run, footnoteCounter)
        }
        return runToHtml(run, null)
      })
      .join('')

  let i = 0
  while (i < blocks.length) {
    const block = blocks[i]

    if (block.kind === 'bullet' || block.kind === 'ordered') {
      const tag = block.kind === 'bullet' ? 'ul' : 'ol'
      const items: string[] = []
      while (i < blocks.length && blocks[i].kind === block.kind) {
        const b = blocks[i]
        const content = renderRuns(b.runs)
        items.push(wrap ? `<li><p>${content}</p></li>` : `<li${alignAttr(b)}>${content}</li>`)
        i += 1
      }
      parts.push(`<${tag}>${items.join('')}</${tag}>`)
      continue
    }

    if (block.kind === 'pageBreak' || block.kind === 'chapterBreak') {
      // Both break the page. In manuscript format, whatever follows a chapter
      // break also opens the standard 2in down its page — the PDF path styles
      // `.chf-chapter-break + *` (toPdf.ts) and the docx path inserts a
      // spacer paragraph (toDocx.ts); both use the same 2in measurement.
      const cls = block.kind === 'chapterBreak' ? 'chf-chapter-break' : 'chf-page-break'
      parts.push(`<div class="${cls}"></div>`)
      i += 1
      continue
    }

    if (block.kind === 'chapterLine') {
      parts.push('<div class="chf-chapter-line"></div>')
      i += 1
      continue
    }

    if (block.kind === 'image') {
      const src = block.imageId ? imageSources[block.imageId] : undefined
      // No resolvable source (a missing file) drops the image rather than
      // emitting a broken-image box into someone's finished PDF.
      if (src) {
        const alt = escapeHtml(block.alt ?? '')
        parts.push(`<figure class="chf-figure"><img src="${src}" alt="${alt}" /></figure>`)
      }
      i += 1
      continue
    }

    if (options.sceneBreakMark && block.kind === 'paragraph' && isSceneBreakBlock(block)) {
      parts.push(`<p class="chf-scene-break">${escapeHtml(options.sceneBreakMark)}</p>`)
      i += 1
      continue
    }

    const inner = renderRuns(block.runs)
    if (block.kind === 'heading') parts.push(`<h${block.level}${alignAttr(block)}>${inner}</h${block.level}>`)
    else if (block.kind === 'blockquote') {
      parts.push(
        wrap
          ? `<blockquote><p${alignAttr(block)}>${inner}</p></blockquote>`
          : `<blockquote${alignAttr(block)}>${inner}</blockquote>`
      )
    } else parts.push(`<p${alignAttr(block)}>${inner}</p>`)
    i += 1
  }
  return parts.join('')
}

/**
 * The endnote section appended to the PDF path.
 *
 * These are endnotes, not footnotes, and that's a hard engine limit rather
 * than a shortcut: the PDF is produced by Electron's printToPDF, i.e.
 * Chromium, which does not implement the CSS Paged Media footnote spec
 * (`float: footnote`). No CSS can place a note at the foot of the physical
 * page through that renderer. The docx path does emit real Word footnotes
 * (see toDocx.ts), and both share the same numbering.
 */
export function footnotesToHtml(notes: { number: number; text: string }[]): string {
  if (notes.length === 0) return ''
  const items = notes
    .map(
      (note) =>
        `<li id="chf-fn-${note.number}"><a class="chf-fn-back" href="#chf-fnref-${note.number}">${note.number}.</a> ${escapeHtml(note.text)}</li>`
    )
    .join('')
  return `<section class="chf-endnotes"><h2>Notes</h2><ol>${items}</ol></section>`
}
