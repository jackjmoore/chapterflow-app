export type Theme = 'light' | 'dark'

export const MIN_SIDEBAR_WIDTH = 180
export const MAX_SIDEBAR_WIDTH = 480
export const DEFAULT_SIDEBAR_WIDTH = 260

export const DEFAULT_ACCENT_COLOR = null

export const MIN_ZOOM_PERCENT = 50
export const MAX_ZOOM_PERCENT = 200
export const ZOOM_STEP_PERCENT = 10
export const DEFAULT_ZOOM_PERCENT = 100

// Corkboard card size — a display preference (like zoom), so it's global
// rather than per-project.
export const MIN_CARD_WIDTH = 160
export const MAX_CARD_WIDTH = 320
export const CARD_WIDTH_STEP = 20
export const DEFAULT_CARD_WIDTH = 220

export interface TypographyDefaults {
  fontFamily: string | null
  fontSizePt: number | null
  lineHeight: string | null
}

export const DEFAULT_TYPOGRAPHY: TypographyDefaults = {
  fontFamily: null,
  fontSizePt: null,
  lineHeight: null
}

// Page size — a shared setting (like zoom/card width), not local to the page
// preview: it's meant to also drive PDF/print export later, so it lives here
// globally rather than per-project.
export type PageSize = 'letter' | 'a4' | 'a5' | 'trade6x9' | 'legal'
export const DEFAULT_PAGE_SIZE: PageSize = 'a4'

/**
 * The one place any part of the app learns how big a page is.
 *
 * Page Setup, the paginated page view, PDF/print, and .docx export all read
 * these millimetres — nothing derives its own dimensions, and nothing passes
 * a page *name* to a renderer that would then apply its own idea of the size.
 * Adding a size here is all that is required for every one of those paths to
 * support it.
 */
export const PAGE_DIMENSIONS_MM: Record<PageSize, { widthMm: number; heightMm: number }> = {
  letter: { widthMm: 215.9, heightMm: 279.4 },
  a4: { widthMm: 210, heightMm: 297 },
  a5: { widthMm: 148, heightMm: 210 },
  // 6 × 9 inches — the common paperback trim size.
  trade6x9: { widthMm: 152.4, heightMm: 228.6 },
  legal: { widthMm: 215.9, heightMm: 355.6 }
}

/** Order and labels for the Page Setup picker, kept beside the dimensions so
 *  a new size cannot be added to one without the other. */
export const PAGE_SIZE_OPTIONS: { id: PageSize; label: string }[] = [
  { id: 'a4', label: 'A4 (210 × 297 mm)' },
  { id: 'letter', label: 'US Letter (8.5 × 11 in)' },
  { id: 'legal', label: 'US Legal (8.5 × 14 in)' },
  { id: 'a5', label: 'A5 (148 × 210 mm)' },
  { id: 'trade6x9', label: 'US Trade (6 × 9 in)' }
]

export function isPageSize(value: unknown): value is PageSize {
  return typeof value === 'string' && value in PAGE_DIMENSIONS_MM
}

export const MIN_PAGE_MARGIN_MM = 10
export const MAX_PAGE_MARGIN_MM = 50
export const PAGE_MARGIN_STEP_MM = 5
export const DEFAULT_PAGE_MARGIN_MM = 25
