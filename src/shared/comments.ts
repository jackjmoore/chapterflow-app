/**
 * One margin note anchored to a run of text.
 *
 * Unlike SpanTagRecord — which is a pure derived cache, rebuildable from a
 * document's HTML alone — the `body` here is authored content that exists
 * nowhere else. The anchor still lives in the document (a
 * `<span data-comment-id>` mark, so it rides ProseMirror's edit mapping);
 * only the text the writer typed lives in this record. That split is why
 * saving a document prunes comment records whose anchor has gone, but never
 * recreates a body it doesn't already have.
 */
export interface CommentRecord {
  id: string
  documentId: string
  body: string
  /** Epoch ms, for ordering the comment list oldest-first. */
  createdAt: number
  /** The commented text itself, kept for a browse list that doesn't want to
   *  open every document. Refreshed from the anchor on each save. */
  snippet: string
  resolved: boolean
}
