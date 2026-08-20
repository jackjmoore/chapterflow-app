/**
 * Turning written prose into something an OS voice reads acceptably.
 *
 * The voice itself is a fixed constraint — SAPI on Windows, whatever is
 * installed. The only real lever is what we hand it, so this module is where
 * the quality work lives: punctuation the engine actually responds to, no
 * formatting artifacts spoken aloud, and chunk boundaries that fall where a
 * pause belongs anyway.
 */

/** Characters that carry no meaning aloud and confuse some engines. */
const INVISIBLES = /[​-‍⁠﻿­]/g

/** Abbreviations whose trailing period must not end a sentence. */
const ABBREVIATIONS = [
  'mr', 'mrs', 'ms', 'dr', 'prof', 'rev', 'hon', 'st', 'sr', 'jr',
  'vs', 'etc', 'e.g', 'i.e', 'no', 'vol', 'fig', 'approx', 'dept', 'est'
]

/**
 * Normalizes one block's text for speech.
 *
 * Deliberate choices, each because the engine mishandles the raw form:
 * - em/en dashes are read as nothing by SAPI, running the clause into the
 *   next; a comma produces the break the dash was doing visually.
 * - a trailing dash (an interrupted line of dialogue) becomes a full stop
 *   instead, so the voice actually stops rather than trailing into the next
 *   paragraph.
 * - a block with no terminal punctuation gets a period, which is what makes
 *   the engine apply falling intonation instead of leaving the line hanging.
 */
export function normalizeForSpeech(raw: string): string {
  let text = raw.replace(INVISIBLES, '').replace(/\s+/g, ' ').trim()
  if (!text) return ''

  text = text.replace(/…/g, '... ')

  // Interrupted dialogue: "I didn't—" / "But I—" — stop cleanly.
  text = text.replace(/\s*[—–-]+\s*(["'”’]?)$/, '.$1')

  // Parenthetical or interrupting dash between words becomes a comma pause.
  text = text.replace(/\s*[—–]\s*/g, ', ')

  // Collapse any punctuation pile-ups the substitutions created.
  text = text.replace(/,\s*([,.;:!?])/g, '$1')
  text = text.replace(/\s+([,.;:!?])/g, '$1')
  text = text.replace(/\s{2,}/g, ' ').trim()

  if (!text) return ''
  if (!/[.!?…]["'”’)\]]?$/.test(text)) text += '.'
  return text
}

export interface Sentence {
  text: string
  /** Offsets within the normalized block text. */
  start: number
  end: number
}

/**
 * Splits normalized text into sentences, keeping offsets so playback position
 * can be mapped back into the document for highlighting.
 */
export function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = []
  if (!text.trim()) return out

  let start = 0
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char !== '.' && char !== '!' && char !== '?') continue

    // Swallow trailing quotes/brackets and any run of terminators ("?!").
    let end = i + 1
    while (end < text.length && /[.!?]/.test(text[end])) end++
    while (end < text.length && /["'”’)\]]/.test(text[end])) end++

    // A period after a known abbreviation, an initial ("J. R."), or a decimal
    // is not a sentence end.
    const before = text.slice(start, i).trim()
    const lastWord = before.split(/\s/).pop()?.toLowerCase().replace(/^[("'“‘]+/, '') ?? ''
    const isAbbrev = char === '.' && ABBREVIATIONS.includes(lastWord)
    const isInitial = char === '.' && /^[a-z]$/i.test(lastWord)
    const isDecimal = char === '.' && /\d$/.test(text.slice(0, i)) && /^\d/.test(text.slice(end))
    if (isAbbrev || isInitial || isDecimal) continue

    // Must be followed by whitespace-then-something, or be the end.
    if (end < text.length && !/\s/.test(text[end])) continue

    // Dialogue tags: `"Where were you?" she asked.` is ONE sentence. The
    // question mark closes the quoted speech, not the sentence containing it,
    // and a lowercase word after the closing quote is the giveaway. Splitting
    // here would make the voice drop into a full stop mid-line, which is the
    // single most noticeable way TTS mangles fiction.
    const rest = text.slice(end)
    const nextWordChar = rest.match(/^\s*(\S)/)?.[1]
    if (nextWordChar && /\p{Ll}/u.test(nextWordChar)) continue

    const slice = text.slice(start, end).trim()
    if (slice) out.push({ text: slice, start, end })
    while (end < text.length && /\s/.test(text[end])) end++
    start = end
    i = end - 1
  }

  const tail = text.slice(start).trim()
  if (tail) out.push({ text: tail, start, end: text.length })
  return out
}

/**
 * Groups sentences into utterance-sized chunks.
 *
 * Two forces pull against each other: longer chunks give the engine room for
 * natural prosody across a whole paragraph, but Chromium truncates long
 * utterances and boundary events grow unreliable. Grouping *whole sentences*
 * up to a budget means every seam lands at a full stop, where a pause is
 * expected — so the compromise is inaudible rather than choppy.
 */
export const CHUNK_BUDGET_CHARS = 220

export function groupSentences(sentences: Sentence[], budget = CHUNK_BUDGET_CHARS): Sentence[][] {
  const chunks: Sentence[][] = []
  let current: Sentence[] = []
  let length = 0

  for (const sentence of sentences) {
    // A single over-long sentence still goes out whole — splitting mid-clause
    // would be far worse than a long utterance.
    if (current.length > 0 && length + sentence.text.length > budget) {
      chunks.push(current)
      current = []
      length = 0
    }
    current.push(sentence)
    length += sentence.text.length + 1
  }
  if (current.length) chunks.push(current)
  return chunks
}
