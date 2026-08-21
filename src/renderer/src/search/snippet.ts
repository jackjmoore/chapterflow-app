import { prepareMentionMatching } from '../../../shared/mentionMatcher'
import { tokenize } from '../../../shared/search'

/**
 * Snippets for search results, built from the text the index already holds.
 *
 * Nothing is re-read or re-parsed here: a ranked match carries the entry's
 * full text, so showing a chapter's matching sentence costs no more than
 * showing its title. Word boundaries come from the same helper the ranking
 * rules and Story Bible mention detection use, so the words highlighted in a
 * snippet are exactly the words that caused the result to appear.
 */

export interface SnippetPart {
  text: string
  /** True for the stretches that matched, which the interface marks. */
  hit: boolean
}

/** Widens a window to the nearest space, so a snippet never starts or ends
 *  mid-word. Falls back to the raw bound when there is no space to find. */
function toWordEdge(text: string, at: number, direction: -1 | 1): number {
  const limit = direction === -1 ? 0 : text.length
  for (let i = at; i !== limit; i += direction) {
    if (/\s/.test(text[i])) return direction === -1 ? i + 1 : i
  }
  return limit
}

/**
 * A short run of `text` around its first match of `query`, split into matched
 * and unmatched parts.
 *
 * Returns the opening of the text when the query does not occur as whole
 * words — which happens for a result matched on a partly-typed name, where
 * there is nothing in the body to point at.
 */
export function buildSnippet(text: string, query: string, radius = 70): SnippetPart[] {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (!flat) return []

  const terms = [...new Set(tokenize(query))]
  const { regex } = prepareMentionMatching(terms.map((t, i) => ({ itemId: String(i), text: t })))
  if (!regex) return [{ text: truncate(flat, radius * 3), hit: false }]

  regex.lastIndex = 0
  const first = regex.exec(flat)
  if (!first) return [{ text: truncate(flat, radius * 3), hit: false }]

  const start = toWordEdge(flat, Math.max(0, first.index - radius), -1)
  const end = toWordEdge(flat, Math.min(flat.length, first.index + first[0].length + radius * 2), 1)
  const window = flat.slice(start, end)

  const parts: SnippetPart[] = []
  if (start > 0) parts.push({ text: '…', hit: false })

  let cursor = 0
  regex.lastIndex = 0
  let hit: RegExpExecArray | null
  while ((hit = regex.exec(window)) !== null) {
    if (hit[0].length === 0) {
      regex.lastIndex += 1
      continue
    }
    if (hit.index > cursor) parts.push({ text: window.slice(cursor, hit.index), hit: false })
    parts.push({ text: hit[0], hit: true })
    cursor = hit.index + hit[0].length
  }
  if (cursor < window.length) parts.push({ text: window.slice(cursor), hit: false })
  if (end < flat.length) parts.push({ text: '…', hit: false })

  return parts
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, toWordEdge(text, max, -1)).trim()}…`
}
