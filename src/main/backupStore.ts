import { app } from 'electron'
import { createHash } from 'crypto'
import { cp, mkdir, readdir, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import * as binderStore from './binderStore'
import * as storyBibleStore from './storyBibleStore'
import * as wordCountStore from './wordCountStore'
import { getProjectRoot } from './projectRoot'
import type { BackupInfo } from '../shared/backup'

// Backups live in Electron's per-app data directory, deliberately outside the
// portable project folder: they're an app-managed safety net, not part of
// what you'd copy to another machine, and restoring is meant to go through
// the app's own UI rather than someone manually digging through a backup
// folder sitting next to their real project. Each project root gets its own
// backup subfolder (keyed by a short hash of its path) so switching projects
// (via Open Project) never mixes one project's backup history with another's.
function backupsDir(): string {
  const key = createHash('sha1').update(getProjectRoot()).digest('hex').slice(0, 12)
  return join(app.getPath('userData'), 'backups', key)
}

const BACKUP_INTERVAL_MS = 15 * 60 * 1000
const KEEP_RECENT = 20
const KEEP_DAILY_DAYS = 14

let dirty = true

export function markDirty(): void {
  dirty = true
}

function timestampId(date: Date): string {
  return date.toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z')
}

function idToDate(id: string): string {
  // reverse the ':' -> '-' substitution done in timestampId, for display/parsing
  const isoish = id.replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})Z$/, '$1:$2:$3Z')
  return new Date(isoish).toISOString()
}

export async function listBackups(): Promise<BackupInfo[]> {
  if (!existsSync(backupsDir())) return []
  const entries = await readdir(backupsDir(), { withFileTypes: true })
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => ({ id: e.name, date: idToDate(e.name) }))
    .sort((a, b) => b.id.localeCompare(a.id))
}

function computeKeepSet(backups: BackupInfo[]): Set<string> {
  const keep = new Set<string>()

  for (const b of backups.slice(0, KEEP_RECENT)) keep.add(b.id)

  const seenDays = new Set<string>()
  for (const b of backups) {
    const day = b.id.slice(0, 10)
    if (!seenDays.has(day) && seenDays.size < KEEP_DAILY_DAYS) {
      keep.add(b.id)
      seenDays.add(day)
    }
  }

  return keep
}

/**
 * Deletes everything outside the retention policy. Re-checks after deleting
 * rather than trusting a single pass: Windows can resolve a recursive `rm()`
 * slightly before the removal is visible to a subsequent `readdir` on the
 * same directory, which would otherwise let a stale entry survive pruning.
 */
async function pruneOldBackups(): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const backups = await listBackups()
    const keep = computeKeepSet(backups)
    const toDelete = backups.filter((b) => !keep.has(b.id))
    if (toDelete.length === 0) return
    await Promise.all(toDelete.map((b) => rm(join(backupsDir(), b.id), { recursive: true, force: true })))
  }
}

async function createBackupNow(force: boolean): Promise<void> {
  if (!force && !dirty) return
  const projectDir = getProjectRoot()
  if (!existsSync(projectDir)) return

  const id = timestampId(new Date())
  const dest = join(backupsDir(), id)
  await mkdir(dest, { recursive: true })
  await cp(projectDir, dest, { recursive: true })
  dirty = false
  await pruneOldBackups()
}

// Backups (and their prune pass) are queued so two overlapping calls — e.g. the
// periodic timer firing again before a slow backup finishes — can never run
// concurrently and race each other's view of "what's currently on disk" during
// pruning, which could otherwise let more than KEEP_RECENT backups survive.
let backupChain: Promise<void> = Promise.resolve()

/** Copies the whole project folder into a fresh timestamped backup, then prunes old ones. */
export function createBackup(force = false): Promise<void> {
  const run = backupChain.then(
    () => createBackupNow(force),
    () => createBackupNow(force)
  )
  backupChain = run.catch(() => undefined)
  return run
}

const INITIAL_BACKUP_DELAY_MS = 60 * 1000

export function startPeriodicBackups(): void {
  // setInterval only fires after a full interval elapses, so a short session
  // (open, write, close well within 15 minutes) would otherwise never get a
  // backup at all. Also check shortly after startup, once there's been time
  // to actually write something worth backing up.
  setTimeout(() => void createBackup(), INITIAL_BACKUP_DELAY_MS)
  setInterval(() => {
    void createBackup()
  }, BACKUP_INTERVAL_MS)
}

/**
 * Restores the project from a backup. The current state is backed up first
 * (unconditionally) so restoring can never itself destroy unsaved history.
 */
export async function restoreBackup(id: string): Promise<void> {
  const source = join(backupsDir(), id)
  if (!existsSync(source)) throw new Error('Backup not found')

  await createBackup(true)

  const projectDir = getProjectRoot()
  // Wiped before the copy so an item that isn't in the snapshot being
  // restored (a doc, or a story-bible sheet/image) doesn't survive the
  // restore as an orphan.
  const dirsToClear = ['documents', join('storybible', 'sheets'), join('storybible', 'images')]
  for (const dir of dirsToClear) {
    const fullPath = join(projectDir, dir)
    if (existsSync(fullPath)) {
      await rm(fullPath, { recursive: true, force: true })
    }
  }
  await cp(source, projectDir, { recursive: true })

  binderStore.invalidateCache()
  storyBibleStore.invalidateCache()
  // Every document file was just replaced wholesale — no memoized count survives.
  wordCountStore.invalidateAll()
}
