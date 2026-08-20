import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { atomicWrite } from './atomicWrite'
import { getDefaultProjectRoot } from './projectRoot'
import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  MIN_ZOOM_PERCENT,
  MAX_ZOOM_PERCENT,
  DEFAULT_ZOOM_PERCENT,
  MIN_CARD_WIDTH,
  MAX_CARD_WIDTH,
  DEFAULT_CARD_WIDTH,
  MIN_PAGE_MARGIN_MM,
  MAX_PAGE_MARGIN_MM,
  DEFAULT_PAGE_MARGIN_MM,
  DEFAULT_PAGE_SIZE,
  type Theme,
  type TypographyDefaults,
  type PageSize
} from '../shared/preferences'
import type { ToolbarSectionId } from '../shared/toolbarSections'
import type { LayoutPreset } from '../shared/layoutPresets'
import {
  DEFAULT_IDLE_GAP_MINUTES,
  MIN_IDLE_GAP_MINUTES,
  MAX_IDLE_GAP_MINUTES
} from '../shared/sessions'

// Preferences are interface-level and app-wide — they live in Electron's
// userData directory, independent of any single project, so they survive
// switching between projects via Open Project. (Older versions of the app
// stored this file inside the default project folder itself; load() migrates
// it once on first run under the new location, below.)
const prefsPath = join(app.getPath('userData'), 'preferences.json')
const legacyPrefsPath = join(getDefaultProjectRoot(), 'preferences.json')

interface Preferences {
  theme: Theme
  sidebarWidth: number
  /** Whether the side panel is hidden. Interface-level and app-wide, sitting
   *  with sidebarWidth rather than in a project's viewState: both describe the
   *  panel's geometry, and neither is a property of the manuscript. */
  sidebarCollapsed: boolean
  /** Minutes of no typing that ends a writing session. App-wide behaviour,
   *  so it sits here rather than per-project. */
  idleGapMinutes: number
  /** Dim the app's chrome while a sprint runs. Off by default — opt in. */
  sprintSoftLockout: boolean
  /** Play a short tone when a sprint completes. */
  sprintChime: boolean
  /** Read-aloud rate and chosen OS voice. Interface-level, app-wide. */
  speechRate: number
  speechVoiceUri: string | null
  accentColor: string | null
  backgroundColor: string | null
  textColor: string | null
  trueBlack: boolean
  zoomPercent: number
  defaultTypography: TypographyDefaults
  hiddenToolbarSections: ToolbarSectionId[]
  layoutPresets: LayoutPreset[]
  projectRoot: string | null
  cardWidth: number
  pageSize: PageSize
  pageMarginMm: number
}

function clampSidebarWidth(width: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width))
}

function clampIdleGap(minutes: number): number {
  return Math.min(MAX_IDLE_GAP_MINUTES, Math.max(MIN_IDLE_GAP_MINUTES, Math.round(minutes)))
}

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, zoom))
}

function clampCardWidth(width: number): number {
  return Math.min(MAX_CARD_WIDTH, Math.max(MIN_CARD_WIDTH, width))
}

function clampPageMargin(mm: number): number {
  return Math.min(MAX_PAGE_MARGIN_MM, Math.max(MIN_PAGE_MARGIN_MM, mm))
}

let state: Preferences = {
  theme: 'dark',
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  sidebarCollapsed: false,
  idleGapMinutes: DEFAULT_IDLE_GAP_MINUTES,
  sprintSoftLockout: false,
  sprintChime: true,
  speechRate: 0.95,
  speechVoiceUri: null,
  accentColor: null,
  backgroundColor: null,
  textColor: null,
  trueBlack: false,
  zoomPercent: DEFAULT_ZOOM_PERCENT,
  defaultTypography: { fontFamily: null, fontSizePt: null, lineHeight: null },
  hiddenToolbarSections: [],
  layoutPresets: [],
  projectRoot: null,
  cardWidth: DEFAULT_CARD_WIDTH,
  pageSize: DEFAULT_PAGE_SIZE,
  pageMarginMm: DEFAULT_PAGE_MARGIN_MM
}
let loaded = false

