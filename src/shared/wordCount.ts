const ENTITY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/&nbsp;/g, ' '],
  [/&amp;/g, '&'],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"]
]

/** Word count from a document's saved HTML — one algorithm shared by the
 * live editor count and the project-wide totals, so they never disagree. */
export function countWords(html: string): number {
  let text = html.replace(/<[^>]*>/g, ' ')
  for (const [pattern, replacement] of ENTITY_REPLACEMENTS) {
    text = text.replace(pattern, replacement)
  }
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}
