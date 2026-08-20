/**
 * Writing sessions.
 *
 * A session is one stretch during which you were actually writing, inferred
 * from typing activity and closed by an idle gap — deliberately *not*
 * app-open-to-app-close, so leaving the app running in the background over
 * lunch doesn't become a three-hour session.
 *
 * This is the only record type here on purpose. The sprint timer will add its
 * own store whose records carry a `sessionId` pointing back at one of these,
 * so a two-hour session containing three sprints stays one session with three
 * sprints inside it. Sprints will contribute no session records of their own
 * and so can never double-count words.
 */
export interface WritingSession {
  id: string
  /** ISO timestamp of the first edit after the preceding idle gap. */
  startedAt: string
  /** ISO timestamp of the *last edit*, not the moment the idle check noticed.
   *  Stamping it at detection time would pad every session by the threshold. */
  endedAt: string
  durationMs: number
  /**
   * Project-wide word totals at each end, captured from the same live count
   * the footer shows — which comes from countWords(), the one algorithm the
   * editor, outliner, and daily baseline all share. Stored because they are a
   * record of a past measurement (like binder.json's wordCountBaseline), not
   * a cache of something still derivable.
   */
  startWordCount: number
  endWordCount: number
  /** endWordCount - startWordCount. Net, so writing 500 and cutting 200
   *  records 300; a session spent cutting records a negative. */
  netWords: number
  /** Every document edited during the session, in the order first touched. */
  documentIds: string[]
}

/** A session still in progress. Checkpointed to disk while it runs so a crash
 *  or force-quit loses at most one checkpoint interval rather than the whole
 *  session; recovered and closed on next launch. */
export interface OpenSession {
  id: string
  startedAt: string
  lastActivityAt: string
  startWordCount: number
  lastWordCount: number
  documentIds: string[]
}

export interface SessionState {
  sessions: WritingSession[]
  openSession: OpenSession | null
}

export const DEFAULT_IDLE_GAP_MINUTES = 15
export const MIN_IDLE_GAP_MINUTES = 1
export const MAX_IDLE_GAP_MINUTES = 120

/**
 * Duration and net words for any measured stretch of writing.
 *
 * Shared deliberately: sessions and sprints are different *records* but the
 * same *measurement*, so they must never drift into computing "how long" and
 * "how many words" two slightly different ways. sealSession below and
 * sealSprint in sprints.ts both go through here.
 */
export interface MeasuredSpan {
  durationMs: number
  netWords: number
}

export function measureSpan(
  startedAt: string,
  endedAt: string,
  startWordCount: number,
  endWordCount: number
): MeasuredSpan {
  return {
    durationMs: Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime()),
    netWords: endWordCount - startWordCount
  }
}

/** Turns a finished open session into a permanent record. */
export function sealSession(open: OpenSession): WritingSession {
  const span = measureSpan(open.startedAt, open.lastActivityAt, open.startWordCount, open.lastWordCount)
  return {
    id: open.id,
    startedAt: open.startedAt,
    endedAt: open.lastActivityAt,
    durationMs: span.durationMs,
    startWordCount: open.startWordCount,
    endWordCount: open.lastWordCount,
    netWords: span.netWords,
    documentIds: open.documentIds
  }
}

// ---------------------------------------------------------------- analytics

/** Local-date key (not UTC) so "days" line up with the writer's own calendar,
 *  the same convention the daily word-count baseline uses. */
export function localDateKey(iso: string): string {
  const d = new Date(iso)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

/** Sessions started in each hour 0–23, with the words written in them. */
export function hourHistogram(sessions: WritingSession[]): { hour: number; sessions: number; words: number }[] {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, sessions: 0, words: 0 }))
  for (const session of sessions) {
    const hour = new Date(session.startedAt).getHours()
    buckets[hour].sessions += 1
    buckets[hour].words += Math.max(0, session.netWords)
  }
  return buckets
}

