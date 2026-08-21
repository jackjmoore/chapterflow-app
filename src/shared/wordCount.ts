const ENTITY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/&nbsp;/g, ' '],
  [/&amp;/g, '&'],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"]
]

/** Strips tags and decodes the handful of entities TipTap emits, leaving the
 *  document's visible text. Shared by both counters so they can never
 *  disagree about what counts as content. */
function visibleText(html: string): string {
  let text = html.replace(/<[^>]*>/g, ' ')
  for (const [pattern, replacement] of ENTITY_REPLACEMENTS) {
    text = text.replace(pattern, replacement)
  }
  return text
}

/** Word count from a document's saved HTML — one algorithm shared by the
 * live editor count and the project-wide totals, so they never disagree. */
export function countWords(html: string): number {
  return visibleText(html)
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

/**
 * Character count from a document's saved HTML, counting the visible text
 * including spaces between words — the figure a submission guideline or a
 * publisher's character limit means. Runs of whitespace introduced by tag
 * removal collapse to one, so markup can't inflate the total.
 */
export function countCharacters(html: string): number {
  return visibleText(html).replace(/\s+/g, ' ').trim().length
}
