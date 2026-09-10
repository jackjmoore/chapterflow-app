import { randomUUID } from 'crypto'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { atomicWrite } from './atomicWrite'
import { getProjectRoot } from './projectRoot'
import * as preferencesStore from './preferencesStore'
import {
  DEFAULT_DOCUMENT_SEPARATION,
  DEFAULT_SCENE_BREAK_MARK,
  EMPTY_PERSONAL_DETAILS,
  type CompilePreset,
  type CompileSettings,
  type PersonalDetails
} from '../shared/compile'
import { DEFAULT_BOOK_TRIM, isBookTrim } from '../shared/book'
import { isPageSize } from '../shared/preferences'

/**
 * The manuscript page setup and compile workbench defaults — per-project, in
 * the project root's compile.json, following the one-file-per-domain
 * convention of submissions.json and mentions.json (and deliberately NOT in
 * the hot, autosaved binder.json).
 *
 * Seeding: the first read of a project with no compile.json builds settings
 * from the global editor Page Setup and persists them immediately. Persisting
 * at that moment is what makes "seeded once" true — if the defaults were
 * merely returned, every later change to the editor's Page Setup would keep
 * leaking into compiles until the user's first explicit save here, and the
 * two surfaces would not actually be distinct.
 *
 * No in-memory cache (every op reads the file fresh, submissionStore-style),
 * so Open Project and backup restore need no invalidation hook.
 */

interface CompileFile {
  version: 1
  settings: CompileSettings
  presets?: CompilePreset[]
}

function filePath(): string {
  return join(getProjectRoot(), 'compile.json')
}

async function seedSettings(): Promise<CompileSettings> {
  const [pageSize, marginMm] = await Promise.all([
    preferencesStore.getPageSize(),
    preferencesStore.getPageMarginMm()
  ])
  // docx + manuscript format: the combination a query or submission actually
  // asks for, which is this panel's core use — not the app's own screen look.
  return {
    pageSize,
    marginMm,
    format: 'docx',
    stylePreset: 'manuscript',
    sceneBreakMark: DEFAULT_SCENE_BREAK_MARK,
    bookTrim: DEFAULT_BOOK_TRIM,
    bookIncludeContents: true,
    documentSeparation: DEFAULT_DOCUMENT_SEPARATION,
    personalDetails: { ...EMPTY_PERSONAL_DETAILS },
    frontMatterFolderId: null,
    backMatterFolderId: null
  }
}

/** Older files stored the book-only bookDocumentBoundary; its two values map
 *  directly onto the preset-agnostic setting that replaced it. */
function migrateSeparation(parsed: Record<string, unknown>): unknown {
  if (parsed.documentSeparation !== undefined) return parsed.documentSeparation
  if (parsed.bookDocumentBoundary === 'page-break') return 'page'
  if (parsed.bookDocumentBoundary === 'scene-break') return 'divider'
  return undefined
}

function sanitizeDetails(parsed: unknown): PersonalDetails {
  const raw = (parsed ?? {}) as Partial<PersonalDetails>
  const field = (value: unknown): string => (typeof value === 'string' ? value.slice(0, 500) : '')
  return { name: field(raw.name), contact: field(raw.contact), address: field(raw.address) }
}

/** Tolerant field-by-field read, so a hand-edited or future-versioned file
 *  degrades to defaults per field instead of discarding the whole thing. */
function sanitize(parsed: Partial<CompileSettings>, fallback: CompileSettings): CompileSettings {
  const separation = migrateSeparation(parsed as Record<string, unknown>)
  return {
    pageSize: isPageSize(parsed.pageSize) ? parsed.pageSize : fallback.pageSize,
    marginMm: typeof parsed.marginMm === 'number' ? parsed.marginMm : fallback.marginMm,
    format: parsed.format === 'txt' || parsed.format === 'pdf' || parsed.format === 'docx' || parsed.format === 'md' ? parsed.format : fallback.format,
    stylePreset:
      parsed.stylePreset === 'standard' || parsed.stylePreset === 'manuscript' || parsed.stylePreset === 'book'
        ? parsed.stylePreset
        : fallback.stylePreset,
    sceneBreakMark:
      typeof parsed.sceneBreakMark === 'string' &&
      parsed.sceneBreakMark.trim().length > 0 &&
      parsed.sceneBreakMark.length <= 12
        ? parsed.sceneBreakMark
        : fallback.sceneBreakMark,
    bookTrim: isBookTrim(parsed.bookTrim) ? parsed.bookTrim : fallback.bookTrim,
    bookIncludeContents:
      typeof parsed.bookIncludeContents === 'boolean' ? parsed.bookIncludeContents : fallback.bookIncludeContents,
    documentSeparation: separation === 'page' || separation === 'divider' ? separation : fallback.documentSeparation,
    personalDetails: sanitizeDetails(parsed.personalDetails),
    frontMatterFolderId: typeof parsed.frontMatterFolderId === 'string' ? parsed.frontMatterFolderId : null,
    backMatterFolderId: typeof parsed.backMatterFolderId === 'string' ? parsed.backMatterFolderId : null
  }
}

