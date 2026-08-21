/**
 * Static text insertions — date/time, word count, character count.
 *
 * Everything here produces a plain string that gets inserted as ordinary text
 * at the cursor. Deliberately NOT live fields: once inserted, the text is
 * indistinguishable from text the writer typed by hand, so it never updates
 * itself, never needs a node type or attributes, and exports correctly to
 * every format for free.
 */

/** Rounding tiers offered for word and character counts. `exact` is its own
 *  option rather than a rounding of 1, so the menu can label it plainly. */
export type CountRounding = 'exact' | 50 | 100 | 250 | 500 | 1000

export const COUNT_ROUNDINGS: CountRounding[] = ['exact', 50, 100, 250, 500, 1000]

export function roundingLabel(rounding: CountRounding): string {
  return rounding === 'exact' ? 'Exact' : `Nearest ${rounding.toLocaleString()}`
}

/**
 * Rounds to the nearest tier, but never down to a bare "0" — a real draft
 * with 12 words in it reporting "0 words" reads as a bug rather than as
 * rounding, so anything above zero floors at one tier instead.
 */
export function roundCount(count: number, rounding: CountRounding): number {
  if (rounding === 'exact') return count
  if (count === 0) return 0
  return Math.max(rounding, Math.round(count / rounding) * rounding)
}

/** "1,250 words" / "1 word" — the count already rounded by roundCount. */
export function formatWordCount(count: number, rounding: CountRounding): string {
  const value = roundCount(count, rounding)
  const noun = value === 1 ? 'word' : 'words'
  return `${value.toLocaleString()} ${noun}`
}

export function formatCharacterCount(count: number, rounding: CountRounding): string {
  const value = roundCount(count, rounding)
  const noun = value === 1 ? 'character' : 'characters'
  return `${value.toLocaleString()} ${noun}`
}

/**
 * The system's current date and time at the moment of insertion, in the
 * user's own locale. Captured once by the caller and frozen into the
 * document as text.
 */
export function formatDateTime(when: Date): string {
  return when.toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}
