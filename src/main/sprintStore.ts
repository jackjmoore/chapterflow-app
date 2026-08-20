import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { atomicWrite } from './atomicWrite'
import { getProjectRoot } from './projectRoot'
import type { Sprint, SprintState } from '../shared/sprints'

/**
 * Sprint storage — its own project-root file, separate from sessions.json.
 *
 * Records here reference sessions by id and contribute no session records of
 * their own, so the session analytics stay a clean answer to "when was I
 * writing" while sprints answer "when did I deliberately time myself".
 */

interface SprintFile {
  version: 1
  sprints: Sprint[]
}

function indexPath(): string {
  return join(getProjectRoot(), 'sprints.json')
}

function emptyFile(): SprintFile {
  return { version: 1, sprints: [] }
}

async function loadIndex(): Promise<SprintFile> {
  const filePath = indexPath()
  if (!existsSync(filePath)) return emptyFile()
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf-8')) as SprintFile
    if (!Array.isArray(parsed.sprints)) return emptyFile()
    return { version: 1, sprints: parsed.sprints }
  } catch {
    return emptyFile()
  }
}

function persistIndex(file: SprintFile): Promise<void> {
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

export async function getState(): Promise<SprintState> {
  const file = await loadIndex()
  return { sprints: file.sprints }
}

export function recordSprint(sprint: Sprint): Promise<void> {
  return runQueued(async () => {
    const file = await loadIndex()
    const existing = file.sprints.findIndex((s) => s.id === sprint.id)
    if (existing === -1) file.sprints.push(sprint)
    else file.sprints[existing] = sprint
    await persistIndex(file)
  })
}
