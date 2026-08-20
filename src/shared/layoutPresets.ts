import type { Theme } from './preferences'

/** A saved combination of theme, zoom, distraction-free state, and default
 *  font — distinct from a single color theme, this captures the whole
 *  writing-environment configuration at once so it can be switched back to
 *  in one click from the View menu. */
export interface LayoutPreset {
  id: string
  name: string
  theme: Theme
  trueBlack: boolean
  accentColor: string | null
  backgroundColor: string | null
  textColor: string | null
  zoomPercent: number
  distractionFree: boolean
  defaultFontFamily: string | null
}
