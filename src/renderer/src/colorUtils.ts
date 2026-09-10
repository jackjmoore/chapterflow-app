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

/** `#rrggbb`, lower-cased, from anything a person might type into a hex
 *  field — with or without the hash, three or six digits — or null. */
export function normalizeHex(input: string): string | null {
  const clean = input.trim().replace(/^#/, '')
  if (/^[0-9a-f]{6}$/i.test(clean)) return `#${clean.toLowerCase()}`
  if (/^[0-9a-f]{3}$/i.test(clean)) return `#${clean.split('').map((c) => c + c).join('').toLowerCase()}`
  return null
}

export interface Hsl {
  h: number
  s: number
  l: number
}

export function hexToHsl(hex: string): Hsl | null {
  const clean = normalizeHex(hex)
  if (!clean) return null
  const num = parseInt(clean.slice(1), 16)
  const r = (num >> 16) / 255
  const g = ((num >> 8) & 0xff) / 255
  const b = (num & 0xff) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return { h: h / 6, s, l }
}

export function hslToHex(hsl: Hsl): string {
  const { h, s, l } = hsl
  const hue = (p: number, q: number, t: number): number => {
    let x = t
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  let r: number
  let g: number
  let b: number
  if (s === 0) {
    r = g = b = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue(p, q, h + 1 / 3)
    g = hue(p, q, h)
    b = hue(p, q, h - 1 / 3)
  }
  const channel = (v: number): string => Math.round(v * 255).toString(16).padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
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
