import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { parse } from 'node-html-parser'
import { atomicWrite } from './atomicWrite'
import { getProjectRoot } from './projectRoot'
import * as storyBibleStore from './storyBibleStore'
import * as binderStore from './binderStore'
import { loadDocument } from './documentStore'
import { prepareMentionMatching, findMentionsInText, type MentionCandidate } from '../shared/mentionMatcher'
import type { ItemMentionStat } from '../shared/storyBible'

/** A derived cache, not a source of truth, the same way spanTags.json is:
 *  rebuilt from a document's saved HTML plus the live Story Bible item/alias
 *  list, never hand-edited. `source: 'auto'` records come from name/alias
 *  detection and get replaced wholesale on every rebuild; `'manual'` records
 *  come from the binder's "Story Bible Mentions" submenu and survive rebuilds
 *  untouched, since nothing in the text can prove or disprove them. */
export interface MentionRecord {
  documentId: string
  itemId: string
  count: number
  firstOffset: number | null
  lastOffset: number | null
  source: 'auto' | 'manual'
}

interface MentionFile {
  version: 1
  mentions: MentionRecord[]
}

function indexPath(): string {
  return join(getProjectRoot(), 'mentions.json')
}

async function loadIndex(): Promise<MentionFile> {
  const filePath = indexPath()
  if (!existsSync(filePath)) return { version: 1, mentions: [] }
  try {
    return JSON.parse(await readFile(filePath, 'utf-8')) as MentionFile
  } catch {
    return { version: 1, mentions: [] }
  }
}

function persistIndex(file: MentionFile): Promise<void> {
  return atomicWrite(indexPath(), JSON.stringify(file, null, 2))
}

// Same single-queue idiom as spanTagStore — the whole project shares one
// small file, and a full rescan (slow) and a per-document rebuild (fast,
// triggered on every save) both read-modify-write it, so they must never
// interleave.
let indexChain: Promise<void> = Promise.resolve()

function runQueued<T>(op: () => Promise<T>): Promise<T> {
  const run = indexChain.then(op, op)
  indexChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

async function buildCandidates(): Promise<MentionCandidate[]> {
  const { items } = await storyBibleStore.getState()
  const candidates: MentionCandidate[] = []
  for (const item of items) {
    candidates.push({ itemId: item.id, text: item.name })
    for (const alias of item.aliases) candidates.push({ itemId: item.id, text: alias })
  }
  return candidates
}

function autoRecordsFor(documentId: string, html: string, regex: RegExp | null, lookup: Map<string, string>): MentionRecord[] {
  if (!regex) return []
  const text = parse(html).textContent
  const found = findMentionsInText(text, regex, lookup)
  const records: MentionRecord[] = []
  for (const [itemId, stats] of found) {
    records.push({ documentId, itemId, count: stats.count, firstOffset: stats.firstOffset, lastOffset: stats.lastOffset, source: 'auto' })
  }
  return records
}

/** Re-derives one document's auto-detected mentions from its just-saved HTML
 *  and replaces its 'auto' entries in the index, leaving any 'manual' entries
 *  for that same document untouched. Called from the document:save IPC
 *  handler, fire-and-forget (not awaited) — see that handler's comment for why. */
export function rebuildAutoForDocument(documentId: string, html: string): Promise<void> {
  return runQueued(async () => {
    const { regex, lookup } = prepareMentionMatching(await buildCandidates())
    const file = await loadIndex()
    const kept = file.mentions.filter((m) => !(m.documentId === documentId && m.source === 'auto'))
    const fresh = autoRecordsFor(documentId, html, regex, lookup)
    await persistIndex({ version: 1, mentions: [...kept, ...fresh] })
  })
}

/** Full project rescan — every document's 'auto' entries recomputed against
 *  the current item/alias list in one batch. Triggered only by relatively
 *  rare actions (creating/renaming/aliasing a Story Bible item), never by
 *  typing; cost is proportional to total manuscript size. */
export function rescanProject(): Promise<void> {
  return runQueued(async () => {
    const { regex, lookup } = prepareMentionMatching(await buildCandidates())
    const documentIds = await binderStore.getAllDocumentIds()
    const fresh: MentionRecord[] = []
    for (const documentId of documentIds) {
      const html = await loadDocument(documentId)
      fresh.push(...autoRecordsFor(documentId, html, regex, lookup))
    }
    const file = await loadIndex()
    const manual = file.mentions.filter((m) => m.source === 'manual')
    await persistIndex({ version: 1, mentions: [...manual, ...fresh] })
  })
}

export function deleteAllForDocument(documentId: string): Promise<void> {
  return runQueued(async () => {
    const file = await loadIndex()
    await persistIndex({ version: 1, mentions: file.mentions.filter((m) => m.documentId !== documentId) })
  })
}

export function deleteAllForItem(itemId: string): Promise<void> {
  return runQueued(async () => {
    const file = await loadIndex()
    await persistIndex({ version: 1, mentions: file.mentions.filter((m) => m.itemId !== itemId) })
  })
}

/** Adds or removes a single manually-tagged mention (independent of what
 *  detection finds — the binder's "Story Bible Mentions" submenu). */
export function setManualMention(documentId: string, itemId: string, present: boolean): Promise<void> {
  return runQueued(async () => {
    const file = await loadIndex()
    const withoutThis = file.mentions.filter(
      (m) => !(m.documentId === documentId && m.itemId === itemId && m.source === 'manual')
    )
    const mentions = present
      ? [...withoutThis, { documentId, itemId, count: 1, firstOffset: null, lastOffset: null, source: 'manual' as const }]
      : withoutThis
    await persistIndex({ version: 1, mentions })
  })
}

export async function listMentions(): Promise<MentionRecord[]> {
  return (await loadIndex()).mentions
}

/** Per-document breakdown for one item, auto+manual pre-merged (auto's
 *  count/offsets win when both exist for the same document, since only auto
 *  records carry real text positions) — so the renderer's Appearances panel
 *  doesn't need its own merge logic, just manuscript-order ranking via the
 *  binder tree it already has. */
export async function getStatsForItem(itemId: string): Promise<ItemMentionStat[]> {
  const mentions = (await loadIndex()).mentions.filter((m) => m.itemId === itemId)
  const byDocument = new Map<string, MentionRecord>()
  for (const m of mentions) {
    const existing = byDocument.get(m.documentId)
    // Prefer the 'auto' record when both exist for the same document — it
    // carries real text positions, a manual tag doesn't.
    if (!existing || (existing.source === 'manual' && m.source === 'auto')) {
      byDocument.set(m.documentId, m)
    }
  }
  return Array.from(byDocument.values()).map((m) => ({
    documentId: m.documentId,
    count: m.count,
    firstOffset: m.firstOffset,
    lastOffset: m.lastOffset
  }))
}
