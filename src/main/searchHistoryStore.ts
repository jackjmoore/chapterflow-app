import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { atomicWrite } from './atomicWrite'
import { getProjectRoot } from './projectRoot'
import type { RecentSearch } from '../shared/search'

/**
 * The project's recent searches, most recent first.
 *
 * Per project rather than per install, because what you search for is part of
 * the manuscript you are searching — the names, the invented words, the
 * chapter you keep going back to. Carrying one project's history into another
 * would be noise.
 *
 * Note this deliberately lives in a file the search index does not classify as
 * a source. Recording a search writes to the project; if that write were
 * indexable, every search would re-index and the index would fill with
 * searches for itself.
 */

const MAX_ENTRIES = 50

function historyPath(): string {
  return join(getProjectRoot(), 'searchHistory.json')
}

interface HistoryFile {
  version: 1
  searches: RecentSearch[]
}

const EMPTY: HistoryFile = { version: 1, searches: [] }

async function load(): Promise<HistoryFile> {
  const filePath = historyPath()
  if (!existsSync(filePath)) return { ...EMPTY, searches: [] }
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf-8')) as HistoryFile
    if (!Array.isArray(parsed.searches)) return { ...EMPTY, searches: [] }
    return { version: 1, searches: parsed.searches.filter((s) => typeof s?.query === 'string' && s.query.trim()) }
  } catch {
    return { ...EMPTY, searches: [] }
  }
}

function persist(file: HistoryFile): Promise<void> {
  return atomicWrite(historyPath(), JSON.stringify(file, null, 2))
}

export async function list(): Promise<RecentSearch[]> {
  return (await load()).searches
}

/**
 * Records a query as the most recent search.
 *
 * Repeating a search moves it to the top rather than adding a duplicate, and
 * case is ignored when deciding whether two searches are the same — but the
 * text is stored as it was typed, since that is what the writer will recognise
 * in the list.
 */
export async function record(query: string): Promise<RecentSearch[]> {
  const trimmed = query.trim()
  if (!trimmed) return (await load()).searches

  const file = await load()
  const key = trimmed.toLowerCase()
  const searches = [
    { query: trimmed, at: Date.now() },
    ...file.searches.filter((s) => s.query.trim().toLowerCase() !== key)
  ].slice(0, MAX_ENTRIES)

  await persist({ version: 1, searches })
  return searches
}

export async function clear(): Promise<void> {
  await persist({ version: 1, searches: [] })
}
