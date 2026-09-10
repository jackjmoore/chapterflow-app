import type { Theme } from './preferences'

/** A saved combination of theme, zoom, distraction-free state, and default
 *  font — distinct from a single color theme, this captures the whole
 *  writing-environment configuration at once so it can be switched back to
 *  in one click from the View menu. */
export interface LayoutPreset {
  id: string
  name: string
  theme: Theme
  /** Written by presets saved before True Black was retired as an option
   *  (September 2026). Read by nothing; OLED Void is the theme for that. */
  trueBlack?: boolean
  accentColor: string | null
  backgroundColor: string | null
  textColor: string | null
  zoomPercent: number
  distractionFree: boolean
  defaultFontFamily: string | null
  /** Optional (older presets predate them): the active color preset and the
   *  custom page color, captured so applying a layout preset restores the
   *  whole color state rather than half of it. */
  colorPresetId?: string | null
  pageBackgroundColor?: string | null
}
