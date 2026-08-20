export interface SnapshotMeta {
  id: string
  timestamp: string
  name: string | null
  auto: boolean
}

const ENTITY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/&nbsp;/g, ' '],
  [/&amp;/g, '&'],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"]
]

/** Plain text extraction for snapshot diffing — preserves paragraph breaks
 * (unlike countWords, which only needs a total and collapses everything to
 * spaces), so a word-level diff still reads as prose. */
export function htmlToPlainText(html: string): string {
  let text = html
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
  for (const [pattern, replacement] of ENTITY_REPLACEMENTS) {
    text = text.replace(pattern, replacement)
  }
  return text.replace(/\n{3,}/g, '\n\n').trim()
}
