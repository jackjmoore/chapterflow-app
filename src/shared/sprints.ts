import { measureSpan } from './sessions'

/**
 * A sprint: a deliberately timed window of writing.
 *
 * A sprint is *not* a kind of session. Sessions record when you were writing,
 * inferred from activity; a sprint records a goal you set, and happens inside
 * a session. So a sprint never calls sealSession() and never produces a
 * WritingSession — its words are already counted by the session that contains
 * them, and minting a second record would double-count them. What the two
 * share is the measurement itself, via measureSpan().
 */
export interface Sprint {
  id: string
  /**
   * The session this sprint happened inside. Null only when no writing
   * occurred at all during the sprint — with no typing there is no session to
   * belong to, and inventing one would be a lie about when you were writing.
   */
  sessionId: string | null
  startedAt: string
  endedAt: string
  /** What was asked for, in minutes — kept even when the sprint is stopped
   *  early, so "planned 25, ran 9" stays legible. */
  targetMinutes: number
  durationMs: number
  startWordCount: number
  endWordCount: number
  netWords: number
  /** True when the countdown reached zero; false when stopped by hand. */
  completed: boolean
  documentIds: string[]
}

export interface SprintState {
  sprints: Sprint[]
}

export const SPRINT_PRESETS_MINUTES = [15, 25, 45]
export const MIN_SPRINT_MINUTES = 1
export const MAX_SPRINT_MINUTES = 240

/** The in-progress sprint, held in the renderer while it runs. */
export interface OpenSprint {
  id: string
  sessionId: string | null
  startedAt: string
  targetMinutes: number
  startWordCount: number
  documentIds: string[]
}

export function sealSprint(
  open: OpenSprint,
  endedAt: string,
  endWordCount: number,
  completed: boolean
): Sprint {
  // Same measurement function the session system uses — see measureSpan.
  const span = measureSpan(open.startedAt, endedAt, open.startWordCount, endWordCount)
  return {
    id: open.id,
    sessionId: open.sessionId,
    startedAt: open.startedAt,
    endedAt,
    targetMinutes: open.targetMinutes,
    durationMs: span.durationMs,
    startWordCount: open.startWordCount,
    endWordCount,
    netWords: span.netWords,
    completed,
    documentIds: open.documentIds
  }
}

/**
 * The one sentence shown when a sprint ends. Deliberately a count and a
 * duration and nothing else — no praise, no exclamation, no comparison to a
 * previous best, matching how targets, pace, and the streak counter are
 * worded elsewhere.
 */
export function sprintResultLine(sprint: Sprint): string {
  const minutes = Math.max(1, Math.round(sprint.durationMs / 60000))
  const words = sprint.netWords
  const wordLabel = Math.abs(words) === 1 ? 'word' : 'words'
  const minuteLabel = minutes === 1 ? 'minute' : 'minutes'
  if (words < 0) return `${words} ${wordLabel} in ${minutes} ${minuteLabel}.`
  return `${words} ${wordLabel} in ${minutes} ${minuteLabel}.`
}

/** Sprints belonging to a given session — the nesting the sessionId encodes. */
export function sprintsForSession(sprints: Sprint[], sessionId: string): Sprint[] {
  return sprints.filter((s) => s.sessionId === sessionId)
}
