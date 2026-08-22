import { useEffect, useRef, useState } from 'react'

/**
 * Keeps a value mounted for a brief fade-out after it goes null, instead of
 * disappearing the instant its owner clears state.
 *
 * Built for hover-triggered popovers (the Story Bible cards, the binder's
 * flyout) which are conditionally rendered — `{value && <Card />}` — so a
 * parent clearing its state unmounts the child immediately and gives a CSS
 * transition no time to run. This holds the last non-null value while
 * `visible` flips to false, then drops it after `durationMs`.
 *
 * Mounting is never delayed: entering sets the new value and mounts on the
 * same tick, so the element exists in the DOM at once — only its opacity
 * ramps in, over one animation frame, which is what lets the CSS transition
 * animate from 0 rather than starting already at 1.
 *
 * Respects prefers-reduced-motion itself, in JS, not only via CSS. The global
 * stylesheet already collapses transition-duration to ~0 under that setting,
 * which would make the fade invisible either way — but this hook would still
 * hold the element mounted (hoverable, in the accessibility tree) for the
 * full duration after logical close if it only relied on that. Checking here
 * means reduced motion gets the exact prior behaviour: synchronous mount and
 * unmount, nothing lingering.
 */
export function useFadePresence<T>(value: T | null, durationMs: number): { rendered: T | null; visible: boolean } {
  const [rendered, setRendered] = useState<T | null>(value)
  const [visible, setVisible] = useState<boolean>(value !== null)
  const unmountTimer = useRef<number | null>(null)
  const reducedMotion = useRef(
    typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false
  )

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (): void => {
      reducedMotion.current = query.matches
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (unmountTimer.current !== null) {
      window.clearTimeout(unmountTimer.current)
      unmountTimer.current = null
    }

    if (value !== null) {
      setRendered(value)
      if (reducedMotion.current) {
        setVisible(true)
        return
      }
      // Force one frame at opacity 0 before flipping to 1, so the browser has
      // something to transition from rather than painting already-visible.
      setVisible(false)
      const frame = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(frame)
    }

    if (reducedMotion.current) {
      setRendered(null)
      setVisible(false)
      return
    }
    setVisible(false)
    unmountTimer.current = window.setTimeout(() => {
      setRendered(null)
      unmountTimer.current = null
    }, durationMs)
    return () => {
      if (unmountTimer.current !== null) {
        window.clearTimeout(unmountTimer.current)
        unmountTimer.current = null
      }
    }
  }, [value, durationMs])

  return { rendered, visible }
}
