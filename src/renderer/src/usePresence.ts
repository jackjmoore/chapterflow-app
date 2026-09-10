import { useEffect, useRef, useState } from 'react'

/**
 * The one presence mechanism behind every panel, disclosure and view switch
 * in the app.
 *
 * The problem it exists to solve: nearly everything that collapses or switches
 * here was written as `{open && <Panel />}`. A conditionally rendered element
 * is gone from the DOM the instant its owner clears state, so a CSS transition
 * has no "before" state to run from and never plays at all — which is why
 * styling alone could never make these animate. This holds the last non-null
 * value mounted while `visible` flips to false, then drops it once the exit
 * transition has had time to finish.
 *
 * Mounting is never delayed: entering sets the value and mounts on the same
 * tick, so the element exists at once and only its opacity/transform ramp in,
 * over one animation frame. That frame is what lets the transition animate
 * from 0 rather than painting already-arrived.
 *
 * Durations come from the stylesheet (--motion-enter-ms / --motion-exit-ms),
 * read once here, so the timing lives in exactly one place. See the
 * .motion-presence rules in index.css, which own the matching transitions.
 * Exit is deliberately quicker than enter: closing should feel like it gets
 * out of the way, opening like it arrives.
 *
 * Respects prefers-reduced-motion itself, in JS, not only via CSS. The global
 * stylesheet already collapses transition-duration to ~0 under that setting,
 * which would make the motion invisible either way — but this hook would still
 * hold the element mounted (hoverable, in the accessibility tree) for the full
 * duration after logical close if it only relied on that. Checking here means
 * reduced motion gets exactly the prior behaviour: synchronous mount and
 * unmount, nothing lingering.
 */

/** Fallbacks only — the real numbers live on :root in index.css and are read
 *  from there at first use. These stand in for the one render before the
 *  stylesheet is readable, and for the non-DOM hosts the test suites use. */
const FALLBACK_ENTER_MS = 180
const FALLBACK_EXIT_MS = 150

/**
 * How long to wait for the entrance frame before flipping to the shown state
 * anyway. Long enough that requestAnimationFrame (~16ms) wins in a normal
 * foreground window, so the transition still has its "before" frame to animate
 * from; short enough that nothing is left waiting if it does not.
 */
const SHOW_FALLBACK_MS = 50

let cachedDurations: { enter: number; exit: number } | null = null

function readDurations(): { enter: number; exit: number } {
  if (cachedDurations) return cachedDurations
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { enter: FALLBACK_ENTER_MS, exit: FALLBACK_EXIT_MS }
  }
  const root = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: number): number => {
    const parsed = Number.parseFloat(root.getPropertyValue(name))
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
  }
  cachedDurations = {
    enter: read('--motion-enter-ms', FALLBACK_ENTER_MS),
    exit: read('--motion-exit-ms', FALLBACK_EXIT_MS)
  }
  return cachedDurations
}

/**
 * Flips to the shown state on the next frame — but never *only* on the next
 * frame.
 *
 * requestAnimationFrame does not run at all while the window is minimised or
 * occluded, and Electron leaves backgroundThrottling on. This is the only path
 * that sets `visible` back to true, so a single dropped callback used to strand
 * the element at opacity 0 permanently — and since .view-pane wraps every pane,
 * that took the toolbar and the editor with it until some later state change
 * happened to re-run the effect. The timer is the guarantee; the frame is what
 * normally wins and is what gives the transition something to animate from.
 *
 * Returns a canceller, because the caller must be able to drop a pending flip
 * when the value changes underneath it.
 */
function scheduleShow(show: () => void): () => void {
  let settled = false
  const run = (): void => {
    if (settled) return
    settled = true
    show()
  }
  const frame = requestAnimationFrame(run)
  const timer = window.setTimeout(run, SHOW_FALLBACK_MS)
  return () => {
    settled = true
    cancelAnimationFrame(frame)
    window.clearTimeout(timer)
  }
}

/** How a change from one non-null value straight to another is handled.
 *
 *  'cut' — swap the content immediately and re-run the entrance. Right for
 *  things that track a moving pointer, where the two states are the same
 *  surface showing different content: the hover cards would otherwise blank
 *  out between two adjacent mentions.
 *
 *  'sequential' — let the outgoing value finish its exit, then mount the
 *  incoming one and play its entrance. Right for switching between panes that
 *  are genuinely different places, where an overlap or a hard cut both read as
 *  a glitch rather than a move. */
export type PresenceSwap = 'cut' | 'sequential'

export interface Presence<T> {
  /** What to render — the incoming value, or the outgoing one still exiting. */
  rendered: T | null
  /** Drives the `is-in` class. False for one frame on entry, and for the whole
   *  exit, so the CSS has something to transition between. */
  visible: boolean
}

export function usePresence<T>(value: T | null, swap: PresenceSwap = 'cut'): Presence<T> {
  const [rendered, setRendered] = useState<T | null>(value)
  const [visible, setVisible] = useState<boolean>(value !== null)
  const timerRef = useRef<number | null>(null)
  /** Cancels a pending entrance flip (frame + its fallback timer). */
  const showCancelRef = useRef<(() => void) | null>(null)
  const renderedRef = useRef<T | null>(value)
  const reducedMotion = useRef(
    typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false
  )

  useEffect(() => {
    renderedRef.current = rendered
  }, [rendered])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (): void => {
      reducedMotion.current = query.matches
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const { exit } = readDurations()

    // Anything still pending from the previous value is void now — including
    // an entrance flip scheduled from inside a timeout that has already fired,
    // which the effect's own cleanup cannot reach.
    const clearPending = (): void => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (showCancelRef.current !== null) {
        showCancelRef.current()
        showCancelRef.current = null
      }
    }
    clearPending()

    // Reduced motion: mount and unmount synchronously, no holding.
    if (reducedMotion.current) {
      setRendered(value)
      setVisible(value !== null)
      return
    }

    if (value === null) {
      setVisible(false)
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        setRendered(null)
      }, exit)
      return clearPending
    }

    // Replacing one shown value with another, sequentially: hold the outgoing
    // one at visible:false for its exit, and only then bring the new one in.
    const replacing = renderedRef.current !== null && renderedRef.current !== value
    if (swap === 'sequential' && replacing) {
      setVisible(false)
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        setRendered(value)
        setVisible(false)
        showCancelRef.current = scheduleShow(() => {
          showCancelRef.current = null
          setVisible(true)
        })
      }, exit)
      return clearPending
    }

    // Entering (or a hard cut): mount now, hold one frame at the "before"
    // state, then flip — otherwise the browser paints the arrived state
    // directly and there is nothing to transition from.
    setRendered(value)
    setVisible(false)
    showCancelRef.current = scheduleShow(() => {
      showCancelRef.current = null
      setVisible(true)
    })
    return clearPending
  }, [value, swap])

  return { rendered, visible }
}

/** The class pair every presence-animated element wears. `variant` picks how
 *  it moves: 'fade' is opacity only (for anything that already carries a
 *  layout transform of its own, which a motion transform would clobber),
 *  'rise' adds a short upward settle for disclosures and panes. */
export function presenceClass(visible: boolean, variant: 'fade' | 'rise' = 'rise'): string {
  return `motion-presence motion-presence--${variant}${visible ? ' is-in' : ''}`
}
