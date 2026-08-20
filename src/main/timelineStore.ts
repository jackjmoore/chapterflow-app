import { randomUUID } from 'crypto'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { atomicWrite } from './atomicWrite'
import { getProjectRoot } from './projectRoot'
import type { TimelineDraft, TimelineEntry, TimelineState } from '../shared/timeline'

/**
 * Continuity board storage — its own project-root file, deliberately separate
 * from both binder.json and the Story Bible: a timeline entry is neither a
 * manuscript document nor a story element, it's a statement *about* them.
 *
 * What it stores about those things is ids and nothing else. There is no
 * second copy of a character here to drift out of sync with the real one.
 *
 * Holds no in-memory cache (every op reads the file fresh, submissionStore-
 * style) — that's what keeps it correct across Open Project and backup
 * restore without needing an invalidateCache() hook anywhere, and living in
 * the project folder means it travels with the project and lands in backups
 * automatically.
 */

interface TimelineFile {
  version: 1
  entries: TimelineEntry[]
}

function indexPath(): string {
  return join(getProjectRoot(), 'timeline.json')
}

function emptyFile(): TimelineFile {
  return { version: 1, entries: [] }
}

async function loadIndex(): Promise<TimelineFile> {
  const filePath = indexPath()
  if (!existsSync(filePath)) return emptyFile()
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf-8')) as TimelineFile
    if (!Array.isArray(parsed.entries)) return emptyFile()
    // A hand-edited or partially-written file shouldn't be able to crash the
    // renderer on a `.map` — normalize the reference arrays on the way in.
    for (const entry of parsed.entries) {
      if (!Array.isArray(entry.itemIds)) entry.itemIds = []
    }
    return { version: 1, entries: parsed.entries }
  } catch {
    return emptyFile()
  }
}

function persistIndex(file: TimelineFile): Promise<void> {
  return atomicWrite(indexPath(), JSON.stringify(file, null, 2))
}

// One shared queue for the whole file — same idiom as submissionStore/
// spanTagStore, so a read-modify-write can never interleave with another
// (a drag-reorder landing mid-save would otherwise be able to lose an edit).
let indexChain: Promise<void> = Promise.resolve()

function runQueued<T>(op: () => Promise<T>): Promise<T> {
  const run = indexChain.then(op, op)
  indexChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

/** Array order is timeline order — returned exactly as stored. */
export async function getState(): Promise<TimelineState> {
  const file = await loadIndex()
  return { entries: file.entries }
}

export function createEntry(draft: TimelineDraft): Promise<TimelineEntry> {
  return runQueued(async () => {
    const file = await loadIndex()
    const now = new Date().toISOString()
    const entry: TimelineEntry = { ...draft, id: randomUUID(), createdAt: now, updatedAt: now }
    // Appends: a new event goes at the end of the chronology until you move
    // it, which is the only ordering guess that can't be wrong.
    file.entries.push(entry)
    await persistIndex(file)
    return entry
  })
}

export function updateEntry(id: string, patch: Partial<TimelineDraft>): Promise<void> {
  return runQueued(async () => {
    const file = await loadIndex()
    const existing = file.entries.find((e) => e.id === id)
    if (!existing) return
    Object.assign(existing, patch, { updatedAt: new Date().toISOString() })
    await persistIndex(file)
  })
}

export function deleteEntry(id: string): Promise<void> {
  return runQueued(async () => {
    const file = await loadIndex()
    file.entries = file.entries.filter((e) => e.id !== id)
    await persistIndex(file)
  })
}

/** Moves an entry to `targetIndex` in the (post-removal) list — the same
 *  splice-out-then-splice-in convention as binderStore.moveNode, so a drag
 *  onto a position lands where the drop indicator was drawn. */
export function moveEntry(id: string, targetIndex: number): Promise<void> {
  return runQueued(async () => {
    const file = await loadIndex()
    const from = file.entries.findIndex((e) => e.id === id)
    if (from === -1) return
    const [entry] = file.entries.splice(from, 1)
    const clamped = Math.max(0, Math.min(targetIndex, file.entries.length))
    file.entries.splice(clamped, 0, entry)
    await persistIndex(file)
  })
}

/**
 * Drops every reference that no longer resolves, across all entries. This is
 * the *opt-in* half of the dangling-reference policy: nothing is ever scrubbed
 * when a Story Bible item or document is deleted — the board keeps showing the
 * link as visibly broken (and a restored backup relinks it) until you ask for
 * a cleanup here. The entries themselves always survive; only the dead links
 * inside them go.
 *
 * The valid-id sets are passed in rather than read from the other stores, so
 * this file keeps knowing nothing about them.
 */
export function pruneReferences(validItemIds: string[], validDocumentIds: string[]): Promise<number> {
  return runQueued(async () => {
    const file = await loadIndex()
    const items = new Set(validItemIds)
    const documents = new Set(validDocumentIds)
    const now = new Date().toISOString()
    let removed = 0

    for (const entry of file.entries) {
      const keptItems = entry.itemIds.filter((itemId) => items.has(itemId))
      const documentBroken = !!entry.documentId && !documents.has(entry.documentId)
      const removedHere = entry.itemIds.length - keptItems.length + (documentBroken ? 1 : 0)
      if (removedHere === 0) continue
      entry.itemIds = keptItems
      if (documentBroken) entry.documentId = null
      entry.updatedAt = now
      removed += removedHere
    }

    if (removed > 0) await persistIndex(file)
    return removed
  })
}
