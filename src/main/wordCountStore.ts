import { countWords } from '../shared/wordCount'
import { getAllDocumentIds, getWordCountBaseline, setWordCountBaseline } from './binderStore'
import { loadDocument } from './documentStore'

// Per-document word counts, memoized. Without this, every project-wide total
// (recomputed on each document switch, each Outliner/Corkboard open, and the
// daily baseline) re-read and re-counted every document in the project from
// disk — measured at ~220ms for a 138k-word/49-document project, and growing
// linearly with the manuscript. Counts only change when a document is saved,
// so the save path invalidates its own entry (see invalidate, called from the
// document:save IPC handler).
const cache = new Map<string, number>()

export function invalidate(documentId: string): void {
  cache.delete(documentId)
}

export function invalidateAll(): void {
  cache.clear()
}

async function countFor(id: string): Promise<number> {
  const cached = cache.get(id)
  if (cached !== undefined) return cached
  const count = countWords(await loadDocument(id))
  cache.set(id, count)
  return count
}

function todayString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function totalProjectWordCount(excludeId?: string): Promise<number> {
  const ids = await getAllDocumentIds()
  let total = 0
  for (const id of ids) {
    if (id === excludeId) continue
    total += await countFor(id)
  }
  return total
}

/**
 * Returns today's baseline project word count (words that existed at the
 * start of today), creating/rolling it over to a fresh snapshot whenever
 * the stored date isn't today.
 */
export async function getDailyBaseline(): Promise<number> {
  const today = todayString()
  const existing = await getWordCountBaseline()
  if (existing && existing.date === today) return existing.count

  const currentTotal = await totalProjectWordCount()
  await setWordCountBaseline({ date: today, count: currentTotal })
  return currentTotal
}

/** Sum of every document's word count except `excludeId` (the one the caller already has a live count for). */
export async function getOtherDocumentsWordCount(excludeId: string | null): Promise<number> {
  return totalProjectWordCount(excludeId ?? undefined)
}

/** Per-document word counts for the outliner. Served from the memo above, so
 *  reopening the outliner doesn't re-read the whole project — entries are
 *  dropped as their documents save, so a count can't outlive its content. */
export async function getWordCountsByDocument(): Promise<Record<string, number>> {
  const ids = await getAllDocumentIds()
  const entries = await Promise.all(ids.map(async (id) => [id, await countFor(id)] as const))
  return Object.fromEntries(entries)
}
