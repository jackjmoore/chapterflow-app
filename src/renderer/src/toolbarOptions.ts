export const STYLE_OPTIONS = [
  { value: 'paragraph', label: 'Normal text' },
  { value: 'h1', label: 'Heading 1' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' },
  { value: 'blockquote', label: 'Block quote' }
] as const

export type StyleValue = (typeof STYLE_OPTIONS)[number]['value']

export interface FontOption {
  label: string
  value: string
}

export interface FontGroup {
  label: string
  fonts: readonly FontOption[]
}

/**
 * Typefaces that ship inside the app (see fonts.ts), so they render the same
 * on every machine and in the compiled PDF. All Open Font License. Chosen
 * for how they read at the sizes the editor and the page actually use — 12pt
 * on paper, 16px on screen — which rules out the display and calligraphic
 * faces that look handsome in a specimen and thin out in a paragraph.
 */
export const BUNDLED_FONTS: readonly FontOption[] = [
  { label: 'Alegreya', value: "'Alegreya', Georgia, serif" },
  { label: 'Atkinson Hyperlegible', value: "'Atkinson Hyperlegible', Arial, sans-serif" },
  { label: 'Courier Prime', value: "'Courier Prime', 'Courier New', monospace" },
  { label: 'Crimson Pro', value: "'Crimson Pro', Georgia, serif" },
  { label: 'EB Garamond', value: "'EB Garamond', Garamond, serif" },
  { label: 'Libre Baskerville', value: "'Libre Baskerville', Baskerville, Georgia, serif" },
  { label: 'Libre Caslon Text', value: "'Libre Caslon Text', Georgia, serif" },
  { label: 'Literata', value: "'Literata', Georgia, serif" },
  { label: 'Lora', value: "'Lora', Georgia, serif" },
  { label: 'Merriweather', value: "'Merriweather', Georgia, serif" },
  { label: 'OpenDyslexic', value: "'OpenDyslexic', Verdana, sans-serif" },
  { label: 'Source Sans 3', value: "'Source Sans 3', 'Segoe UI', sans-serif" },
  { label: 'Source Serif 4', value: "'Source Serif 4', Georgia, serif" },
  { label: 'Spectral', value: "'Spectral', Georgia, serif" },
  { label: 'Vollkorn', value: "'Vollkorn', Georgia, serif" }
]

/** Fonts the operating system may provide. Rendered only where installed;
 *  a machine without one falls back along the stack. */
export const SYSTEM_FONTS: readonly FontOption[] = [
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Calibri', value: 'Calibri, sans-serif' },
  { label: 'Cambria', value: 'Cambria, serif' },
  { label: 'Century Gothic', value: '"Century Gothic", sans-serif' },
  { label: 'Comic Sans MS', value: '"Comic Sans MS", cursive' },
  { label: 'Consolas', value: 'Consolas, monospace' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Garamond', value: 'Garamond, serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Impact', value: 'Impact, sans-serif' },
  { label: 'Lucida Console', value: '"Lucida Console", monospace' },
  { label: 'Palatino', value: '"Palatino Linotype", Palatino, serif' },
  { label: 'Segoe UI', value: '"Segoe UI", sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' }
]

/** The font picker's sections, in display order. */
export const FONT_GROUPS: readonly FontGroup[] = [
  { label: 'Bundled with ChapterFlow', fonts: BUNDLED_FONTS },
  { label: 'Installed on this computer', fonts: SYSTEM_FONTS }
]

/** Every selectable font, flat, for lookups by value. */
export const FONT_FAMILIES: readonly FontOption[] = [...BUNDLED_FONTS, ...SYSTEM_FONTS]

export const FONT_SIZES_PT = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72
] as const

export const DEFAULT_FONT_SIZE_PT = 12

export const LINE_HEIGHTS = [
  { label: 'Single', value: '1' },
  { label: '1.15', value: '1.15' },
  { label: '1.5', value: '1.5' },
  { label: 'Double', value: '2' }
] as const
