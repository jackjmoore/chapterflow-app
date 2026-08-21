import { randomUUID } from 'crypto'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { atomicWrite } from './atomicWrite'
import { getProjectRoot } from './projectRoot'
import { normalizeWord, type LexiconEntry } from '../shared/lexicon'
import * as suppressedWordStore from './suppressedWordStore'

/**
 * The project's Lexicon: invented words, character names, terminology — with
 * an optional meaning and pronunciation the writer chose to record.
 *
 * Every entry also suppresses its word in the editor, but the Lexicon does
 * not own that mechanism and never reads the Story Bible's claims on it: both
 * features call suppressedWordStore, which reconciles them.
 */

function lexiconPath(): string {
  return join(getProjectRoot(), 'lexicon.json')
}

interface LexiconFile {
  version: 1
  entries: LexiconEntry[]
}

async function load(): Promise<LexiconFile> {
  const filePath = lexiconPath()
  if (!existsSync(filePath)) return { version: 1, entries: [] }
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf-8')) as LexiconFile
    if (!Array.isArray(parsed.entries)) return { version: 1, entries: [] }
    return parsed
  } catch {
    return { version: 1, entries: [] }
  }
}

function persist(file: LexiconFile): Promise<void> {
  return atomicWrite(lexiconPath(), JSON.stringify(file, null, 2))
}

let chain: Promise<void> = Promise.resolve()

function runQueued<T>(op: () => Promise<T>): Promise<T> {
  const run = chain.then(op, op)
  chain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

export async function listEntries(): Promise<LexiconEntry[]> {
  const { entries } = await load()
  return [...entries].sort((a, b) => a.word.localeCompare(b.word, undefined, { sensitivity: 'base' }))
}

/** Adds a word, or returns the existing entry if it is already there —
 *  "Define in Lexicon" on a word that already has an entry should open that
 *  entry, never create a duplicate. */
export async function addEntry(
  word: string,
  meaning = '',
  pronunciation = ''
): Promise<LexiconEntry | null> {
  const trimmed = word.trim()
  if (!trimmed) return null

  const created = await runQueued(async () => {
    const file = await load()
    const existing = file.entries.find((e) => normalizeWord(e.word) === normalizeWord(trimmed))
    if (existing) return existing
    const now = new Date().toISOString()
    const entry: LexiconEntry = {
      id: randomUUID(),
      word: trimmed,
      meaning,
      pronunciation,
      createdAt: now,
      updatedAt: now
    }
    await persist({ version: 1, entries: [...file.entries, entry] })
    return entry
  })

  // Outside the queue: a different store with its own lock, and holding both
  // at once is how deadlocks start.
  await suppressedWordStore.addPhrase(created.word, 'lexicon')
  return created
}

export async function updateEntry(
  id: string,
  changes: Partial<Pick<LexiconEntry, 'word' | 'meaning' | 'pronunciation'>>
): Promise<void> {
  const renamed = await runQueued(async () => {
    const file = await load()
    const existing = file.entries.find((e) => e.id === id)
    if (!existing) return null
    const next = { ...existing, ...changes, updatedAt: new Date().toISOString() }
    await persist({ version: 1, entries: file.entries.map((e) => (e.id === id ? next : e)) })
    return changes.word !== undefined && changes.word !== existing.word
      ? { from: existing.word, to: next.word }
      : null
  })

  // A renamed entry must stop suppressing its old word, or a typo would stay
  // invisible forever after being corrected.
  if (renamed) {
    await suppressedWordStore.removePhrase(renamed.from, 'lexicon')
    await suppressedWordStore.addPhrase(renamed.to, 'lexicon')
  }
}

/** Deleting an entry withdraws the Lexicon's claim on its word — the word is
 *  flaggable again unless the Story Bible also claims it. */
export async function deleteEntry(id: string): Promise<void> {
  const removed = await runQueued(async () => {
    const file = await load()
    const existing = file.entries.find((e) => e.id === id)
    if (!existing) return null
    await persist({ version: 1, entries: file.entries.filter((e) => e.id !== id) })
    return existing
  })
  if (removed) await suppressedWordStore.removePhrase(removed.word, 'lexicon')
}