/**
 * Consecutive days, counting back from today, with at least one session.
 * Yesterday counts as the anchor if nothing has been written yet today, so a
 * streak isn't reported as broken until a day has actually been missed.
 */
export function currentStreak(sessions: WritingSession[], today = new Date()): number {
  const days = new Set(sessions.map((s) => localDateKey(s.startedAt)))
  if (days.size === 0) return 0

  const key = (d: Date): string => localDateKey(d.toISOString())
  const cursor = new Date(today)
  if (!days.has(key(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
    if (!days.has(key(cursor))) return 0
  }

  let streak = 0
  while (days.has(key(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

/**
 * Pearson correlation between session length and words written, plus the
 * points behind it. Reported as a number with its sample size rather than a
 * verdict — with a handful of sessions an r of 0.8 means very little, and the
 * reader should be able to see that for themselves.
 */
export interface LengthOutputStats {
  points: { minutes: number; words: number; session: WritingSession }[]
  /** null when there are fewer than 3 points or no variation to correlate. */
  r: number | null
  sampleSize: number
}

export function lengthVsOutput(sessions: WritingSession[]): LengthOutputStats {
  const points = sessions.map((session) => ({
    minutes: session.durationMs / 60000,
    words: session.netWords,
    session
  }))

  if (points.length < 3) return { points, r: null, sampleSize: points.length }

  const n = points.length
  const meanX = points.reduce((sum, p) => sum + p.minutes, 0) / n
  const meanY = points.reduce((sum, p) => sum + p.words, 0) / n
  let num = 0
  let dx2 = 0
  let dy2 = 0
  for (const p of points) {
    const dx = p.minutes - meanX
    const dy = p.words - meanY
    num += dx * dy
    dx2 += dx * dx
    dy2 += dy * dy
  }
  const denom = Math.sqrt(dx2 * dy2)
  return { points, r: denom === 0 ? null : num / denom, sampleSize: n }
}

export interface SessionSummary {
  count: number
  totalWords: number
  totalMs: number
  streak: number
  /** Median rather than mean: one four-hour marathon shouldn't redefine what
   *  a typical session looks like. */
  medianMinutes: number
}

export function summarize(sessions: WritingSession[], today = new Date()): SessionSummary {
  const minutes = sessions.map((s) => s.durationMs / 60000).sort((a, b) => a - b)
  const mid = Math.floor(minutes.length / 2)
  const median =
    minutes.length === 0 ? 0 : minutes.length % 2 ? minutes[mid] : (minutes[mid - 1] + minutes[mid]) / 2

  return {
    count: sessions.length,
    totalWords: sessions.reduce((sum, s) => sum + s.netWords, 0),
    totalMs: sessions.reduce((sum, s) => sum + s.durationMs, 0),
    streak: currentStreak(sessions, today),
    medianMinutes: median
  }
}

// ---------------------------------------------------------------- export

function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** One row per session. `documents` is flattened to a semicolon-joined list of
 *  names — lossy, which is why JSON export exists alongside this. */
export function sessionsToCsv(
  sessions: WritingSession[],
  documentNameFor: (id: string) => string
): string {
  const header = [
    'id',
    'started_at',
    'ended_at',
    'duration_minutes',
    'start_word_count',
    'end_word_count',
    'net_words',
    'words_per_hour',
    'document_count',
    'documents'
  ]
  const rows = sessions.map((s) => {
    const minutes = s.durationMs / 60000
    return [
      s.id,
      s.startedAt,
      s.endedAt,
      minutes.toFixed(2),
      s.startWordCount,
      s.endWordCount,
      s.netWords,
      minutes > 0 ? (s.netWords / (minutes / 60)).toFixed(1) : '',
      s.documentIds.length,
      s.documentIds.map(documentNameFor).join('; ')
    ].map(csvCell).join(',')
  })
  return [header.join(','), ...rows].join('\n')
}
