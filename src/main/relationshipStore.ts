import { randomUUID } from 'crypto'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { atomicWrite } from './atomicWrite'
import { getProjectRoot } from './projectRoot'
import type { Relationship, RelationshipDraft, RelationshipState } from '../shared/relationships'

/**
 * Story Bible relationship storage — its own project-root file, deliberately
 * separate from both storybible/index.json and timeline.json: a relationship
 * is a statement *about* two items, not part of either item's own record, and
 * not a chronology entry.
 *
 * What it stores about those items is ids and nothing else, so renaming a
 * character is invisible here by design.
 *
 * Holds no in-memory cache (every op reads fresh, timelineStore-style), which
 * keeps it correct across Open Project and backup restore with no
 * invalidateCache() hook, and it lives in the project folder so it travels
 * with the project and lands in backups automatically.
 */

interface RelationshipFile {
  version: 1
  relationships: Relationship[]
}

function indexPath(): string {
  return join(getProjectRoot(), 'relationships.json')
}

function emptyFile(): RelationshipFile {
  return { version: 1, relationships: [] }
}

async function loadIndex(): Promise<RelationshipFile> {
  const filePath = indexPath()
  if (!existsSync(filePath)) return emptyFile()
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf-8')) as RelationshipFile
    if (!Array.isArray(parsed.relationships)) return emptyFile()
    // Normalize on the way in so a hand-edited file can't crash a render.
    for (const relationship of parsed.relationships) {
      if (typeof relationship.reverseLabel !== 'string') relationship.reverseLabel = null
      if (typeof relationship.label !== 'string') relationship.label = ''
    }
    return { version: 1, relationships: parsed.relationships }
  } catch {
    return emptyFile()
  }
}

function persistIndex(file: RelationshipFile): Promise<void> {
  return atomicWrite(indexPath(), JSON.stringify(file, null, 2))
}

// One shared queue for the whole file — same idiom as timelineStore, so a
// read-modify-write can never interleave with another.
let indexChain: Promise<void> = Promise.resolve()

function runQueued<T>(op: () => Promise<T>): Promise<T> {
  const run = indexChain.then(op, op)
  indexChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

export async function getState(): Promise<RelationshipState> {
  const file = await loadIndex()
  return { relationships: file.relationships }
}

export function createRelationship(draft: RelationshipDraft): Promise<Relationship> {
  return runQueued(async () => {
    const file = await loadIndex()
    const now = new Date().toISOString()
    const relationship: Relationship = { ...draft, id: randomUUID(), createdAt: now, updatedAt: now }
    file.relationships.push(relationship)
    await persistIndex(file)
    return relationship
  })
}

export function updateRelationship(id: string, patch: Partial<RelationshipDraft>): Promise<void> {
  return runQueued(async () => {
    const file = await loadIndex()
    const existing = file.relationships.find((r) => r.id === id)
    if (!existing) return
    Object.assign(existing, patch, { updatedAt: new Date().toISOString() })
    await persistIndex(file)
  })
}

export function deleteRelationship(id: string): Promise<void> {
  return runQueued(async () => {
    const file = await loadIndex()
    file.relationships = file.relationships.filter((r) => r.id !== id)
    await persistIndex(file)
  })
}

/**
 * Drops relationships whose endpoints no longer resolve. Opt-in, exactly like
 * the timeline's reference cleanup: deleting a Story Bible item never touches
 * this file, so the board can show the link as visibly broken and a restored
 * backup revives it.
 *
 * Unlike a timeline entry — which survives with its dead link removed — a
 * relationship *is* its two endpoints, so there's nothing left to keep once
 * one of them is gone. Cleanup removes the whole record.
 */
export function pruneBrokenRelationships(validItemIds: string[]): Promise<number> {
  return runQueued(async () => {
    const file = await loadIndex()
    const valid = new Set(validItemIds)
    const before = file.relationships.length
    file.relationships = file.relationships.filter((r) => valid.has(r.fromId) && valid.has(r.toId))
    const removed = before - file.relationships.length
    if (removed > 0) await persistIndex(file)
    return removed
  })
}
