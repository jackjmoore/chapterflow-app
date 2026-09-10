import type { ColorPreset, PresetPalette } from './colorPresets'
import type { Theme } from './preferences'

/**
 * A theme the writer made: the same four colours per mode that a preset
 * carries, kept under a name they chose. Nothing more — panels, hairlines
 * and hover fills are derived from these exactly as they are for a preset,
 * so a custom theme cannot reach a surface a preset cannot.
 */
export interface CustomTheme {
  id: string
  name: string
  /** The preset (or custom theme) it began as a copy of, by name, for the
   *  card's own one-line description. Null when it began from the colours
   *  the window happened to be wearing. */
  startedFrom: string | null
  variants: Record<Theme, PresetPalette>
}

/** Custom theme ids share the preset id space (colorPresetId points at
 *  either), so they carry a prefix no preset uses. */
export const CUSTOM_THEME_PREFIX = 'custom-'

export function isCustomThemeId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(CUSTOM_THEME_PREFIX)
}

/** The shape the theme wall and the palette effects already understand. */
export function customThemeAsPreset(theme: CustomTheme): ColorPreset {
  return {
    id: theme.id,
    name: theme.name,
    description: theme.startedFrom ? `Yours, started from ${theme.startedFrom}.` : 'Yours.',
    variants: theme.variants
  }
}

const HEX = /^#[0-9a-f]{6}$/i

function isPalette(value: unknown): value is PresetPalette {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return (
    typeof p.background === 'string' && HEX.test(p.background) &&
    typeof p.text === 'string' && HEX.test(p.text) &&
    typeof p.accent === 'string' && HEX.test(p.accent) &&
    (p.page === null || (typeof p.page === 'string' && HEX.test(p.page)))
  )
}

/** Accepts only what the store can safely paint from. */
export function isCustomTheme(value: unknown): value is CustomTheme {
  if (!value || typeof value !== 'object') return false
  const t = value as Record<string, unknown>
  const variants = t.variants as Record<string, unknown> | undefined
  return (
    typeof t.id === 'string' && isCustomThemeId(t.id) &&
    typeof t.name === 'string' &&
    (t.startedFrom === null || typeof t.startedFrom === 'string') &&
    !!variants && isPalette(variants.light) && isPalette(variants.dark)
  )
}
