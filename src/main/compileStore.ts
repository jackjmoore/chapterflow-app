import { randomUUID } from 'crypto'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { atomicWrite } from './atomicWrite'
import { getProjectRoot } from './projectRoot'
import { EXPORT_EXTENSIONS } from './export'
import type { CompiledDraftMeta } from '../shared/compile'

/**
 * Compiled drafts — whole-scope, rendered output, stored in the project so a
 * compile remains exactly what it was the day it was made.
 *
 * This is deliberately its own area and module, not a generalization of
 * snapshotStore: snapshots are per-document *source* HTML that can be
 * restored back into the editor, while a compile is rendered *output* at
 * whole-manuscript grain that never flows back into documents. The store
 * accordingly has no update and no restore API — create, list, read, delete
 * is the entire surface, and immutability is enforced by that absence.
 *
 * Layout:
 *   compiles/index.json     — CompiledDraftMeta[], one project-level index
 *   compiles/<id>/output.<ext> — the exact bytes produced (pdf/docx/txt/md)
 *   compiles/<id>/view.html    — frozen assembled HTML for the in-app viewer,
 *                                images already inlined as data URIs so a
 *                                later image deletion can't alter the record
 *
 * Artifacts are written with plain writeFile rather than atomicWrite: they
 * are binary, they land in a directory fresh for this compile, and — since
 * atomicWrite is the seam the search index observes — routing them around it
 * keeps compiled output out of project search entirely. Crash-safety comes
 * from ordering instead: the index entry is appended only after both files
 * are fully on disk, so a listed compile always has its artifacts, and a
 * crash mid-write leaves at worst an unlisted orphan directory.
 */
function compilesDir(): string {
  return join(getProjectRoot(), 'compiles')
}

function indexPath(): string {
  return join(compilesDir(), 'index.json')
}

function draftDir(id: string): string {
  return join(compilesDir(), id)
}

function outputPath(meta: CompiledDraftMeta): string {
  return join(draftDir(meta.id), `output.${EXPORT_EXTENSIONS[meta.format]}`)
}

function viewPath(id: string): string {
  return join(draftDir(id), 'view.html')
}

async function loadIndex(): Promise<CompiledDraftMeta[]> {
  const filePath = indexPath()
  if (!existsSync(filePath)) return []
  try {
    return JSON.parse(await readFile(filePath, 'utf-8')) as CompiledDraftMeta[]
  } catch {
    return []
  }
}

function persistIndex(entries: CompiledDraftMeta[]): Promise<void> {
  return atomicWrite(indexPath(), JSON.stringify(entries, null, 2))
}

// One queue for the whole index — same idiom as submissionStore/mentionStore,
// so create and delete read-modify-writes can never interleave.
let indexChain: Promise<void> = Promise.resolve()

function runQueued<T>(op: () => Promise<T>): Promise<T> {
  const run = indexChain.then(op, op)
  indexChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

export interface NewCompile {
  name: string
  format: CompiledDraftMeta['format']
  stylePreset: CompiledDraftMeta['stylePreset']
  scope: CompiledDraftMeta['scope']
  scopeSummary: CompiledDraftMeta['scopeSummary']
  pageSize: CompiledDraftMeta['pageSize']
  marginMm: CompiledDraftMeta['marginMm']
  bookTrim?: CompiledDraftMeta['bookTrim']
  wordCount: number
  warningsAccepted: number
  acceptedFindings?: CompiledDraftMeta['acceptedFindings']
}

export function createCompile(draft: NewCompile, output: Buffer, viewHtml: string): Promise<CompiledDraftMeta> {
  return runQueued(async () => {
    // Identity is stamped over the draft, not under it: a caller-built object
    // that happens to carry id/createdAt (say, spread from an existing meta)
    // must never smuggle them in, or two index entries could share an id.
    const meta: CompiledDraftMeta = { ...draft, id: randomUUID(), createdAt: new Date().toISOString() }
    await mkdir(draftDir(meta.id), { recursive: true })
    await writeFile(outputPath(meta), output)
    await writeFile(viewPath(meta.id), viewHtml, 'utf-8')
    // Index last — see the module comment on crash-safety ordering.
    const index = await loadIndex()
    index.push(meta)
    await persistIndex(index)
    return meta
  })
}

/** Newest first — the order every consumer (history, pickers) wants. */
export async function listCompiles(): Promise<CompiledDraftMeta[]> {
  const index = await loadIndex()
  return index.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getCompile(id: string): Promise<CompiledDraftMeta> {
  const meta = (await loadIndex()).find((entry) => entry.id === id)
  // Like a missing snapshot, a missing compile must throw — a silent null
  // here could let a caller quietly treat "record gone" as "nothing sent".
  if (!meta) throw new Error('Compiled draft not found')
  return meta
}

export async function getCompileView(id: string): Promise<string> {
  try {
    return await readFile(viewPath(id), 'utf-8')
  } catch {
    throw new Error('Compiled draft content not found')
  }
}

/** The stored output bytes, exactly as compiled — what "Export a copy" writes
 *  to disk, byte-identical to the original artifact. */
export async function readCompileOutput(id: string): Promise<Buffer> {
  const meta = await getCompile(id)
  try {
    return await readFile(outputPath(meta))
  } catch {
    throw new Error('Compiled draft content not found')
  }
}

/** Deleting is allowed (disk hygiene) — immutability means never *modified*,
 *  the same contract snapshots have. Callers own any referenced-by-submission
 *  warning; the store just deletes. */
export function deleteCompile(id: string): Promise<void> {
  return runQueued(async () => {
    await rm(draftDir(id), { recursive: true, force: true })
    const index = await loadIndex()
    await persistIndex(index.filter((entry) => entry.id !== id))
  })
}
