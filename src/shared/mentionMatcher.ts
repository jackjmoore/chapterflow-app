import { escapeRegExp } from './textMatch'

/** One name or alias that should be detected as referring to a Story Bible
 *  item — a flattened view of `item.name` + `item.aliases` across every item,
 *  built fresh by both the live editor decoration and the project-wide
 *  indexer whenever the item list changes. */
export interface MentionCandidate {
  itemId: string
  text: string
}

export interface PreparedMentionMatching {
  /** Null when there's nothing to match (no candidates). Global,
   *  case-insensitive, whole-word (same `\b(?:...)\b` convention Find/Replace's
   *  own "Whole Word" option already uses, for consistency). */
  regex: RegExp | null
  /** Lowercased candidate text -> itemId. Built from the exact same sorted
   *  list the regex is, so a match can never resolve to a different item
   *  than the one the regex alternation actually preferred. */
  lookup: Map<string, string>
}

/** Builds the regex and the match->item lookup from ONE canonically sorted
 *  candidate list (longest text first, so e.g. "Alina" wins over a shorter
 *  alias "Al" when both could match at the same position — regex alternation
 *  is first-alternative-wins, not longest-match-wins). Sorting once and
 *  deriving both structures from that same list is what guarantees they can
 *  never disagree on a collision (two items sharing an alias, etc). */
export function prepareMentionMatching(candidates: MentionCandidate[]): PreparedMentionMatching {
  const seen = new Set<string>()
  const sorted = candidates
    .map((c) => ({ itemId: c.itemId, text: c.text.trim() }))
    .filter((c) => {
      if (!c.text) return false
      const key = c.text.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => b.text.length - a.text.length)

  if (sorted.length === 0) return { regex: null, lookup: new Map() }

  const lookup = new Map(sorted.map((c) => [c.text.toLowerCase(), c.itemId]))
  const pattern = `\\b(?:${sorted.map((c) => escapeRegExp(c.text)).join('|')})\\b`
  const regex = new RegExp(pattern, 'gi')
  return { regex, lookup }
}

export interface MentionOffsetStats {
  count: number
  firstOffset: number
  lastOffset: number
}

/** Offset-based scan for plain text (used main-process-side against
 *  `node-html-parser`'s `.textContent` output). The live editor decoration
 *  uses `findMatchesInDoc` instead, for real ProseMirror document positions —
 *  this function and that one are fed the same `regex`/`lookup` pair from
 *  `prepareMentionMatching`, so they can never disagree on what matches. */
export function findMentionsInText(
  text: string,
  regex: RegExp,
  lookup: Map<string, string>
): Map<string, MentionOffsetStats> {
  const results = new Map<string, MentionOffsetStats>()
  regex.lastIndex = 0
  let execResult: RegExpExecArray | null
  while ((execResult = regex.exec(text))) {
    const matchText = execResult[0]
    if (matchText.length === 0) {
      regex.lastIndex++
      continue
    }
    const itemId = lookup.get(matchText.toLowerCase())
    if (!itemId) continue
    const existing = results.get(itemId)
    if (existing) {
      existing.count++
      existing.lastOffset = execResult.index
    } else {
      results.set(itemId, { count: 1, firstOffset: execResult.index, lastOffset: execResult.index })
    }
  }
  return results
}
