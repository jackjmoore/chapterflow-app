import { COLOR_PRESETS } from '../../shared/colorPresets'
import { TOOLBAR_SECTIONS } from '../../shared/toolbarSections'
import type { LayoutPreset } from '../../shared/layoutPresets'
import type { SavedView } from '../../shared/binder'

export interface ShortcutSpec {
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  code: string
  display: string
}

export type MenuEntry =
  | {
      type: 'item'
      label: string
      action: string
      shortcut?: ShortcutSpec
      nativeShortcut?: boolean
      checkable?: boolean
    }
  | { type: 'separator' }
  | { type: 'submenu'; label: string; items: MenuEntry[] }

export interface MenuDef {
  label: string
  items: MenuEntry[]
}

function item(label: string, action: string, shortcut?: ShortcutSpec): MenuEntry {
  return { type: 'item', label, action, shortcut }
}

/** A menu item that shows a checkmark when its action is in the live
 *  `checkedActions` set passed to MenuBar (e.g. True Black, Distraction-Free). */
function checkableItem(label: string, action: string, shortcut?: ShortcutSpec): MenuEntry {
  return { type: 'item', label, action, shortcut, checkable: true }
}

/**
 * Cut/Copy/Paste/Select All: shown with their standard shortcut label for
 * discoverability, but deliberately NOT registered in the global keydown
 * dispatch table below — those keys already work natively in any editable
 * field, and intercepting them risks breaking real clipboard behavior.
 */
function nativeItem(label: string, action: string, shortcut: ShortcutSpec): MenuEntry {
  return { type: 'item', label, action, shortcut, nativeShortcut: true }
}

const sep: MenuEntry = { type: 'separator' }

const FILE_MENU: MenuDef = {
  label: 'File',
  items: [
    item('New Document', 'newDocument', { ctrl: true, code: 'KeyN', display: 'Ctrl+N' }),
    item('New Folder', 'newFolder', { ctrl: true, shift: true, code: 'KeyN', display: 'Ctrl+Shift+N' }),
    item('Delete', 'delete'),
    sep,
    item('New Project from Template…', 'newProjectFromTemplate'),
    item('Open Project…', 'openProject'),
    sep,
    item('Save Now', 'saveNow', { ctrl: true, code: 'KeyS', display: 'Ctrl+S' }),
    sep,
    item('Import Files…', 'importFiles'),
    {
      type: 'submenu',
      label: 'Export Document',
      items: [
        item('Plain Text (.txt)…', 'export:document:txt'),
        item('PDF…', 'export:document:pdf'),
        item('Word (.docx)…', 'export:document:docx'),
        item('Markdown (.md)…', 'export:document:md')
      ]
    },
    {
      type: 'submenu',
      label: 'Export Project',
      items: [
        item('Plain Text (.txt)…', 'export:project:txt'),
        item('PDF…', 'export:project:pdf'),
        item('Word (.docx)…', 'export:project:docx'),
        item('Markdown (.md)…', 'export:project:md')
      ]
    },
    {
      type: 'submenu',
      label: 'Export Manuscript Format',
      items: [
        item('This Document — PDF…', 'exportManuscript:document:pdf'),
        item('This Document — Word (.docx)…', 'exportManuscript:document:docx'),
        sep,
        item('Whole Project — PDF…', 'exportManuscript:project:pdf'),
        item('Whole Project — Word (.docx)…', 'exportManuscript:project:docx')
      ]
    },
    sep,
    item('Print Document…', 'print:document', { ctrl: true, code: 'KeyP', display: 'Ctrl+P' }),
    item('Print Project…', 'print:project', { ctrl: true, shift: true, code: 'KeyP', display: 'Ctrl+Shift+P' }),
    {
      type: 'submenu',
      label: 'Print Manuscript Format',
      items: [
        item('This Document…', 'printManuscript:document'),
        item('Whole Project…', 'printManuscript:project')
      ]
    },
    sep,
    item('Backups…', 'showBackups', { ctrl: true, alt: true, code: 'KeyB', display: 'Ctrl+Alt+B' }),
    item('Snapshots…', 'showSnapshots', { ctrl: true, alt: true, code: 'KeyV', display: 'Ctrl+Alt+V' })
  ]
}

const EDIT_MENU: MenuDef = {
  label: 'Edit',
  items: [
    item('Undo', 'undo', { ctrl: true, code: 'KeyZ', display: 'Ctrl+Z' }),
    item('Redo', 'redo', { ctrl: true, code: 'KeyY', display: 'Ctrl+Y' }),
    sep,
    nativeItem('Cut', 'cut', { ctrl: true, code: 'KeyX', display: 'Ctrl+X' }),
    nativeItem('Copy', 'copy', { ctrl: true, code: 'KeyC', display: 'Ctrl+C' }),
    nativeItem('Paste', 'paste', { ctrl: true, code: 'KeyV', display: 'Ctrl+V' }),
    nativeItem('Select All', 'selectAll', { ctrl: true, code: 'KeyA', display: 'Ctrl+A' }),
    sep,
    item('Find', 'find', { ctrl: true, code: 'KeyF', display: 'Ctrl+F' }),
    item('Replace', 'findReplace', { ctrl: true, code: 'KeyH', display: 'Ctrl+H' }),
    item('Find in Project', 'findInProject', { ctrl: true, shift: true, code: 'KeyF', display: 'Ctrl+Shift+F' })
  ]
}

