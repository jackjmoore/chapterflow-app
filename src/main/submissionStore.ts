import { randomUUID } from 'crypto'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { atomicWrite } from './atomicWrite'
import { getProjectRoot } from './projectRoot'
import { DEFAULT_SUBMISSION_STATUSES, type Submission, type SubmissionState, type SubmissionStatus } from '../shared/submissions'

/**
 * Query/submission tracking — its own project-root file, deliberately not part
 * of binder.json or the Story Bible: a submission is neither a manuscript
 * document nor a story element.
 *
 * Holds no in-memory cache (every op reads the file fresh, mentionStore-style).
 * That's what makes it correct across Open Project and backup restore without
 * needing an invalidateCache() hook anywhere, and it lives in the project
 * folder so it travels with the project and lands in backups automatically.
 */

interface SubmissionFile {
  version: 1
  submissions: Submission[]
  statuses: SubmissionStatus[]
}

function indexPath(): string {
  return join(getProjectRoot(), 'submissions.json')
}

function emptyFile(): SubmissionFile {
  return { version: 1, submissions: [], statuses: DEFAULT_SUBMISSION_STATUSES.map((s) => ({ ...s })) }
}

async function loadIndex(): Promise<SubmissionFile> {
  const filePath = indexPath()
  if (!existsSync(filePath)) return emptyFile()
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf-8')) as SubmissionFile
    if (!Array.isArray(parsed.submissions) || !Array.isArray(parsed.statuses)) return emptyFile()
    return { version: 1, submissions: parsed.submissions, statuses: parsed.statuses }
  } catch {
    return emptyFile()
  }
}

function persistIndex(file: SubmissionFile): Promise<void> {
  return atomicWrite(indexPath(), JSON.stringify(file, null, 2))
}

// One shared queue for the whole file — same idiom as spanTagStore/mentionStore,
// so a read-modify-write can never interleave with another.
let indexChain: Promise<void> = Promise.resolve()

function runQueued<T>(op: () => Promise<T>): Promise<T> {
  const run = indexChain.then(op, op)
  indexChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

export async function getState(): Promise<SubmissionState> {
  const file = await loadIndex()
  return { submissions: file.submissions, statuses: file.statuses }
}

export type SubmissionDraft = Omit<Submission, 'id' | 'createdAt' | 'updatedAt'>

export function createSubmission(draft: SubmissionDraft): Promise<Submission> {
  return runQueued(async () => {
    const file = await loadIndex()
    const now = new Date().toISOString()
    const submission: Submission = { ...draft, id: randomUUID(), createdAt: now, updatedAt: now }
    file.submissions.push(submission)
    await persistIndex(file)
    return submission
  })
}

export function updateSubmission(id: string, patch: Partial<SubmissionDraft>): Promise<void> {
  return runQueued(async () => {
    const file = await loadIndex()
    const existing = file.submissions.find((s) => s.id === id)
    if (!existing) return
    Object.assign(existing, patch, { updatedAt: new Date().toISOString() })
    await persistIndex(file)
  })
}

export function deleteSubmission(id: string): Promise<void> {
  return runQueued(async () => {
    const file = await loadIndex()
    file.submissions = file.submissions.filter((s) => s.id !== id)
    await persistIndex(file)
  })
}

/** Replaces the whole status list. Entries referencing a removed status keep
 *  their (now-dangling) statusId — the view renders it as "Unknown status"
 *  rather than rewriting history, matching how a deleted tag/status is handled
 *  elsewhere in the app. */
export function setStatuses(statuses: SubmissionStatus[]): Promise<void> {
  return runQueued(async () => {
    const file = await loadIndex()
    file.statuses = statuses
    await persistIndex(file)
  })
}

/**
 * Called when a binder document is deleted. The submission itself survives —
 * you still sent that query — but its now-meaningless document/snapshot ids
 * are cleared. `documentNameAtSend` is deliberately left intact so the entry
 * still reads as a record of what went out.
 */
export function handleDocumentDeleted(documentId: string): Promise<void> {
  return runQueued(async () => {
    const file = await loadIndex()
    let changed = false
    for (const submission of file.submissions) {
      if (submission.documentId !== documentId) continue
      submission.documentId = null
      submission.snapshotId = null
      submission.updatedAt = new Date().toISOString()
      changed = true
    }
    if (changed) await persistIndex(file)
  })
}
