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
export type PageSize = 'letter' | 'a4'
export const DEFAULT_PAGE_SIZE: PageSize = 'a4'

export const PAGE_DIMENSIONS_MM: Record<PageSize, { widthMm: number; heightMm: number }> = {
  letter: { widthMm: 215.9, heightMm: 279.4 },
  a4: { widthMm: 210, heightMm: 297 }
}

export const MIN_PAGE_MARGIN_MM = 10
export const MAX_PAGE_MARGIN_MM = 50
export const PAGE_MARGIN_STEP_MM = 5
export const DEFAULT_PAGE_MARGIN_MM = 25
