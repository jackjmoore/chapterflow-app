import { useEffect, type RefObject } from 'react'

/** Breathing room kept between a flyout and the window edge. */
const MARGIN = 8

/** Matches `.menubar-flyout { top: -5px }` — the resting offset we shift from. */
const RESTING_TOP = -5

/**
 * Keeps a submenu flyout inside the window.
 *
 * Flyouts are revealed by CSS `:hover` and anchored at a fixed `top: -5px;
 * left: 100%`, which is right until the parent item sits near an edge. A long
 * list then runs off the bottom with no way to reach the rest of it — the
 * Story Bible Mentions flyout, which holds every Story Bible entry, was
 * extending 285px past the window on a binder row low in the list, leaving
 * twelve of its sixteen entries unreachable by any gesture.
 *
 * Two moves, in order of preference: slide the flyout up until it fits, and
 * only cap its height (letting it scroll) once it cannot fit anywhere on
 * screen. Sliding preserves the whole list; scrolling is the fallback.
 *
 * Delegated from a container so it covers flyouts that are added, removed or
 * re-rendered without re-binding, and measured on the way in rather than on a
 * timer.
 */
export function useFlyoutFit(rootRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    function fit(event: Event): void {
      const target = event.target as HTMLElement | null
      const parent = target?.closest?.('.menubar-item--parent')
      if (!parent || !root || !root.contains(parent)) return

      const flyout = parent.querySelector<HTMLElement>(':scope > .menubar-flyout')
      const panel = flyout?.firstElementChild as HTMLElement | null
      if (!flyout || !panel) return

      // Measure from a clean slate, or each pass compounds the last one's shift.
      flyout.style.top = ''
      panel.style.maxHeight = ''
      panel.style.overflowY = ''

      // The flyout may still be display:none at this point — a hidden element
      // measures as zero — so force it visible for the measurement and put it
      // back. Nothing paints in between, so there is no flash.
      const restore = flyout.style.display
      flyout.style.display = 'block'
      const anchor = parent.getBoundingClientRect().top + RESTING_TOP
      // Rendered height, not scrollHeight: the Link to Document list already
      // caps itself at 320px in CSS, and measuring its full content would make
      // this hook override that deliberate cap and reopen it full height.
      const wanted = panel.offsetHeight
      flyout.style.display = restore

      const available = window.innerHeight - MARGIN - anchor
      if (wanted <= available) return

      const room = window.innerHeight - 2 * MARGIN
      const height = Math.min(wanted, room)
      const shift = Math.min(anchor - MARGIN, height - available)
      if (shift > 0) flyout.style.top = `${RESTING_TOP - shift}px`
      if (height < wanted) {
        panel.style.maxHeight = `${height}px`
        // Set here rather than in CSS: a permanent overflow would clip any
        // flyout nested inside this one.
        panel.style.overflowY = 'auto'
      }
    }

    root.addEventListener('pointerover', fit)
    return () => root.removeEventListener('pointerover', fit)
  }, [rootRef])
}