/** Presets are read tolerantly: a malformed entry is dropped rather than
 *  taking the list down with it. */
function sanitizePresets(parsed: unknown): CompilePreset[] {
  if (!Array.isArray(parsed)) return []
  return parsed.filter((p): p is CompilePreset => {
    if (!p || typeof p !== 'object') return false
    const preset = p as Partial<CompilePreset>
    return (
      typeof preset.id === 'string' &&
      typeof preset.name === 'string' &&
      (preset.scope?.mode === 'all' ||
        (preset.scope?.mode === 'selection' && Array.isArray(preset.scope.nodeIds))) &&
      (preset.format === 'txt' || preset.format === 'pdf' || preset.format === 'docx' || preset.format === 'md') &&
      (preset.stylePreset === 'standard' || preset.stylePreset === 'manuscript' || preset.stylePreset === 'book')
    )
  })
}

/** The whole file as stored, {} when missing or unreadable — every write
 *  below spreads this back out, so updating one part never wipes another
 *  (or any field a future version added). */
async function loadRawFile(): Promise<Record<string, unknown>> {
  if (!existsSync(filePath())) return {}
  try {
    return JSON.parse(await readFile(filePath(), 'utf-8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function persist(settings: CompileSettings): Promise<void> {
  const existing = await loadRawFile()
  const file: CompileFile = { ...existing, version: 1, settings }
  return atomicWrite(filePath(), JSON.stringify(file, null, 2))
}

// Same single-queue idiom as submissionStore: one small file, and the
// seed-on-first-read is itself a read-modify-write that must not interleave
// with an update.
let chain: Promise<void> = Promise.resolve()

function runQueued<T>(op: () => Promise<T>): Promise<T> {
  const run = chain.then(op, op)
  chain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

export function getCompileSettings(): Promise<CompileSettings> {
  return runQueued(async () => {
    const path = filePath()
    if (!existsSync(path)) {
      const seeded = await seedSettings()
      await persist(seeded)
      return seeded
    }
    try {
      const parsed = JSON.parse(await readFile(path, 'utf-8')) as Partial<CompileFile>
      return sanitize(parsed.settings ?? {}, await seedSettings())
    } catch {
      // Unreadable file: fall back to fresh defaults but do NOT overwrite the
      // file — it may hold future fields (presets) a newer version wrote.
      return seedSettings()
    }
  })
}

/** Read-only variant for the export/print menu paths: same settings, but a
 *  missing compile.json is answered with defaults WITHOUT persisting them —
 *  seeding stays tied to the compile section being entered, as designed. */
export function peekCompileSettings(): Promise<CompileSettings> {
  return runQueued(async () => {
    const path = filePath()
    if (!existsSync(path)) return seedSettings()
    try {
      const parsed = JSON.parse(await readFile(path, 'utf-8')) as Partial<CompileFile>
      return sanitize(parsed.settings ?? {}, await seedSettings())
    } catch {
      return seedSettings()
    }
  })
}

export function updateCompileSettings(settings: CompileSettings): Promise<CompileSettings> {
  return runQueued(async () => {
    const clean = sanitize(settings, await seedSettings())
    await persist(clean)
    return clean
  })
}

export function listPresets(): Promise<CompilePreset[]> {
  return runQueued(async () => sanitizePresets((await loadRawFile()).presets))
}

export function savePreset(draft: Omit<CompilePreset, 'id'>): Promise<CompilePreset> {
  return runQueued(async () => {
    const raw = await loadRawFile()
    const preset: CompilePreset = { ...draft, id: randomUUID() }
    const presets = [...sanitizePresets(raw.presets), preset]
    await atomicWrite(filePath(), JSON.stringify({ ...raw, version: 1, presets }, null, 2))
    return preset
  })
}

export function deletePreset(id: string): Promise<void> {
  return runQueued(async () => {
    const raw = await loadRawFile()
    const presets = sanitizePresets(raw.presets).filter((p) => p.id !== id)
    await atomicWrite(filePath(), JSON.stringify({ ...raw, version: 1, presets }, null, 2))
  })
}
