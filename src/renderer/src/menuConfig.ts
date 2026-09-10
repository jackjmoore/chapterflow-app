import { COUNT_ROUNDINGS, roundingLabel } from '../../shared/insertions'
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
    item('New Project…', 'newProject'),
    // Structure for the project already open, not a way of making one.
    item('Apply Template…', 'newProjectFromTemplate'),
    item('Open Project…', 'openProject'),
    // Saves and closes out to the dashboard without quitting. The only route
    // back to it for anyone who has turned off showing it on launch.
    item('Return to Dashboard', 'returnToDashboard'),
    sep,
    item('Save Now', 'saveNow', { ctrl: true, code: 'KeyS', display: 'Ctrl+S' }),
    sep,
    item('Import Files…', 'importFiles'),
    // Separate from Import Files because it makes a project rather than adding
    // to one, and because it can also bring across the machine-wide personal
    // dictionary, which belongs to no single project at all.
    item('Import from Scrivener…', 'importScrivener'),
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
    // One entry, because there is one surface. Ctrl+H and Ctrl+Shift+F still
    // work and are listed inside the bar itself, so collapsing the menu does
    // not hide them.
    item('Find & Replace…', 'find', { ctrl: true, code: 'KeyF', display: 'Ctrl+F' })
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

/** Exact plus the five rounding tiers, built from the shared list so the two
 *  count items can never offer different options. Presented as a submenu per
 *  item rather than a modal at insertion time or a buried preference: one
 *  click, and the rounding you picked is visible at the point of use. */
function countRoundingItems(prefix: string): MenuEntry[] {
  return COUNT_ROUNDINGS.map((rounding) => item(roundingLabel(rounding), `${prefix}:${rounding}`))
}

const INSERT_MENU: MenuDef = {
  label: 'Insert',
  items: [
    item('Image…', 'insertImage'),
    item('Footnote', 'insertFootnote', { ctrl: true, alt: true, code: 'KeyF', display: 'Ctrl+Alt+F' }),
    item('Comment…', 'insertComment', { ctrl: true, alt: true, code: 'KeyM', display: 'Ctrl+Alt+M' }),
    sep,
    item('Chapter Break', 'insertChapterBreak'),
    item('Page Break', 'insertPageBreak', { ctrl: true, code: 'Enter', display: 'Ctrl+Enter' }),
    item('Chapter Line', 'insertChapterLine'),
    sep,
    item('Current Date & Time', 'insertDateTime'),
    { type: 'submenu', label: 'Draft Word Count', items: countRoundingItems('insertWordCount') },
    { type: 'submenu', label: 'Character Count', items: countRoundingItems('insertCharacterCount') }
  ]
}

// Layout Presets' saved-preset entries are user data, not static config, so
// they're spliced in at render time by buildMenus() below rather than listed
// here — everything else in the menu bar is fixed and known up front.
// Theme, typography, and toolbar customization all moved to the Appearance
// panel (bottom of the nav rail) — one home for appearance, no menu twin.
const VIEW_MENU_BASE: MenuDef = {
  label: 'View',
  items: [
    item('Page Setup…', 'openPageSetupModal'),
    {
      type: 'submenu',
      label: 'Document View',
      items: [
        checkableItem('Continuous', 'pageView:continuous'),
        checkableItem('Page View', 'pageView:paginated')
      ]
    },
    // Sits with Document View rather than in the Format menu: like continuous
    // and page view, it changes what you see, never what the document is.
    // D for "diff" — R was a collision with the sprint toggle's Ctrl+Alt+R,
    // which this menu's earlier position in the shortcut table shadowed.
    checkableItem('Revision Mode', 'toggleRevisionMode', {
      ctrl: true,
      alt: true,
      code: 'KeyD',
      display: 'Ctrl+Alt+D'
    }),
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
    // Word target & deadline moved to the Progress panel (nav-rail bottom).
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
    // Forward-only writing: Backspace and Delete are refused while it is on.
    // Deliberately no shortcut — it can only be changed between writing
    // sessions, and a key chord invites toggling it by reflex mid-sentence.
    checkableItem('Hemingway Mode', 'toggleHemingway'),
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

const BASE_MENUS: MenuDef[] = [
  FILE_MENU,
  EDIT_MENU,
  FORMAT_MENU,
  INSERT_MENU,
  VIEW_MENU_BASE,
  PROJECT_MENU_BASE,
  HELP_MENU
]

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

  // Find, Replace and Find in Project are one menu entry and one surface now,
  // but the two other shortcuts are long-standing muscle memory. They stay
  // bound as virtual shortcuts — Ctrl+H opens the same bar with the replace
  // row expanded, Ctrl+Shift+F with the scope widened to the project — and the
  // bar itself displays both, so collapsing the menu hides nothing.
  out.push({ action: 'findReplace', shortcut: { ctrl: true, code: 'KeyH', display: 'Ctrl+H' } })
  out.push({ action: 'findInProject', shortcut: { ctrl: true, shift: true, code: 'KeyF', display: 'Ctrl+Shift+F' } })

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
