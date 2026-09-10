import { randomUUID } from 'crypto'
import { readFile, unlink, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { atomicWrite } from './atomicWrite'
import { loadDocument } from './documentStore'
import { getProjectRoot } from './projectRoot'
import type { SnapshotMeta } from '../shared/snapshot'

// Snapshots live inside the project folder, keyed by document id — a
// deliberate authoring artifact (like a writer manually saving a version),
// not a disaster-recovery mechanism, so they travel with the project the
// way documents/ already does. This is a separate concern from backupStore's
// rolling whole-project backups: own storage location, own module, own
// queueing state below — only the promise-chain idiom is shared, not any
// code or data.
function snapshotsDir(documentId: string): string {
  return join(getProjectRoot(), 'snapshots', documentId)
}

function indexPath(documentId: string): string {
  return join(snapshotsDir(documentId), 'index.json')
}

function contentPath(documentId: string, snapshotId: string): string {
  return join(snapshotsDir(documentId), `${snapshotId}.html`)
}

async function loadIndex(documentId: string): Promise<SnapshotMeta[]> {
  const filePath = indexPath(documentId)
  if (!existsSync(filePath)) return []
  try {
    return JSON.parse(await readFile(filePath, 'utf-8')) as SnapshotMeta[]
  } catch {
    return []
  }
}

function persistIndex(documentId: string, entries: SnapshotMeta[]): Promise<void> {
  return atomicWrite(indexPath(documentId), JSON.stringify(entries, null, 2))
}

// Per-document operation queue so a read-modify-write on index.json (e.g. two
// snapshots taken in quick succession, or restore's auto-snapshot-then-return
// sequence) can never interleave with another snapshot op on the same
// document. atomicWrite alone only serializes the final file write, not this
// read-modify-write cycle.
const opQueues = new Map<string, Promise<unknown>>()

function runQueued<T>(documentId: string, op: () => Promise<T>): Promise<T> {
  const previous = (opQueues.get(documentId) as Promise<T> | undefined) ?? Promise.resolve()
  const run = previous.then(op, op)
  opQueues.set(
    documentId,
    run.catch(() => undefined)
  )
  return run
}

async function createSnapshotNow(documentId: string, name: string | null, auto: boolean): Promise<SnapshotMeta> {
  const html = await loadDocument(documentId)
  const meta: SnapshotMeta = { id: randomUUID(), timestamp: new Date().toISOString(), name, auto }
  await atomicWrite(contentPath(documentId, meta.id), html)
  const index = await loadIndex(documentId)
  index.push(meta)
  await persistIndex(documentId, index)
  return meta
}

export function createSnapshot(documentId: string, name: string | null, auto = false): Promise<SnapshotMeta> {
  return runQueued(documentId, () => createSnapshotNow(documentId, name, auto))
}

export async function listSnapshots(documentId: string): Promise<SnapshotMeta[]> {
  const index = await loadIndex(documentId)
  return index.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

export async function getSnapshotContent(documentId: string, snapshotId: string): Promise<string> {
  try {
    return await readFile(contentPath(documentId, snapshotId), 'utf-8')
  } catch {
    // Unlike documentStore.loadDocument's tolerant '' fallback, a missing
    // snapshot must throw — silently returning '' here could make a restore
    // silently blank a document.
    throw new Error('Snapshot not found')
  }
}

export function deleteSnapshot(documentId: string, snapshotId: string): Promise<void> {
  return runQueued(documentId, async () => {
    try {
      await unlink(contentPath(documentId, snapshotId))
    } catch {
      // already gone — fine
    }
    const index = await loadIndex(documentId)
    await persistIndex(
      documentId,
      index.filter((entry) => entry.id !== snapshotId)
    )
  })
}

/** Called when the document itself is deleted, to avoid leaving an orphaned
 * snapshots/<id>/ directory behind forever. */
export async function deleteAllForDocument(documentId: string): Promise<void> {
  await rm(snapshotsDir(documentId), { recursive: true, force: true })
}

/**
 * Returns the target snapshot's HTML for the caller to apply — this never
 * writes to documents/<id>.html itself, so restoring stays on the same
 * single-writer save path (document:save) that autosave already uses,
 * instead of a special-case direct write here. The current on-disk content
 * is captured as a "Before restore" snapshot first, so restoring is always
 * reversible.
 */
export function restoreSnapshot(documentId: string, snapshotId: string): Promise<string> {
  return runQueued(documentId, async () => {
    const content = await getSnapshotContent(documentId, snapshotId)
    await createSnapshotNow(documentId, 'Before restore', true)
    return content
  })
}

/**
 * Writes a snapshot whose content and timestamp come from the caller.
 *
 * createSnapshot cannot do this, and deliberately so: it reads the current
 * documents/<id>.html and stamps the moment it runs, which is exactly right
 * for taking a snapshot and exactly wrong for recording one that happened
 * elsewhere. Importing Scrivener's version history needs the original dates —
 * a history claiming every revision happened at the moment of import
 * misrepresents itself, and a diff between two such snapshots would show both
 * as today.
 *
 * Refuses an unparseable timestamp rather than quietly substituting now, for
 * the same reason.
 */
export function importSnapshot(
  documentId: string,
  html: string,
  timestamp: string,
  name: string | null
): Promise<SnapshotMeta> {
  return runQueued(documentId, async () => {
    const parsed = new Date(timestamp)
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Refusing to import a snapshot with an unreadable timestamp: "${timestamp}"`)
    }
    const meta: SnapshotMeta = {
      id: randomUUID(),
      timestamp: parsed.toISOString(),
      name,
      // Imported history is authored, not automatic: it exists because the
      // writer took it, in another app.
      auto: false
    }
    await atomicWrite(contentPath(documentId, meta.id), html)
    const index = await loadIndex(documentId)
    index.push(meta)
    await persistIndex(documentId, index)
    return meta
  })
}
