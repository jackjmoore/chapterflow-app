import { useCallback, useEffect, useRef } from 'react'
import type { OpenSession } from '../../shared/sessions'

/** How often the idle check and the crash-safety checkpoint run. Deliberately
 *  slow: it is a wall-clock check, not a typing-path concern, and a session
 *  boundary is never more precise than the idle gap anyway. */
const TICK_MS = 30_000

interface UseWritingSessionArgs {
  /** Minutes of no typing that ends a session. */
  idleGapMinutes: number
  /** The live project-wide word count — the same value the footer shows,
   *  derived from countWords(). Read through a ref so the hook never needs to
   *  re-subscribe as it changes. */
  projectWordCountRef: React.MutableRefObject<number>
  activeDocumentIdRef: React.MutableRefObject<string | null>
  /** Called after a session is sealed, so views can refresh. */
  onSessionClosed: () => void
}

export interface WritingSessionController {
  /**
   * Marks writing activity. Called straight from the editor's onUpdate, so it
   * must stay O(1) with no serialization: it writes two refs and, only on the
   * first edit after an idle gap, opens a session. Nothing here touches the
   * document, the word counter, or any save timer.
   */
  noteActivity: () => void
  /** Seals any in-progress session — used on quit. */
  flush: () => Promise<void>
  /**
   * The id of the session currently in progress, or null when idle. This is
   * what a sprint stores as its `sessionId` — the sprint attaches itself to
   * the session it happened inside rather than creating one.
   */
  currentSessionId: () => string | null
  /** Documents edited in the session so far, for a sprint to intersect with. */
  currentDocumentIds: () => string[]
}

/**
 * Idle-gap session detection.
 *
 * Runs entirely off a single slow interval plus one ref write per edit. It
 * shares no timer with autosave, the word-count debounce, the page-count
 * debounce, or the mention scan — starting or ending a session cannot delay a
 * save, and typing cannot be slowed by session bookkeeping.
 */
export function useWritingSession(args: UseWritingSessionArgs): WritingSessionController {
  const { idleGapMinutes, projectWordCountRef, activeDocumentIdRef, onSessionClosed } = args

  const openRef = useRef<OpenSession | null>(null)
  const idleGapRef = useRef(idleGapMinutes)
  const dirtyRef = useRef(false)

  useEffect(() => {
    idleGapRef.current = idleGapMinutes
  }, [idleGapMinutes])

  const closeOpenSession = useCallback(async () => {
    const open = openRef.current
    if (!open) return
    openRef.current = null
    dirtyRef.current = false
    // Re-read the settled count before sealing. noteActivity records it at the
    // instant of each keystroke, when the 200ms word-count debounce has not yet
    // caught up, so the tail of the final burst was being lost — a fast
    // 10-word flourish landed as 6. Nothing can have edited since the last
    // activity (every edit path routes through noteActivity), so the current
    // value is exactly the count as of that last edit, fully settled.
    open.lastWordCount = projectWordCountRef.current
    const sealed = await window.api.closeSession(open)
    if (sealed) onSessionClosed()
  }, [onSessionClosed, projectWordCountRef])

  const noteActivity = useCallback(() => {
    const now = new Date().toISOString()
    const documentId = activeDocumentIdRef.current
    const open = openRef.current

    if (!open) {
      // First edit after an idle gap: the count *before* this burst is the
      // session's starting point. projectWordCount is debounced by 200ms, so
      // at this instant it still reflects the pre-keystroke document — which
      // is exactly the baseline wanted.
      openRef.current = {
        id: crypto.randomUUID(),
        startedAt: now,
        lastActivityAt: now,
        startWordCount: projectWordCountRef.current,
        lastWordCount: projectWordCountRef.current,
        documentIds: documentId ? [documentId] : []
      }
      dirtyRef.current = true
      return
    }

    open.lastActivityAt = now
    open.lastWordCount = projectWordCountRef.current
    if (documentId && !open.documentIds.includes(documentId)) open.documentIds.push(documentId)
    dirtyRef.current = true
  }, [activeDocumentIdRef, projectWordCountRef])

  useEffect(() => {
    // Recover a session left open by a crash or force-quit before starting a
    // new one, so its writing time isn't silently lost.
    void window.api.recoverOpenSession().then((recovered) => {
      if (recovered) onSessionClosed()
    })

    const timer = setInterval(() => {
      const open = openRef.current
      if (!open) return
      const idleMs = Date.now() - new Date(open.lastActivityAt).getTime()
      if (idleMs >= idleGapRef.current * 60_000) {
        void closeOpenSession()
        return
      }
      // Crash safety: persist the in-progress session, but only when something
      // actually changed since the last checkpoint. The count is refreshed
      // here for the same reason it is on close — so a crash-recovered session
      // carries the settled figure rather than a debounce-stale one.
      if (dirtyRef.current) {
        dirtyRef.current = false
        open.lastWordCount = projectWordCountRef.current
        void window.api.checkpointSession(open)
      }
    }, TICK_MS)

    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentSessionId = useCallback(() => openRef.current?.id ?? null, [])
  const currentDocumentIds = useCallback(() => openRef.current?.documentIds ?? [], [])

  return { noteActivity, flush: closeOpenSession, currentSessionId, currentDocumentIds }
}