function applyParsed(parsed: Record<string, unknown>): void {
  if (parsed.theme === 'light' || parsed.theme === 'dark') state.theme = parsed.theme
  if (typeof parsed.sidebarWidth === 'number') state.sidebarWidth = clampSidebarWidth(parsed.sidebarWidth)
  if (typeof parsed.sidebarCollapsed === 'boolean') state.sidebarCollapsed = parsed.sidebarCollapsed
  if (typeof parsed.idleGapMinutes === 'number') state.idleGapMinutes = clampIdleGap(parsed.idleGapMinutes)
  if (typeof parsed.sprintSoftLockout === 'boolean') state.sprintSoftLockout = parsed.sprintSoftLockout
  if (typeof parsed.sprintChime === 'boolean') state.sprintChime = parsed.sprintChime
  if (typeof parsed.speechRate === 'number') state.speechRate = Math.min(2, Math.max(0.5, parsed.speechRate))
  if (typeof parsed.speechVoiceUri === 'string' || parsed.speechVoiceUri === null) {
    state.speechVoiceUri = parsed.speechVoiceUri as string | null
  }
  if (typeof parsed.accentColor === 'string' || parsed.accentColor === null) {
    state.accentColor = parsed.accentColor as string | null
  }
  if (typeof parsed.backgroundColor === 'string' || parsed.backgroundColor === null) {
    state.backgroundColor = parsed.backgroundColor as string | null
  }
  if (typeof parsed.textColor === 'string' || parsed.textColor === null) {
    state.textColor = parsed.textColor as string | null
  }
  if (typeof parsed.trueBlack === 'boolean') state.trueBlack = parsed.trueBlack
  if (typeof parsed.zoomPercent === 'number') state.zoomPercent = clampZoom(parsed.zoomPercent)
  if (parsed.defaultTypography && typeof parsed.defaultTypography === 'object') {
    const t = parsed.defaultTypography as Record<string, unknown>
    state.defaultTypography = {
      fontFamily: typeof t.fontFamily === 'string' ? t.fontFamily : null,
      fontSizePt: typeof t.fontSizePt === 'number' ? t.fontSizePt : null,
      lineHeight: typeof t.lineHeight === 'string' ? t.lineHeight : null
    }
  }
  if (Array.isArray(parsed.hiddenToolbarSections)) {
    state.hiddenToolbarSections = parsed.hiddenToolbarSections.filter(
      (s): s is ToolbarSectionId => typeof s === 'string'
    )
  }
  if (Array.isArray(parsed.layoutPresets)) {
    state.layoutPresets = parsed.layoutPresets as LayoutPreset[]
  }
  if (typeof parsed.projectRoot === 'string' || parsed.projectRoot === null) {
    state.projectRoot = parsed.projectRoot as string | null
  }
  if (typeof parsed.cardWidth === 'number') state.cardWidth = clampCardWidth(parsed.cardWidth)
  if (parsed.pageSize === 'letter' || parsed.pageSize === 'a4') state.pageSize = parsed.pageSize
  if (typeof parsed.pageMarginMm === 'number') state.pageMarginMm = clampPageMargin(parsed.pageMarginMm)
}

async function load(): Promise<void> {
  if (loaded) return
  loaded = true

  if (existsSync(prefsPath)) {
    try {
      applyParsed(JSON.parse(await readFile(prefsPath, 'utf-8')))
    } catch {
      // corrupt or unreadable — fall back to the default rather than crash
    }
    return
  }

  // One-time migration from the old per-project location.
  if (existsSync(legacyPrefsPath)) {
    try {
      applyParsed(JSON.parse(await readFile(legacyPrefsPath, 'utf-8')))
      await persist()
    } catch {
      // corrupt legacy file — nothing to migrate, start fresh
    }
  }
}

function persist(): Promise<void> {
  return atomicWrite(prefsPath, JSON.stringify(state, null, 2))
}

export async function getTheme(): Promise<Theme> {
  await load()
  return state.theme
}

export async function setTheme(theme: Theme): Promise<void> {
  await load()
  state.theme = theme
  await persist()
}

export async function getSidebarWidth(): Promise<number> {
  await load()
  return state.sidebarWidth
}

export async function setSidebarWidth(width: number): Promise<void> {
  await load()
  state.sidebarWidth = clampSidebarWidth(width)
  await persist()
}

