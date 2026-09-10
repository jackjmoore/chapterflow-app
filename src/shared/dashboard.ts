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

/**
 * Words held in the projects the app currently knows about.
 *
 * A different question from LifetimeStats.words, and kept separate on purpose:
 * this is how much manuscript exists now, that one is how much of it was typed
 * here. A project imported or generated outside the app contributes to this
 * and not to that, which is the whole distinction.
 *
 * Summed from each project's last-stamped size, so it moves when a project is
 * saved rather than continuously, and it counts only projects whose folder is
 * still on disk — getDashboardData drops the missing ones before this sees
 * them.
 */
export function projectWordsTotal(projects: KnownProject[]): number {
  return projects.reduce((sum, project) => sum + Math.max(0, project.words), 0)
}

/** The rotating line beneath the title. Only phrasings with something real to
 *  say are offered — a fresh install should not boast about zero hours. */
export function statPhrasings(stats: LifetimeStats, projects: KnownProject[] = []): string[] {
  const out: string[] = []
  const n = (value: number): string => value.toLocaleString()

  // First, because it is the one people mean by "how much have I got": the
  // size of the work itself, whether or not it was typed in this app.
  const held = projectWordsTotal(projects)
  if (held > 0) {
    out.push(
      projects.length === 1
        ? `Your project holds ${n(held)} words.`
        : `Your ${n(projects.length)} projects hold ${n(held)} words between them.`
    )
  }

  // Then the effort figure, which counts only what was typed here in a
  // recorded session — see LifetimeStats.words for why it is not a file size.
  if (stats.words > 0) out.push(`You have typed ${n(stats.words)} words in ChapterFlow.`)
  const pages = pagesFrom(stats.words)
  if (pages > 0) out.push(`That is about ${n(pages)} manuscript ${pages === 1 ? 'page' : 'pages'}.`)
  const hours = hoursFrom(stats.sessionMs)
  if (hours > 0) out.push(`You have spent ${n(hours)} ${hours === 1 ? 'hour' : 'hours'} writing.`)
  if (stats.sessions > 0) {
    out.push(`Across ${n(stats.sessions)} writing ${stats.sessions === 1 ? 'session' : 'sessions'}.`)
  }
  return out
}

/**
 * The landing page's ticker: short facts that pan past on a loop.
 *
 * Two rules shape these, and both come from the shape of a marquee rather
 * than from taste.
 *
 * **Each is a whole sentence that stands on its own.** On a loop there is no
 * "previous" item — whichever one you happen to look up at is the first one
 * you see — so none of them may lean on the one before it. "You have typed
 * 61,340 of them here" is meaningless read cold; "You have typed 61,340 words
 * in ChapterFlow" is not.
 *
 * **Only facts the record actually holds.** The registry knows a project's
 * name, its last-opened date and its current size, and lifetime.json knows
 * words typed, time spent and how many sessions. It does not know how many
 * chapters a project has, or which days were written on — so neither appears
 * here. A day-by-day breakdown belongs to the Progress Tracker anyway, which
 * owns pace, targets and the calendar in full; repeating any of that here
 * would be a second, worse copy of it.
 */
export function tickerFacts(stats: LifetimeStats, projects: KnownProject[] = []): string[] {
  const out: string[] = []
  const n = (value: number): string => value.toLocaleString()

  const held = projectWordsTotal(projects)
  if (held > 0) {
    out.push(
      projects.length === 1
        ? `Your project holds ${n(held)} words.`
        : `Your ${n(projects.length)} projects hold ${n(held)} words between them.`
    )
  }

  if (stats.words > 0) out.push(`You have typed ${n(stats.words)} words in ChapterFlow.`)

  const pages = pagesFrom(stats.words)
  if (pages > 0) {
    out.push(`That comes to about ${n(pages)} manuscript ${pages === 1 ? 'page' : 'pages'}.`)
  }

  const hours = hoursFrom(stats.sessionMs)
  if (hours > 0) out.push(`You have spent about ${n(hours)} ${hours === 1 ? 'hour' : 'hours'} writing.`)

  if (stats.sessions > 0) {
    out.push(`You have recorded ${n(stats.sessions)} writing ${stats.sessions === 1 ? 'session' : 'sessions'}.`)
  }

  // The registry is sorted newest-first, so the head of it is the last one
  // opened. Named rather than counted, because "the one you were last in" is
  // the fact worth having.
  const [mostRecent] = projects
  if (mostRecent) out.push(`You last opened ${mostRecent.name}.`)

  const largest = projects.reduce<KnownProject | null>(
    (best, p) => (best === null || p.words > best.words ? p : best),
    null
  )
  if (largest && largest.words > 0 && projects.length > 1) {
    out.push(`Your largest project, ${largest.name}, holds ${n(largest.words)} words.`)
  }

  return out
}
