import { app } from 'electron'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { basename, join } from 'path'
import { atomicWrite } from './atomicWrite'
import { projectExistsAt } from './projectRoot'
import type { DashboardData, KnownProject, LifetimeStats } from '../shared/dashboard'
import type { WritingSession } from '../shared/sessions'

/**
 * Which projects the app has seen, and what has been written across all of
 * them.
 *
 * Lives in userData, not in a project: the registry spans projects and the
 * totals have to survive one being deleted.
 *
 * Nothing here scans anything. The two numbers are maintained by the code that
 * already writes the underlying data, following the two patterns this app
 * already uses for exactly this problem:
 *
 *   - wordCountStore memoises per-document counts and is invalidated by the
 *     save path. `recordProjectWords` is called from that same path, with the
 *     total wordCountStore has just recomputed — so a project's size on the
 *     Recent list costs nothing extra to keep current.
 *   - sessionStore seals a writing session with its own word delta and
 *     duration. `recordSession` is called when that seal happens, and adds the
 *     delta to the lifetime total.
 *
 * Neither number is derived here, and the dashboard performs no aggregation at
 * load: it reads this one small file.
 *
 * There is no directory containing every project — a project is any folder
 * with a binder.json, and Open Project can point anywhere — so a registry is
 * the only way to know what "across every project" means.
 */

const MAX_KNOWN_PROJECTS = 40

interface LifetimeFile {
  version: 1
  stats: LifetimeStats
  projects: KnownProject[]
}

function emptyFile(): LifetimeFile {
  return { version: 1, stats: { words: 0, sessionMs: 0, sessions: 0 }, projects: [] }
}

function filePath(): string {
  return join(app.getPath('userData'), 'lifetime.json')
}

/** Serialises writes so two hooks firing at once cannot lose each other's
 *  increment — the same read-modify-write hazard sessionStore guards. */
let chain: Promise<void> = Promise.resolve()

async function load(): Promise<LifetimeFile> {
  const path = filePath()
  if (!existsSync(path)) return emptyFile()
  try {
    const parsed = JSON.parse(await readFile(path, 'utf-8')) as LifetimeFile
    if (!parsed || typeof parsed !== 'object') return emptyFile()
    const stats = parsed.stats ?? {}
    return {
      version: 1,
      stats: {
        words: typeof stats.words === 'number' ? stats.words : 0,
        sessionMs: typeof stats.sessionMs === 'number' ? stats.sessionMs : 0,
        sessions: typeof stats.sessions === 'number' ? stats.sessions : 0
      },
      projects: Array.isArray(parsed.projects) ? parsed.projects.filter((p) => typeof p?.path === 'string') : []
    }
  } catch {
    return emptyFile()
  }
}

function persist(file: LifetimeFile): Promise<void> {
  return atomicWrite(filePath(), JSON.stringify(file, null, 2))
}

function update(mutate: (file: LifetimeFile) => void): Promise<void> {
  const run = async (): Promise<void> => {
    const file = await load()
    mutate(file)
    file.projects.sort((a, b) => (a.lastOpenedAt < b.lastOpenedAt ? 1 : -1))
    if (file.projects.length > MAX_KNOWN_PROJECTS) file.projects.length = MAX_KNOWN_PROJECTS
    await persist(file)
  }
  const next = chain.then(run, run)
  chain = next.then(
    () => undefined,
    () => undefined
  )
  return next
}

function entryFor(file: LifetimeFile, path: string): KnownProject {
  const existing = file.projects.find((p) => p.path === path)
  if (existing) return existing
  const created: KnownProject = { path, name: basename(path), lastOpenedAt: new Date().toISOString(), words: 0 }
  file.projects.push(created)
  return created
}

/** Called when a project is opened — at startup and on Open Project. */
export function recordProjectOpened(path: string, name: string | null): Promise<void> {
  return update((file) => {
    const entry = entryFor(file, path)
    entry.name = name?.trim() || basename(path)
    entry.lastOpenedAt = new Date().toISOString()
  })
}

/**
 * Adds a project to the registry if it is not already there, without touching
 * an existing row's lastOpenedAt — being looked at is not being opened.
 *
 * Read paths call this so the project currently in use is always listed, even
 * if it arrived by a route that never announced itself: the default project
 * folder is applied by projectRoot.ts rather than by a preference, so someone
 * who has only ever used it has `projectRoot: null` saved and nothing would
 * otherwise register them.
 */
export function ensureProject(path: string, name: string | null): Promise<void> {
  return update((file) => {
    const existing = file.projects.find((p) => p.path === path)
    if (existing) {
      if (name?.trim()) existing.name = name.trim()
      return
    }
    entryFor(file, path).name = name?.trim() || basename(path)
  })
}

/**
 * Called from the save path with the total wordCountStore has just recomputed.
 * Only the project's own row changes; the lifetime total is untouched, because
 * current size and words written are different questions.
 */
export function recordProjectWords(path: string, words: number): Promise<void> {
  return update((file) => {
    entryFor(file, path).words = words
  })
}

/**
 * Called when sessionStore seals a session. Its delta is the only thing that
 * moves the lifetime word total.
 */
export function recordSession(session: WritingSession): Promise<void> {
  return update((file) => {
    // Net, but floored at zero: a session spent cutting should not subtract
    // from a lifetime of writing, and duration still counts either way.
    file.stats.words += Math.max(0, session.netWords)
    file.stats.sessionMs += Math.max(0, session.durationMs)
    file.stats.sessions += 1
  })
}

/** Drops a project the user no longer wants listed. Its contribution to the
 *  lifetime total stays: those words were still written. */
export function forgetProject(path: string): Promise<void> {
  return update((file) => {
    file.projects = file.projects.filter((p) => p.path !== path)
  })
}

export async function getDashboardData(lastProjectPath: string | null): Promise<DashboardData> {
  const file = await load()
  // A project folder the user has since deleted or moved should not be offered
  // as something to open, but is only dropped from the list on read — quietly
  // rewriting the file because a drive was unmounted would be worse.
  const projects = file.projects.filter((p) => projectExistsAt(p.path))
  return { stats: file.stats, projects, lastProjectPath }
}

/** Test seam: waits for queued writes to land. */
export function settled(): Promise<void> {
  return update(() => undefined)
}