const FORMAT_MENU: MenuDef = {
  label: 'Format',
  items: [
    item('Bold', 'toggleBold', { ctrl: true, code: 'KeyB', display: 'Ctrl+B' }),
    item('Italic', 'toggleItalic', { ctrl: true, code: 'KeyI', display: 'Ctrl+I' }),
    item('Underline', 'toggleUnderline', { ctrl: true, code: 'KeyU', display: 'Ctrl+U' }),
    sep,
    item('Text Color…', 'textColor'),
    item('Highlight Color…', 'highlightColor'),
    sep,
    {
      type: 'submenu',
      label: 'Paragraph Style',
      items: [
        item('Normal Text', 'style:paragraph', { ctrl: true, alt: true, code: 'Digit0', display: 'Ctrl+Alt+0' }),
        item('Heading 1', 'style:h1', { ctrl: true, alt: true, code: 'Digit1', display: 'Ctrl+Alt+1' }),
        item('Heading 2', 'style:h2', { ctrl: true, alt: true, code: 'Digit2', display: 'Ctrl+Alt+2' }),
        item('Heading 3', 'style:h3', { ctrl: true, alt: true, code: 'Digit3', display: 'Ctrl+Alt+3' }),
        item('Block Quote', 'style:blockquote', { ctrl: true, alt: true, code: 'KeyQ', display: 'Ctrl+Alt+Q' })
      ]
    },
    {
      type: 'submenu',
      label: 'Align',
      items: [
        item('Left', 'align:left', { ctrl: true, shift: true, code: 'KeyL', display: 'Ctrl+Shift+L' }),
        item('Center', 'align:center', { ctrl: true, shift: true, code: 'KeyE', display: 'Ctrl+Shift+E' }),
        item('Right', 'align:right', { ctrl: true, shift: true, code: 'KeyR', display: 'Ctrl+Shift+R' }),
        item('Justify', 'align:justify', { ctrl: true, shift: true, code: 'KeyJ', display: 'Ctrl+Shift+J' })
      ]
    },
    {
      type: 'submenu',
      label: 'List',
      items: [
        item('Bulleted List', 'list:bullet', { ctrl: true, shift: true, code: 'Digit8', display: 'Ctrl+Shift+8' }),
        item('Numbered List', 'list:ordered', { ctrl: true, shift: true, code: 'Digit7', display: 'Ctrl+Shift+7' })
      ]
    },
    item('Indent', 'indent', { ctrl: true, code: 'BracketRight', display: 'Ctrl+]' }),
    item('Outdent', 'outdent', { ctrl: true, code: 'BracketLeft', display: 'Ctrl+[' }),
    sep,
    item('Increase Font Size', 'fontSize:increase', { ctrl: true, shift: true, code: 'Period', display: 'Ctrl+Shift+.' }),
    item('Decrease Font Size', 'fontSize:decrease', { ctrl: true, shift: true, code: 'Comma', display: 'Ctrl+Shift+,' })
  ]
}

const COLOR_PRESET_ITEMS: MenuEntry[] = COLOR_PRESETS.map((preset) =>
  item(preset.name, `colorPreset:${preset.id}`)
)

const TOOLBAR_SECTION_ITEMS: MenuEntry[] = TOOLBAR_SECTIONS.map((section) =>
  checkableItem(section.label, `toolbarSection:${section.id}`)
)

// Layout Presets' saved-preset entries are user data, not static config, so
// they're spliced in at render time by buildMenus() below rather than listed
// here — everything else in the menu bar is fixed and known up front.
const VIEW_MENU_BASE: MenuDef = {
  label: 'View',
  items: [
    {
      type: 'submenu',
      label: 'Theme',
      items: [
        checkableItem('Light', 'setTheme:light'),
        checkableItem('Dark', 'setTheme:dark'),
        sep,
        checkableItem('True Black (OLED)', 'toggleTrueBlack'),
        sep,
        item('Accent Color…', 'accentColor'),
        item('Background Color…', 'backgroundColor'),
        item('Text Color…', 'textColorTheme'),
        item('Reset Colors to Theme Default', 'resetColors'),
        sep,
        { type: 'submenu', label: 'Color Presets', items: COLOR_PRESET_ITEMS }
      ]
    },
    item('Default Typography…', 'openTypographyModal'),
    item('Page Setup…', 'openPageSetupModal'),
    { type: 'submenu', label: 'Toolbar', items: TOOLBAR_SECTION_ITEMS },
    {
      type: 'submenu',
      label: 'Layout Presets',
      items: [item('Save Current as Preset…', 'saveLayoutPreset'), item('Manage Presets…', 'manageLayoutPresets')]
    },
    sep,
    checkableItem('Read Aloud', 'readAloud', { ctrl: true, alt: true, code: 'KeyA', display: 'Ctrl+Alt+A' }),
    sep,
    checkableItem('Distraction-Free Mode', 'toggleDistractionFree', {
      ctrl: true,
      alt: true,
      code: 'KeyF',
      display: 'Ctrl+Alt+F'
    })
  ]
}

