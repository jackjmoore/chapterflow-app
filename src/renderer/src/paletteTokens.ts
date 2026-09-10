import type { PresetPalette } from '../../shared/colorPresets'
import { isDarkHex, shadeHex } from './colorUtils'

/**
 * How a palette becomes a full set of interface tokens.
 *
 * This exists so the Appearance page's theme previews and the app's own
 * palette effects cannot drift: a card that shows a theme is drawn with the
 * same maths that will paint the window when the theme is chosen. If a
 * preview and the real thing disagree, the preview is a lie, and this page's
 * whole argument is that the card *is* the app.
 */

/** The stylesheet's fixed paper, used wherever a variant sets no page. */
export const PAPER = '#faf6ec'

/**
 * Multipliers on the same shift the panel shades use. Borders follow the
 * chosen background rather than staying on the base theme's warm browns: a
 * cool grey palette with warm hairlines reads as two themes at once.
 */
export const BORDER_SHIFT = 3.5
export const BORDER_STRONG_SHIFT = 5

/** The ink a page takes. A dark page cannot carry paper ink. */
export function pageInk(page: string): { text: string; muted: string; dim: string } {
  return isDarkHex(page)
    ? { text: '#d6d0c2', muted: '#948d7d', dim: '#726c60' }
    : { text: '#2b2620', muted: '#6e6656', dim: '#a39c89' }
}

/** Readable ink for a filled accent — the same choice the accent button makes. */
export function accentContrast(accent: string): string {
  return isDarkHex(accent) ? '#f5f1e8' : '#14110c'
}

/**
 * Every token a preview needs, from one palette. The names match the
 * stylesheet's so a preview can be styled with the same declarations the app
 * uses, scoped to the element rather than the document.
 */
export function derivePaletteTokens(palette: PresetPalette): Record<string, string> {
  const background = palette.background
  const dark = isDarkHex(background)
  const shift = dark ? 10 : -10
  const page = palette.page ?? PAPER
  const ink = pageInk(page)
  return {
    '--tp-bg': background,
    '--tp-sidebar': shadeHex(background, shift * 2),
    '--tp-control': shadeHex(background, shift),
    '--tp-border': shadeHex(background, Math.round(shift * BORDER_SHIFT)),
    '--tp-text': palette.text,
    '--tp-text-dim': shadeHex(palette.text, dark ? -45 : 45),
    '--tp-accent': palette.accent,
    '--tp-accent-contrast': accentContrast(palette.accent),
    '--tp-page': page,
    '--tp-surround': shadeHex(page, isDarkHex(page) ? -8 : -18),
    '--tp-ink': ink.text,
    '--tp-ink-muted': ink.muted
  }
}