export async function getIdleGapMinutes(): Promise<number> {
  await load()
  return state.idleGapMinutes
}

export async function setIdleGapMinutes(minutes: number): Promise<void> {
  await load()
  state.idleGapMinutes = clampIdleGap(minutes)
  await persist()
}

export async function getSpeechPreferences(): Promise<{ rate: number; voiceUri: string | null }> {
  await load()
  return { rate: state.speechRate, voiceUri: state.speechVoiceUri }
}

export async function setSpeechPreferences(next: { rate: number; voiceUri: string | null }): Promise<void> {
  await load()
  state.speechRate = Math.min(2, Math.max(0.5, next.rate))
  state.speechVoiceUri = next.voiceUri
  await persist()
}

export async function getSprintPreferences(): Promise<{ softLockout: boolean; chime: boolean }> {
  await load()
  return { softLockout: state.sprintSoftLockout, chime: state.sprintChime }
}

export async function setSprintPreferences(next: { softLockout: boolean; chime: boolean }): Promise<void> {
  await load()
  state.sprintSoftLockout = next.softLockout
  state.sprintChime = next.chime
  await persist()
}

export async function getSidebarCollapsed(): Promise<boolean> {
  await load()
  return state.sidebarCollapsed
}

export async function setSidebarCollapsed(collapsed: boolean): Promise<void> {
  await load()
  state.sidebarCollapsed = collapsed
  await persist()
}

export async function getAccentColor(): Promise<string | null> {
  await load()
  return state.accentColor
}

export async function setAccentColor(color: string | null): Promise<void> {
  await load()
  state.accentColor = color
  await persist()
}

export async function getBackgroundColor(): Promise<string | null> {
  await load()
  return state.backgroundColor
}

export async function setBackgroundColor(color: string | null): Promise<void> {
  await load()
  state.backgroundColor = color
  await persist()
}

export async function getTextColor(): Promise<string | null> {
  await load()
  return state.textColor
}

export async function setTextColor(color: string | null): Promise<void> {
  await load()
  state.textColor = color
  await persist()
}

export async function getTrueBlack(): Promise<boolean> {
  await load()
  return state.trueBlack
}

export async function setTrueBlack(enabled: boolean): Promise<void> {
  await load()
  state.trueBlack = enabled
  await persist()
}

export async function getZoomPercent(): Promise<number> {
  await load()
  return state.zoomPercent
}

export async function setZoomPercent(zoom: number): Promise<void> {
  await load()
  state.zoomPercent = clampZoom(zoom)
  await persist()
}

export async function getDefaultTypography(): Promise<TypographyDefaults> {
  await load()
  return state.defaultTypography
}

export async function setDefaultTypography(typography: TypographyDefaults): Promise<void> {
  await load()
  state.defaultTypography = typography
  await persist()
}

export async function getHiddenToolbarSections(): Promise<ToolbarSectionId[]> {
  await load()
  return state.hiddenToolbarSections
}

export async function setHiddenToolbarSections(sections: ToolbarSectionId[]): Promise<void> {
  await load()
  state.hiddenToolbarSections = sections
  await persist()
}

export async function getLayoutPresets(): Promise<LayoutPreset[]> {
  await load()
  return state.layoutPresets
}

export async function setLayoutPresets(presets: LayoutPreset[]): Promise<void> {
  await load()
  state.layoutPresets = presets
  await persist()
}

export async function getProjectRoot(): Promise<string | null> {
  await load()
  return state.projectRoot
}

export async function setProjectRootPref(root: string | null): Promise<void> {
  await load()
  state.projectRoot = root
  await persist()
}

export async function getCardWidth(): Promise<number> {
  await load()
  return state.cardWidth
}

export async function setCardWidth(width: number): Promise<void> {
  await load()
  state.cardWidth = clampCardWidth(width)
  await persist()
}

export async function getPageSize(): Promise<PageSize> {
  await load()
  return state.pageSize
}

export async function setPageSize(size: PageSize): Promise<void> {
  await load()
  state.pageSize = size
  await persist()
}

export async function getPageMarginMm(): Promise<number> {
  await load()
  return state.pageMarginMm
}

export async function setPageMarginMm(mm: number): Promise<void> {
  await load()
  state.pageMarginMm = clampPageMargin(mm)
  await persist()
}