// Saved views' entries are user data, not static config, so they're spliced
// in at render time by buildMenus() below rather than listed here.
const PROJECT_MENU_BASE: MenuDef = {
  label: 'Project',
  items: [
    item('Word Target & Deadline…', 'openProjectTargetModal'),
    sep,
    item('Manage Statuses…', 'openManageStatusesModal'),
    item('Manage Tags…', 'openManageTagsModal'),
    item('Tagged Spans…', 'showSpanTags'),
    item('Overused Words…', 'showOverusedWords', {
      ctrl: true,
      alt: true,
      code: 'KeyW',
      display: 'Ctrl+Alt+W'
    }),
    item('Writing Sessions…', 'showSessions', {
      ctrl: true,
      alt: true,
      code: 'KeyS',
      display: 'Ctrl+Alt+S'
    }),
    // Same shortcut starts and stops — while one is running the label in the
    // footer is the visible state, so a second press ends it.
    item('Start / Stop Sprint…', 'startSprint', {
      ctrl: true,
      alt: true,
      code: 'KeyR',
      display: 'Ctrl+Alt+R'
    }),
    sep,
    {
      type: 'submenu',
      label: 'Saved Views',
      items: [item('Save Current Filter as View…', 'saveCurrentFilterAsView'), item('Manage Saved Views…', 'manageSavedViews')]
    }
  ]
}

const HELP_MENU: MenuDef = {
  label: 'Help',
  items: [item('About ChapterFlow…', 'showAbout'), item('Check for Updates…', 'checkForUpdates')]
}

const BASE_MENUS: MenuDef[] = [FILE_MENU, EDIT_MENU, FORMAT_MENU, VIEW_MENU_BASE, PROJECT_MENU_BASE, HELP_MENU]

/** Builds the full menu bar for this render, splicing the user's saved
 *  layout presets into View > Layout Presets and saved filter views into
 *  Project > Saved Views (everything else is static). */
export function buildMenus(layoutPresets: LayoutPreset[], savedViews: SavedView[] = []): MenuDef[] {
  return BASE_MENUS.map((menu) => {
    if (menu.label === 'View' && layoutPresets.length > 0) {
      const presetItems: MenuEntry[] = [sep, ...layoutPresets.map((p) => item(p.name, `applyLayoutPreset:${p.id}`))]
      return {
        ...menu,
        items: menu.items.map((entry) => {
          if (entry.type === 'submenu' && entry.label === 'Layout Presets') {
            return { ...entry, items: [...entry.items, ...presetItems] }
          }
          return entry
        })
      }
    }
    if (menu.label === 'Project' && savedViews.length > 0) {
      const viewItems: MenuEntry[] = [sep, ...savedViews.map((v) => item(v.name, `applySavedView:${v.id}`))]
      return {
        ...menu,
        items: menu.items.map((entry) => {
          if (entry.type === 'submenu' && entry.label === 'Saved Views') {
            return { ...entry, items: [...entry.items, ...viewItems] }
          }
          return entry
        })
      }
    }
    return menu
  })
}

/** Flattened list of every shortcut-bearing item, used to drive the global keydown handler.
 *  Computed from the static base menus — saved layout presets never carry shortcuts. */
export const ALL_SHORTCUTS: { action: string; shortcut: ShortcutSpec }[] = (() => {
  const out: { action: string; shortcut: ShortcutSpec }[] = []
  function walk(entries: MenuEntry[]): void {
    for (const entry of entries) {
      if (entry.type === 'item' && entry.shortcut && !entry.nativeShortcut) {
        out.push({ action: entry.action, shortcut: entry.shortcut })
      }
      if (entry.type === 'submenu') walk(entry.items)
    }
  }
  for (const menu of BASE_MENUS) walk(menu.items)

  // Light/Dark are separate checkable menu items now (no individual
  // shortcut each), but the original quick-toggle shortcut is kept working
  // as a "virtual" binding not tied to any single menu label.
  out.push({ action: 'toggleTheme', shortcut: { ctrl: true, alt: true, code: 'KeyT', display: 'Ctrl+Alt+T' } })

  return out
})()

export function matchesShortcut(e: KeyboardEvent, spec: ShortcutSpec): boolean {
  return (
    e.code === spec.code &&
    e.ctrlKey === !!spec.ctrl &&
    e.shiftKey === !!spec.shift &&
    e.altKey === !!spec.alt &&
    !e.metaKey
  )
}
