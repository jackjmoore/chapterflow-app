/** One tagged span of text inside a document. `id` is the mark's own
 *  identity (stable across edits elsewhere in the document, since it lives
 *  on the ProseMirror mark itself) — used to jump straight to this span from
 *  a project-wide browse list. `tagId` references a TagDef.id from the
 *  project's tag palette (binder.json) — the same palette document-level
 *  tagging already uses. */
export interface SpanTagRecord {
  id: string
  tagId: string
  documentId: string
  snippet: string
}
