import type { Theme } from './preferences'

/** One mode's worth of a preset: interface colors plus the editor page.
 *  `page` is the manuscript sheet itself — null means the stylesheet's fixed
 *  paper tone, which stays the default wherever a paper page makes sense. */
export interface PresetPalette {
  background: string
  text: string
  accent: string
  /** The editor page (sheet) color, or null for the standard paper tone. */
  page: string | null
}

/**
 * A color preset with a light and a dark variant — one identity, adapted for
 * both modes, so flipping the global Light/Dark switch swaps within the
 * preset rather than abandoning it.
 *
 * Page colors are a deliberate expansion of the old "the page stays paper
 * regardless of interface theme" rule: paper remains the default (page:
 * null) in every variant where paper is the right answer, and only presets
 * whose identity is a non-paper page (a dark study page, the terminal look)
 * set one.
 */
export interface ColorPreset {
  id: string
  name: string
  /** One plain line about who this preset is for. */
  description: string
  variants: Record<Theme, PresetPalette>
}

export const COLOR_PRESETS: ColorPreset[] = [
  {
    id: 'warm-manuscript',
    name: 'Warm Manuscript',
    description: 'Warm neutrals and olive accents; paper page in both modes.',
    variants: {
      light: { background: '#EDE6D6', text: '#2B2620', accent: '#5C6E4F', page: null },
      dark: { background: '#211E17', text: '#DDD6C8', accent: '#7C8E6F', page: null }
    }
  },
  {
    id: 'northern-light',
    name: 'Northern Light',
    description: 'Cool greys and sea-blue accents; paper page in both modes.',
    variants: {
      light: { background: '#E9EDEC', text: '#232B2C', accent: '#3D6B7D', page: null },
      dark: { background: '#191E20', text: '#C9CFD3', accent: '#5D8B9D', page: null }
    }
  },
  {
    id: 'marginalia',
    name: 'Marginalia',
    description: 'Soft parchment neutrals, annotated in faded sepia.',
    variants: {
      light: { background: '#EBE3D8', text: '#2E2822', accent: '#7A6A52', page: '#F5EEE3' },
      dark: { background: '#1C1815', text: '#DCD2C2', accent: '#9A876A', page: '#221E19' }
    }
  },
  {
    id: 'slate-draft',
    name: 'Slate Draft',
    description: 'Blue-grey slate; the dark variant carries a cool dark page.',
    variants: {
      light: { background: '#E6E9ED', text: '#22262B', accent: '#4A6B8C', page: null },
      dark: { background: '#1A1D21', text: '#C9CFD3', accent: '#6B8CAE', page: '#20242A' }
    }
  },
  {
    id: 'terminal-green',
    name: 'Terminal Green',
    description: 'Phosphor on black — the page goes dark with green ink.',
    variants: {
      light: { background: '#E8EDE6', text: '#22301F', accent: '#4A7A41', page: null },
      dark: { background: '#0E1410', text: '#B8C4B0', accent: '#7A9471', page: '#101812' }
    }
  },
  {
    id: 'vellum-copper',
    name: 'Vellum & Copper',
    description: 'Aged vellum with a burnished copper accent.',
    variants: {
      light: { background: '#EFE4CE', text: '#3A2E1F', accent: '#A65D2E', page: '#F7EFDC' },
      dark: { background: '#231B12', text: '#E8D9BC', accent: '#C97A42', page: '#2A2015' }
    }
  },
  {
    id: 'slate-chalk',
    name: 'Slate & Chalk',
    description: 'Chalkboard greys cut with one deliberate stroke of red.',
    variants: {
      light: { background: '#DDE1E0', text: '#20272A', accent: '#B23A2E', page: '#EEF0EF' },
      dark: { background: '#191D1C', text: '#D8DEDB', accent: '#D45A46', page: '#1E2322' }
    }
  },
  // The two below are dark-first by purpose; the schema pairs every preset
  // with a light variant so the global mode switch always has somewhere to
  // land, so each carries a sensible daylight counterpart in the same family.
  {
    id: 'oled-void',
    name: 'OLED Void',
    description: 'True black for OLED power savings — pixels off, brass kept quiet.',
    variants: {
      light: { background: '#ECEAE4', text: '#2A261F', accent: '#8A6F4E', page: '#F7F5EF' },
      dark: { background: '#000000', text: '#C4BEB0', accent: '#8A6F4E', page: '#050503' }
    }
  },
  {
    id: 'amber-hour',
    name: 'Amber Hour',
    description: 'Warm-shifted dark for late nights — low blue light, easy on tired eyes.',
    variants: {
      light: { background: '#EFE8DC', text: '#33291D', accent: '#A05F2E', page: '#F8F2E7' },
      dark: { background: '#1A1512', text: '#D6C8AE', accent: '#B8794A', page: '#100D0A' }
    }
  }
]
