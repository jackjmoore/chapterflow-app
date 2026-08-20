import { useCallback, useEffect, useRef, useState } from 'react'
import { sealSprint, type OpenSprint, type Sprint } from '../../shared/sprints'

interface UseSprintArgs {
  projectWordCountRef: React.MutableRefObject<number>
  activeDocumentIdRef: React.MutableRefObject<string | null>
  /** The enclosing session's id at this instant, or null when idle. */
  currentSessionId: () => string | null
  chime: boolean
  onFinished: (sprint: Sprint) => void
}

export interface SprintController {
  /** Milliseconds left, or null when no sprint is running. */
  remainingMs: number | null
  targetMinutes: number | null
  start: (minutes: number) => void
  /** Ends early. The record still keeps the target, so "planned 25, ran 9"
   *  stays readable. */
  stop: () => void
  /** Called from the editor's activity path so a sprint can attach itself to
   *  the session that opened while it was running. */
  noteActivity: () => void
  isRunning: boolean
}

/** A short, soft two-tone chime built with WebAudio — no asset to ship, no
 *  network, no notification permission. */
function playChime(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const now = ctx.currentTime
    for (const [index, freq] of [523.25, 659.25].entries()) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const at = now + index * 0.18
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(0.14, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.42)
      osc.connect(gain).connect(ctx.destination)
      osc.start(at)
      osc.stop(at + 0.45)
    }
    setTimeout(() => void ctx.close(), 1200)
  } catch {
    // Audio unavailable (no device, blocked context) — the result panel still
    // reports the sprint, so a missing sound is never a lost result.
  }
}

/**
 * The sprint timer.
 *
 * Deliberately shallow: it owns a countdown and one open-sprint record. It
 * never opens, closes, or seals a writing session — the session system keeps
 * doing that from typing activity, and the sprint simply notes which session
 * it happened inside.
 */
export function useSprint(args: UseSprintArgs): SprintController {
  const { projectWordCountRef, activeDocumentIdRef, currentSessionId, chime, onFinished } = args

  const openRef = useRef<OpenSprint | null>(null)
  const [remainingMs, setRemainingMs] = useState<number | null>(null)
  const [targetMinutes, setTargetMinutes] = useState<number | null>(null)
  const chimeRef = useRef(chime)

  useEffect(() => {
    chimeRef.current = chime
  }, [chime])

  const finish = useCallback(
    (completed: boolean) => {
      const open = openRef.current
      if (!open) return
      openRef.current = null
      setRemainingMs(null)
      setTargetMinutes(null)

      const sprint = sealSprint(open, new Date().toISOString(), projectWordCountRef.current, completed)
      void window.api.recordSprint(sprint).then(() => onFinished(sprint))
      if (completed && chimeRef.current) playChime()
    },
    [onFinished, projectWordCountRef]
  )

  const start = useCallback(
    (minutes: number) => {
      const documentId = activeDocumentIdRef.current
      openRef.current = {
        id: crypto.randomUUID(),
        // May be null right now — starting a timer isn't writing. It's filled
        // in by noteActivity as soon as typing opens a session.
        sessionId: currentSessionId(),
        startedAt: new Date().toISOString(),
        targetMinutes: minutes,
        startWordCount: projectWordCountRef.current,
        documentIds: documentId ? [documentId] : []
      }
      setTargetMinutes(minutes)
      setRemainingMs(minutes * 60_000)
    },
    [activeDocumentIdRef, currentSessionId, projectWordCountRef]
  )

  const stop = useCallback(() => finish(false), [finish])

  const noteActivity = useCallback(() => {
    const open = openRef.current
    if (!open) return
    // The session that this sprint belongs to only exists once typing starts.
    if (!open.sessionId) open.sessionId = currentSessionId()
    const documentId = activeDocumentIdRef.current
    if (documentId && !open.documentIds.includes(documentId)) open.documentIds.push(documentId)
  }, [activeDocumentIdRef, currentSessionId])

  // `finish` closes over an inline callback from App and so changes identity on
  // every render. Held in a ref rather than depended on, because App re-renders
  // on every editor transaction: a `finish` dependency tore the interval down
  // and restarted it faster than it could ever fire, freezing the countdown for
  // exactly as long as you were typing.
  const finishRef = useRef(finish)
  useEffect(() => {
    finishRef.current = finish
  }, [finish])

  const running = remainingMs !== null

  // Live only while a sprint runs. Ticks faster than once a second so the end
  // lands promptly, but only re-renders when the displayed second actually
  // changes — the remaining time is derived from the clock, not accumulated
  // from ticks, so a missed tick can never make the countdown drift.
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      const open = openRef.current
      if (!open) return
      const left = open.targetMinutes * 60_000 - (Date.now() - new Date(open.startedAt).getTime())
      if (left <= 0) {
        finishRef.current(true)
        return
      }
      setRemainingMs((prev) =>
        prev !== null && Math.ceil(prev / 1000) === Math.ceil(left / 1000) ? prev : left
      )
    }, 250)
    return () => clearInterval(timer)
  }, [running])

  return { remainingMs, targetMinutes, start, stop, noteActivity, isRunning: remainingMs !== null }
}
