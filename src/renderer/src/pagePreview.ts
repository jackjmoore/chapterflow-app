import { PAGE_DIMENSIONS_MM, type PageSize } from '../../shared/preferences'

const PX_PER_MM = 96 / 25.4

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

/**
 * Renders the document's actual HTML off-screen at the page's usable width
 * (page width minus margins) and measures the real resulting layout height
 * to compute a precise fractional page count — never a word-count estimate.
 * Uses the SAME html the editor/autosave already work with; nothing here is
 * a persisted copy, the measurement node is scratch space rebuilt each call.
 */
export function computePageCount(html: string, pageSize: PageSize, marginMm: number): number {
  const { content } = ensureMeasureNodes()
  const { widthMm, heightMm } = PAGE_DIMENSIONS_MM[pageSize]
  const usableWidthPx = (widthMm - marginMm * 2) * PX_PER_MM
  const usableHeightPx = (heightMm - marginMm * 2) * PX_PER_MM
  if (usableWidthPx <= 0 || usableHeightPx <= 0) return 0

  content.style.width = `${usableWidthPx}px`
  content.innerHTML = html && html.trim() ? html : '<p></p>'

  const contentHeight = content.scrollHeight
  return contentHeight <= 0 ? 0 : contentHeight / usableHeightPx
}
