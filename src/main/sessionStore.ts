import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { atomicWrite } from './atomicWrite'
import { getProjectRoot } from './projectRoot'
import { sealSession, type OpenSession, type SessionState, type WritingSession } from '../shared/sessions'

/**
 * Writing-session storage — its own project-root file, separate from
 * everything else. Sessions are per-project because the words they count are
 * this project's words.
 *
 * Holds no in-memory cache (every op reads fresh, timelineStore-style), which
 * keeps it correct across Open Project and backup restore with no
 * invalidateCache() hook, and it travels with the project into backups.
 */

interface SessionFile {
  version: 1
  sessions: WritingSession[]
  /** The session currently in progress, checkpointed while it runs. */
  openSession: OpenSession | null
}

function indexPath(): string {
  return join(getProjectRoot(), 'sessions.json')
}

function emptyFile(): SessionFile {
  return { version: 1, sessions: [], openSession: null }
}

async function loadIndex(): Promise<SessionFile> {
  const filePath = indexPath()
  if (!existsSync(filePath)) return emptyFile()
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf-8')) as SessionFile
    if (!Array.isArray(parsed.sessions)) return emptyFile()
    return { version: 1, sessions: parsed.sessions, openSession: parsed.openSession ?? null }
  } catch {
    return emptyFile()
  }
}

function persistIndex(file: SessionFile): Promise<void> {
  return atomicWrite(indexPath(), JSON.stringify(file, null, 2))
}

let indexChain: Promise<void> = Promise.resolve()

function runQueued<T>(op: () => Promise<T>): Promise<T> {
  const run = indexChain.then(op, op)
  indexChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

export async function getState(): Promise<SessionState> {
  const file = await loadIndex()
  return { sessions: file.sessions, openSession: file.openSession }
}

/**
 * Writes the in-progress session. Called on a slow checkpoint tick while
 * writing, so a crash costs at most one interval rather than the session.
 */
export function checkpointOpenSession(open: OpenSession): Promise<void> {
  return runQueued(async () => {
    const file = await loadIndex()
    file.openSession = open
    await persistIndex(file)
  })
}

/** Seals the in-progress session into the permanent list. A session with no
 *  measurable duration is dropped rather than recorded as a zero-length
 *  artifact of a single keystroke. */
export function closeSession(open: OpenSession): Promise<WritingSession | null> {
  return runQueued(async () => {
    const file = await loadIndex()
    const sealed = sealSession(open)
    file.openSession = null
    if (sealed.durationMs <= 0) {
      await persistIndex(file)
      return null
    }
    // Re-opening the same id (checkpoint then close) must update, not duplicate.
    const existing = file.sessions.findIndex((s) => s.id === sealed.id)
    if (existing === -1) file.sessions.push(sealed)
    else file.sessions[existing] = sealed
    await persistIndex(file)
    return sealed
  })
}

/**
 * Closes out a session left open by a crash or force-quit, using its last
 * checkpointed activity as the end. Called once at startup — the alternative
 * (discarding it) would silently lose real writing time.
 */
export function recoverOpenSession(): Promise<WritingSession | null> {
  return runQueued(async () => {
    const file = await loadIndex()
    const open = file.openSession
    if (!open) return null
    const sealed = sealSession(open)
    file.openSession = null
    // Returned only when this call is what actually sealed it. The caller adds
    // its delta to the lifetime total, and that addition is irreversible — a
    // session already present here (a checkpoint that raced a close) must not
    // be handed over a second time and counted twice.
    const alreadySealed = file.sessions.some((s) => s.id === sealed.id)
    const isNew = sealed.durationMs > 0 && !alreadySealed
    if (isNew) file.sessions.push(sealed)
    await persistIndex(file)
    return isNew ? sealed : null
  })
}
