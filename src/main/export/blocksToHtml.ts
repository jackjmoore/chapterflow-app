import { isSceneBreakText, SCENE_BREAK_MARK } from '../../shared/export'
import type { Block, Run } from './htmlToBlocks'

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** A paragraph whose entire visible text is a divider glyph run. */
export function isSceneBreakBlock(block: Block): boolean {
  return isSceneBreakText(block.runs.map((r) => r.text).join(''))
}

function runToHtml(run: Run): string {
  let inner = escapeHtml(run.text)
  if (run.bold) inner = `<strong>${inner}</strong>`
  if (run.italic) inner = `<em>${inner}</em>`
  if (run.underline) inner = `<u>${inner}</u>`
  const styles: string[] = []
  if (run.color) styles.push(`color: ${run.color}`)
  if (run.highlight) styles.push(`background-color: ${run.highlight}`)
  return styles.length ? `<span style="${styles.join('; ')}">${inner}</span>` : inner
}

function alignAttr(block: Block): string {
  return block.align ? ` style="text-align: ${block.align}"` : ''
}

export interface BlocksToHtmlOptions {
  /** Wrap list-item and blockquote content in <p>, matching how TipTap itself
   *  serializes those nodes. The PDF path doesn't need it (it prints the HTML
   *  directly); import does, so an imported document's saved file is the same
   *  shape a natively-created one would have, not just equivalent after the
   *  editor re-serializes it on first save. */
  paragraphWrappedNodes?: boolean
  /** Normalize whatever the writer typed as a scene divider (`***`, `---`) into
   *  the single centered `#` manuscript format expects. Off for every other
   *  preset, which leaves the divider exactly as written. */
  manuscriptSceneBreaks?: boolean
}

/** The inverse of htmlToBlocks — used to render the shared Block model back to
 *  HTML for the PDF export path (which prints through a real browser engine)
 *  and for file import. */
export function blocksToHtml(blocks: Block[], options: BlocksToHtmlOptions = {}): string {
  const wrap = options.paragraphWrappedNodes ?? false
  const parts: string[] = []
  let i = 0
  while (i < blocks.length) {
    const block = blocks[i]

    if (block.kind === 'bullet' || block.kind === 'ordered') {
      const tag = block.kind === 'bullet' ? 'ul' : 'ol'
      const items: string[] = []
      while (i < blocks.length && blocks[i].kind === block.kind) {
        const b = blocks[i]
        const content = b.runs.map(runToHtml).join('')
        items.push(wrap ? `<li><p>${content}</p></li>` : `<li${alignAttr(b)}>${content}</li>`)
        i += 1
      }
      parts.push(`<${tag}>${items.join('')}</${tag}>`)
      continue
    }

    if (options.manuscriptSceneBreaks && block.kind === 'paragraph' && isSceneBreakBlock(block)) {
      parts.push(`<p class="chf-scene-break">${SCENE_BREAK_MARK}</p>`)
      i += 1
      continue
    }

    const inner = block.runs.map(runToHtml).join('')
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
