import type { Theme } from './preferences'

export interface ColorPreset {
  id: string
  name: string
  theme: Theme
  background: string
  text: string
  accent: string
}

export const COLOR_PRESETS: ColorPreset[] = [
  { id: 'warm-manuscript', name: 'Warm Manuscript', theme: 'light', background: '#EDE6D6', text: '#2B2620', accent: '#5C6E4F' },
  { id: 'northern-light', name: 'Northern Light', theme: 'light', background: '#E9EDEC', text: '#232B2C', accent: '#3D6B7D' },
  { id: 'deep-study', name: 'Deep Study', theme: 'dark', background: '#1C1B19', text: '#DDD6C8', accent: '#9C7A4E' },
  { id: 'slate-draft', name: 'Slate Draft', theme: 'dark', background: '#1A1D21', text: '#C9CFD3', accent: '#6B8CAE' },
  { id: 'terminal-green', name: 'Terminal Green', theme: 'dark', background: '#0E1410', text: '#B8C4B0', accent: '#7A9471' }
]
