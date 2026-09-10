import { localDateKey, type WritingSession } from '../../shared/sessions'

/**
 * Pure data shaping for the Progress panel's charts.
 *
 * Everything here derives from the session record — the one historical
 * account of writing the app keeps — using the same conventions the session
 * analytics already established: days bucket by localDateKey(startedAt) (a
 * midnight-spanning session belongs to its start day), and negative netWords
 * stay negative, because deleting a scene is real history, not something to
 * launder into zero.
 *
 * The cumulative series is anchored at TODAY's live total and reconstructed
 * backwards by subtracting each day's delta. Sessions can't see edits made
 * outside any session (imports, binder deletions), so reconstruction error
 * exists — anchoring at the live total pushes all of it into the far past,
 * where the record genuinely doesn't know what happened, and keeps "now"
 * exactly right.
 */

export interface DayPoint {
  /** Local YYYY-MM-DD. */
  date: string
  words: number
}

export interface CumulativePoint {
  date: string
  total: number
}

function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/** Monday-start week key for a local date key. */
export function weekStartKey(dateKey: string): string {
  const date = keyToDate(dateKey)
  const shift = (date.getDay() + 6) % 7 // Mon=0 … Sun=6
  return localDateKey(addDays(date, -shift).toISOString())
}

/** Net words per local day, gaps filled with zero from first session to today. */
export function dailyWords(sessions: WritingSession[], today = new Date()): DayPoint[] {
  if (sessions.length === 0) return []
  const byDay = new Map<string, number>()
  for (const session of sessions) {
    const key = localDateKey(session.startedAt)
    byDay.set(key, (byDay.get(key) ?? 0) + session.netWords)
  }
  const first = [...byDay.keys()].sort()[0]
  const points: DayPoint[] = []
  const todayKey = localDateKey(today.toISOString())
  for (let d = keyToDate(first); ; d = addDays(d, 1)) {
    const key = localDateKey(d.toISOString())
    points.push({ date: key, words: byDay.get(key) ?? 0 })
    if (key >= todayKey) break
  }
  return points
}

/** The last `count` days of dailyWords — the momentum view. */
export function recentDailyWords(sessions: WritingSession[], count: number, today = new Date()): DayPoint[] {
  const all = dailyWords(sessions, today)
  if (all.length === 0) return []
  const wanted: DayPoint[] = []
  const start = addDays(today, -(count - 1))
  const byDate = new Map(all.map((p) => [p.date, p.words]))
  for (let i = 0; i < count; i++) {
    const key = localDateKey(addDays(start, i).toISOString())
    wanted.push({ date: key, words: byDate.get(key) ?? 0 })
  }
  return wanted
}

/** Total words over time, anchored so the last point equals `currentTotal`. */
export function cumulativeWords(
  sessions: WritingSession[],
  currentTotal: number,
  today = new Date()
): CumulativePoint[] {
  const days = dailyWords(sessions, today)
  if (days.length === 0) return []
  const points: CumulativePoint[] = new Array(days.length)
  let total = currentTotal
  for (let i = days.length - 1; i >= 0; i--) {
    points[i] = { date: days[i].date, total }
    total -= days[i].words
  }
  return points
}
