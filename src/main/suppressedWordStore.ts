import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { atomicWrite } from './atomicWrite'
import { getProjectRoot } from './projectRoot'
import { normalizeWord, wordsIn, type SuppressedWord, type SuppressionSource } from '../shared/lexicon'

/**
 * The words ChapterFlow stops flagging as misspelled.
 *
 * Deliberately app-only. Nothing here calls
 * session.addWordToSpellCheckerDictionary, which on Windows 10+ and macOS
 * writes through to the *operating system's* custom dictionary and would
 * teach the word to Word, Notes and every other app on the machine. The
 * suppression is achieved instead by decorating those words in the editor
 * with spellcheck="false", which Chromium honours per element — verified
 * behaviour, see the SpellcheckSuppress extension. Close the app and the OS
 * knows nothing.
 *
 * Per-project, because the words are the project's: character names and
 * invented terminology belong to the manuscript, not to the machine.
 *
 * Two features write here and neither reads the other: the Lexicon, and
 * Story Bible names/aliases. Each word therefore records which sources asked
 * for it, and only stops being suppressed when the last of them withdraws.
 */

function indexPath(): string {
  return join(getProjectRoot(), 'suppressedWords.json')
}

interface SuppressedWordFile {
  version: 1
  words: SuppressedWord[]
}

async function load(): Promise<SuppressedWordFile> {
  const filePath = indexPath()
  if (!existsSync(filePath)) return { version: 1, words: [] }
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf-8')) as SuppressedWordFile
    if (!Array.isArray(parsed.words)) return { version: 1, words: [] }
    return parsed
  } catch {
    return { version: 1, words: [] }
  }
}

function persist(file: SuppressedWordFile): Promise<void> {
  return atomicWrite(indexPath(), JSON.stringify(file, null, 2))
}

// One small file for the whole project, so reads-then-writes must not
// interleave — same single-chain idiom spanTagStore and commentStore use.
let chain: Promise<void> = Promise.resolve()

function runQueued<T>(op: () => Promise<T>): Promise<T> {
  const run = chain.then(op, op)
  chain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

/**
 * Registers every checkable word in `phrase` for one source.
 *
 * Takes a phrase rather than a word because both callers have phrases: a
 * Lexicon entry may be two words, and a Story Bible name like "Anna-Maria de
 * Vries" is four. The spellchecker only ever reports individual words, so
 * that is the granularity suppression has to work at.
 */
export function addPhrase(phrase: string, source: SuppressionSource): Promise<void> {
  return runQueued(async () => {
    const file = await load()
    const byWord = new Map(file.words.map((w) => [w.word, w]))
    for (const raw of wordsIn(phrase)) {
      const word = normalizeWord(raw)
      if (!word) continue
      const existing = byWord.get(word)
      if (existing) {
        if (!existing.sources.includes(source)) existing.sources.push(source)
      } else {
        byWord.set(word, { word, sources: [source] })
      }
    }
    await persist({ version: 1, words: [...byWord.values()] })
  })
}

/**
 * Withdraws one source's claim on every word in `phrase`. The word stops
 * being suppressed only once no source still claims it, so deleting a
 * Lexicon entry cannot un-suppress a Story Bible character who shares the
 * name.
 */
export function removePhrase(phrase: string, source: SuppressionSource): Promise<void> {
  return runQueued(async () => {
    const file = await load()
    const targets = new Set(wordsIn(phrase).map(normalizeWord))
    const next: SuppressedWord[] = []
    for (const entry of file.words) {
      if (!targets.has(entry.word)) {
        next.push(entry)
        continue
      }
      const sources = entry.sources.filter((s) => s !== source)
      if (sources.length > 0) next.push({ ...entry, sources })
    }
    await persist({ version: 1, words: next })
  })
}

/**
 * Replaces everything one source claims, in a single write.
 *
 * The Story Bible uses this rather than adding and removing word by word:
 * a rename silently turns the old name into an alias, an alias edit can
 * change several at once, and reconciling those as deltas across five
 * mutation sites is how a stale claim survives forever. Rebuilding from
 * current state cannot drift.
 */
export function replaceSource(phrases: string[], source: SuppressionSource): Promise<void> {
  return runQueued(async () => {
    const file = await load()
    const byWord = new Map<string, SuppressedWord>()
    // Everything the *other* sources claim survives untouched.
    for (const entry of file.words) {
      const sources = entry.sources.filter((s) => s !== source)
      if (sources.length > 0) byWord.set(entry.word, { ...entry, sources })
    }
    for (const phrase of phrases) {
      for (const raw of wordsIn(phrase)) {
        const word = normalizeWord(raw)
        if (!word) continue
        const existing = byWord.get(word)
        if (existing) {
          if (!existing.sources.includes(source)) existing.sources.push(source)
        } else {
          byWord.set(word, { word, sources: [source] })
        }
      }
    }
    await persist({ version: 1, words: [...byWord.values()] })
  })
}

/** Drops every word a source registered — used when a whole feature's data
 *  is cleared, and to rebuild a source's claims from scratch. */
export function clearSource(source: SuppressionSource): Promise<void> {
  return runQueued(async () => {
    const file = await load()
    const next = file.words
      .map((entry) => ({ ...entry, sources: entry.sources.filter((s) => s !== source) }))
      .filter((entry) => entry.sources.length > 0)
    await persist({ version: 1, words: next })
  })
}

/** The flat list the renderer decorates with. Lower-cased. */
export async function listWords(): Promise<string[]> {
  return (await load()).words.map((w) => w.word)
}

export async function listEntries(): Promise<SuppressedWord[]> {
  return (await load()).words
}
