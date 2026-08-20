/** Lightens (positive amount) or darkens (negative) a hex color by shifting each
 *  RGB channel, clamped to [0,255] — used to derive elevated/sidebar panel
 *  shades from a single custom background color so there's still some visual
 *  hierarchy between surfaces, rather than everything being one flat color. */
export function shadeHex(hex: string, amount: number): string {
  const clean = hex.replace('#', '')
  const num = parseInt(clean, 16)
  if (Number.isNaN(num)) return hex
  const r = Math.min(255, Math.max(0, (num >> 16) + amount))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount))
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount))
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

/** True if a hex color is closer to black than white — used to decide
 *  whether a custom background should shift its derived panel shades
 *  lighter or darker to read as "elevated." */
export function isDarkHex(hex: string): boolean {
  const clean = hex.replace('#', '')
  const num = parseInt(clean, 16)
  if (Number.isNaN(num)) return false
  const r = num >> 16
  const g = (num >> 8) & 0xff
  const b = num & 0xff
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance < 0.5
}
