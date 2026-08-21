/**
 * The dashboard's data: which projects the app knows about, and what has been
 * written across all of them.
 *
 * Both live in userData rather than in any project folder, because neither
 * belongs to a project — the registry spans them and the totals outlive any
 * one of them being deleted.
 */

export interface KnownProject {
  /** Absolute path to the project folder. The identity of a project. */
  path: string
  /** Its own name, as the binder records it; falls back to the folder name. */
  name: string
  /** ISO timestamp. Drives the Recent list's order. */
  lastOpenedAt: string
  /**
   * The project's current word count, restamped on save.
   *
   * Deliberately *not* what the lifetime total is built from — see
   * LifetimeStats.words. This is the size of the thing now, for display on
   * its row; that is a different question from how much has been written.
   */
  words: number
}

export interface LifetimeStats {
  /**
   * Words written, ever, across every project.
   *
   * Accumulated from sealed writing sessions rather than by summing project
   * sizes: "you have written x words" is a record of effort, and summing
   * current file sizes would make the number fall when a chapter is cut.
   * Only positive session deltas count — a session spent cutting does not
   * subtract from a lifetime of writing.
   */
  words: number
  /** Time spent in sealed writing sessions, in milliseconds. */
  sessionMs: number
  /** How many sessions contributed, for the "sessions" phrasing. */
  sessions: number
}

export interface DashboardData {
  stats: LifetimeStats
  projects: KnownProject[]
  /** The project the app would open if the dashboard were skipped. */
  lastProjectPath: string | null
}

/**
 * Words to a page.
 *
 * A conventional manuscript page, not a typeset one: the real pagination
 * engine is renderer-side and depends on the page size and margins in force,
 * which vary per project and would make a cross-project total meaningless.
 * This is the same figure a publisher means by "a 300-page manuscript".
 */
export const WORDS_PER_PAGE = 250

export function pagesFrom(words: number): number {
  return Math.round(words / WORDS_PER_PAGE)
}

export function hoursFrom(sessionMs: number): number {
  return Math.round(sessionMs / 3_600_000)
}

/** The rotating line beneath the title. Only phrasings with something real to
 *  say are offered — a fresh install should not boast about zero hours. */
export function statPhrasings(stats: LifetimeStats): string[] {
  const out: string[] = []
  const n = (value: number): string => value.toLocaleString()

  if (stats.words > 0) out.push(`You have written ${n(stats.words)} words with ChapterFlow.`)
  const pages = pagesFrom(stats.words)
  if (pages > 0) out.push(`That is about ${n(pages)} manuscript ${pages === 1 ? 'page' : 'pages'}.`)
  const hours = hoursFrom(stats.sessionMs)
  if (hours > 0) out.push(`You have spent ${n(hours)} ${hours === 1 ? 'hour' : 'hours'} writing.`)
  if (stats.sessions > 0) {
    out.push(`Across ${n(stats.sessions)} writing ${stats.sessions === 1 ? 'session' : 'sessions'}.`)
  }
  return out
}
