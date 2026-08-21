/**
 * A word ChapterFlow knows about but the dictionary doesn't.
 *
 * Meaning and pronunciation are optional and never inferred — entries exist
 * only because the writer added them.
 */
export interface LexiconEntry {
  id: string
  word: string
  meaning: string
  pronunciation: string
  createdAt: string
  updatedAt: string
}

/**
 * Who asked for a word to stop being flagged.
 *
 * The suppression list is written by two features that never read each other:
 * the Lexicon, and Story Bible names/aliases. A word can be registered by
 * both at once — a character called "Wren" who also has a Lexicon entry — so
 * the store records the source alongside the word. Without that, deleting the
 * Lexicon entry would silently un-suppress the character's name.
 */
export type SuppressionSource = 'lexicon' | 'storyBible'

export interface SuppressedWord {
  /** Lower-cased for matching; the display form lives in whichever feature
   *  owns it. */
  word: string
  sources: SuppressionSource[]
}

/** Matching is case-insensitive: "Wren" and "wren" are the same word as far
 *  as the spellchecker is concerned. */
export function normalizeWord(word: string): string {
  return word.trim().toLowerCase()
}

/** Splits a name or alias into the individual words a spellchecker would
 *  flag. "Anna-Maria de Vries" contributes four checkable words, and the
 *  whole phrase is never what Chromium reports as misspelled. */
export function wordsIn(phrase: string): string[] {
  return phrase
    .split(/[^\p{L}\p{N}'’-]+/u)
    .map((part) => part.replace(/^[-'’]+|[-'’]+$/gu, ''))
    .filter((part) => part.length > 1)
}
