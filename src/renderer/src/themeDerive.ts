import type { PresetPalette } from '../../shared/colorPresets'
import type { Theme } from '../../shared/preferences'
import { hexToHsl, hslToHex } from './colorUtils'

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/**
 * The other mode's four colours, made from these four.
 *
 * A custom theme is asked for once, in whichever mode the writer was in, and
 * the app still has to have somewhere to land when the Light/Dark switch is
 * flipped. So the counterpart keeps each colour's hue and takes it to the
 * lightness that mode needs: backgrounds go deep and desaturated, text goes
 * pale, the accent is lifted (or lowered) just enough to read on the new
 * ground, and a page that was set keeps its tint at the new depth. Paper
 * stays paper — a theme that left the page blank in one mode leaves it blank
 * in the other, the way Warm Manuscript does. The result is a starting
 * point the writer can adjust in that mode, not a second design.
 */
export function deriveCounterpart(palette: PresetPalette, target: Theme): PresetPalette {
  const to = (hex: string, lightness: number, maxSaturation: number): string => {
    const hsl = hexToHsl(hex)
    if (!hsl) return hex
    return hslToHex({ h: hsl.h, s: Math.min(hsl.s, maxSaturation), l: lightness })
  }
  const accent = hexToHsl(palette.accent)
  if (target === 'dark') {
    return {
      background: to(palette.background, 0.11, 0.25),
      text: to(palette.text, 0.84, 0.2),
      accent: accent ? hslToHex({ ...accent, l: clamp(accent.l + 0.18, 0.5, 0.7) }) : palette.accent,
      page: palette.page ? to(palette.page, 0.13, 0.2) : null
    }
  }
  return {
    background: to(palette.background, 0.91, 0.25),
    text: to(palette.text, 0.15, 0.3),
    accent: accent ? hslToHex({ ...accent, l: clamp(accent.l - 0.15, 0.3, 0.45) }) : palette.accent,
    page: palette.page ? to(palette.page, 0.95, 0.3) : null
  }
}
