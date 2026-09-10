import { flattenBinderOutline, type BinderNode } from '../../shared/binder'
import { applyImageSources, referencedImageIds } from './extensions/documentImage'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Stitches the whole manuscript into one HTML string, in binder order.
 *
 * The order is flattenBinderOutline — the same shared walk project export
 * consumes — so what the book shows and what exports can never disagree.
 * Content is each document's own stored HTML (the live editor's for the
 * active one, so the sentence typed a moment ago is in the read), with one
 * batched image hydration over the combined result.
 *
 * Boundaries are synthesized INTO the string rather than rendered around it:
 * each binder node contributes its name as an <h1–h3 class="chf-draft-heading">
 * at export's own depth rule (min(depth+1, 3)), folders as a heading alone.
 * They have to be real blocks, because pagination measures this string's
 * top-level blocks — which is exactly what makes a chapter title land on a
 * page the way it would in print, instead of floating outside the page flow.
 *
 * The caller flushes pending saves first; this only reads.
 */
export async function assembleDraftHtml(
  tree: BinderNode[],
  activeDocumentId: string | null,
  getActiveDocumentHtml: () => string
): Promise<string> {
  const outline = flattenBinderOutline(tree)

  const parts = await Promise.all(
    outline.map(async (entry) => {
      const heading = `<h${entry.level} class="chf-draft-heading">${escapeHtml(entry.title || 'Untitled')}</h${entry.level}>`
      if (!entry.isDocument || !entry.id) return heading
      const html =
        entry.id === activeDocumentId ? getActiveDocumentHtml() : await window.api.loadDocument(entry.id)
      return heading + html
    })
  )

  const combined = parts.join('')
  const imageIds = referencedImageIds(combined)
  if (imageIds.length === 0) return combined
  const sources = await window.api.getDocumentImages(imageIds)
  return applyImageSources(combined, sources)
}
