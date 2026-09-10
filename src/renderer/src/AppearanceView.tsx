import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { COLOR_PRESETS, type ColorPreset, type PresetPalette } from '../../shared/colorPresets'
import { customThemeAsPreset, type CustomTheme } from '../../shared/customThemes'
import { TOOLBAR_SECTIONS, type ToolbarSectionId } from '../../shared/toolbarSections'
import type { Theme, TypographyDefaults } from '../../shared/preferences'
import { FONT_GROUPS, FONT_SIZES_PT, LINE_HEIGHTS } from './toolbarOptions'
import { derivePaletteTokens, PAPER } from './paletteTokens'
import { normalizeHex } from './colorUtils'

/** A theme being made or changed: the same shape as a saved one, plus which
 *  modes the writer has actually adjusted, so the other can be derived from
 *  their colours at save time rather than frozen from the starting point. */
export interface ThemeDraft {
  /** Null while it is new; the theme's id once it exists. */
  id: string | null
  name: string
  startedFrom: string | null
  variants: Record<Theme, PresetPalette>
  touched: Record<Theme, boolean>
}

interface AppearanceViewProps {
  // Current values — the same state the CSS-variable effects read.
  theme: Theme
  /** The active preset or custom theme, or null for plain theme defaults. */
  colorPresetId: string | null
  customThemes: CustomTheme[]
  themeDraft: ThemeDraft | null
  defaultTypography: TypographyDefaults
  hiddenToolbarSections: ToolbarSectionId[]
  // Handlers — the exact ones the View menu used to dispatch to.
  onSetTheme: (theme: Theme) => void
  onApplyPreset: (presetId: string) => void
  /** Puts the whole window into a theme without keeping it — null puts back
   *  whatever was actually chosen. Nothing is written to preferences. */
  onPreviewPreset: (presetId: string | null) => void
  /** Opens the editing card for a new theme, copied from the given preset or
   *  custom theme, or from whatever the window is wearing when null. */
  onStartTheme: (fromId: string | null) => void
  onEditTheme: (id: string) => void
  onChangeDraftName: (name: string) => void
  /** Changes one of the four colours of the mode currently on screen. */
  onChangeDraftColor: (key: keyof PresetPalette, hex: string | null) => void
  onSaveDraft: () => void
  onDiscardDraft: () => void
  onDeleteTheme: (id: string) => void
  onSaveTypography: (value: TypographyDefaults) => Promise<void>
  onToggleToolbarSection: (id: ToolbarSectionId) => void
}

const WELLS: { key: keyof PresetPalette; label: string; note: string }[] = [
  { key: 'background', label: 'Background', note: 'Panels, controls and hairlines are shaded from it.' },
  { key: 'text', label: 'Text', note: 'The interface’s own ink.' },
  { key: 'accent', label: 'Accent', note: 'Links, the open document, the sprint clock.' },
  { key: 'page', label: 'Page', note: 'The manuscript sheet. Clear it for paper.' }
]

/**
 * Every appearance setting in one place — the View menu's former Theme
 * submenu, Default Typography modal, and Toolbar submenu, consolidated.
 *
 * Strictly a relocation: every control here calls the same handler and writes
 * the same stored preference its menu counterpart did; the menu entries are
 * gone, so no setting has two homes.
 *
 * Themes the writer makes live on the same wall as the presets, drawn with
 * the same specimen, because a theme is chosen where themes are shown. The
 * editing card is that specimen with the four wells under it, and while it
 * is open the whole window wears the draft — the same try-on that hovering
 * a preset gives, so what is being made is never guessed at from a swatch.
 * This replaced the loose "Custom colors" wells: a theme is those same four
 * colours, kept under a name.
 */
function AppearanceView(props: AppearanceViewProps): JSX.Element {
  const {
    theme,
    colorPresetId,
    customThemes,
    themeDraft,
    defaultTypography,
    hiddenToolbarSections,
    onSetTheme,
    onApplyPreset,
    onPreviewPreset,
    onStartTheme,
    onEditTheme,
    onChangeDraftName,
    onChangeDraftColor,
    onSaveDraft,
    onDiscardDraft,
    onDeleteTheme,
    onSaveTypography,
    onToggleToolbarSection
  } = props

  const typography = (patch: Partial<TypographyDefaults>): void => {
    void onSaveTypography({ ...defaultTypography, ...patch })
  }

  /**
   * The eight toolbar sections live behind a button rather than inline in the
   * bar. Their labels are full phrases ("Bold / Italic / Underline", "Text &
   * Highlight Color") — laid out as eight inline checkboxes they are wider
   * than the window, which is the one thing a slim bar cannot absorb. Same
   * button-plus-popover shape the Story Bible's "Add an entry" uses.
   */
  const [sectionsOpen, setSectionsOpen] = useState(false)
  const sectionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sectionsOpen) return
    function handlePointerDown(e: MouseEvent): void {
      if (sectionsRef.current && !sectionsRef.current.contains(e.target as Node)) setSectionsOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [sectionsOpen])

  const hiddenCount = hiddenToolbarSections.length

  // The name field takes focus when the editing card opens, and again when
  // it opens for a different theme.
  const nameRef = useRef<HTMLInputElement>(null)
  const draftKey = themeDraft ? themeDraft.id ?? 'new' : null
  useEffect(() => {
    if (draftKey !== null) nameRef.current?.focus()
  }, [draftKey])

  // Two-step delete, on the card itself: the first press asks, the second
  // does it, and anything else puts it back.
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  useEffect(() => {
    setConfirmingDelete(false)
  }, [draftKey])

  /**
   * A theme shown as the app wearing it: the search bar, the rail, the binder,
   * a manuscript page with real words on it, the accent on a control, the
   * status line. Every colour comes from the same derivation that will paint
   * the window, so the card is a specimen rather than an impression of one.
   */
  function renderSpecimen(palette: PresetPalette): JSX.Element {
    const tokens = derivePaletteTokens(palette)
    return (
      <span className="appearance-spec" style={tokens as CSSProperties}>
        <span className="appearance-spec-top">Search the whole project…</span>
        <span className="appearance-spec-main">
          <span className="appearance-spec-rail" />
          <span className="appearance-spec-binder">
            <i className="is-active" />
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="appearance-spec-body">
            <span className="appearance-spec-page">
              <span className="appearance-spec-h">4. What the Log Says</span>
              <span className="appearance-spec-p">
                The lamp was lit at four and the log written up at six, in a hand that had begun to slope.
              </span>
            </span>
            <span className="appearance-spec-foot">
              <span className="appearance-spec-btn">Compile</span>
              <span className="appearance-spec-status">All changes saved</span>
            </span>
          </span>
        </span>
      </span>
    )
  }

  function renderPresetCard(preset: ColorPreset, yours: boolean): JSX.Element {
    const active = colorPresetId === preset.id
    const meta = (
      <span className="appearance-theme-meta">
        <span className="appearance-theme-name">
          {preset.name}
          {active && <span className="appearance-theme-tick">in use</span>}
        </span>
        <span className="appearance-theme-desc">{preset.description}</span>
      </span>
    )
    // Hovering wears it; leaving puts back whatever was chosen. Focus does
    // the same, so the keyboard gets the preview too.
    const tryOn = {
      onMouseEnter: () => onPreviewPreset(preset.id),
      onMouseLeave: () => onPreviewPreset(null),
      onFocus: () => onPreviewPreset(preset.id),
      onBlur: () => onPreviewPreset(null)
    }
    if (!yours) {
      return (
        <button key={preset.id} type="button" className={`appearance-theme ${active ? 'is-active' : ''}`} {...tryOn} onClick={() => onApplyPreset(preset.id)}>
          {renderSpecimen(preset.variants[theme])}
          {meta}
        </button>
      )
    }
    // A button cannot hold a button, and a theme of yours carries its edit
    // control on the card, so this one is a div that behaves as the button
    // above does.
    return (
      <div
        key={preset.id}
        role="button"
        tabIndex={0}
        className={`appearance-theme appearance-theme--yours ${active ? 'is-active' : ''}`}
        {...tryOn}
        onClick={() => onApplyPreset(preset.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onApplyPreset(preset.id)
          }
        }}
      >
        {renderSpecimen(preset.variants[theme])}
        {meta}
        <button
          type="button"
          className="appearance-theme-edit"
          onClick={(e) => {
            e.stopPropagation()
            onPreviewPreset(null)
            onEditTheme(preset.id)
          }}
        >
          Edit
        </button>
      </div>
    )
  }

  function renderEditingCard(draft: ThemeDraft): JSX.Element {
    const palette = draft.variants[theme]
    const otherMode = theme === 'light' ? 'dark' : 'light'
    const canSave = draft.name.trim().length > 0
    return (
      <div className="appearance-theme appearance-theme--editing" key="editing">
        {renderSpecimen(palette)}
        <div className="appearance-theme-form">
          <input
            ref={nameRef}
            type="text"
            className="typography-field-input appearance-theme-name-input"
            placeholder="Name this theme"
            value={draft.name}
            onChange={(e) => onChangeDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSave) onSaveDraft()
              if (e.key === 'Escape') onDiscardDraft()
            }}
          />
          <div className="appearance-wells">
            {WELLS.map((well) => {
              const value = palette[well.key]
              const shown = value ?? PAPER
              return (
                <div key={well.key} className="appearance-well" title={well.note}>
                  <input
                    type="color"
                    aria-label={well.label}
                    value={shown}
                    onChange={(e) => onChangeDraftColor(well.key, e.target.value)}
                  />
                  <span className="appearance-well-label">{well.label}</span>
                  <input
                    type="text"
                    className="appearance-well-hex"
                    aria-label={`${well.label} as hex`}
                    value={value ?? ''}
                    placeholder={well.key === 'page' ? 'paper' : shown}
                    spellCheck={false}
                    onChange={(e) => {
                      const typed = e.target.value
                      if (well.key === 'page' && typed.trim() === '') {
                        onChangeDraftColor('page', null)
                        return
                      }
                      const hex = normalizeHex(typed)
                      if (hex) onChangeDraftColor(well.key, hex)
                    }}
                  />
                </div>
              )
            })}
          </div>
          <p className="appearance-theme-hint">
            {draft.startedFrom ? `Started from ${draft.startedFrom}. ` : 'Started from what the window was wearing. '}
            You are adjusting the {theme} version, and the window is wearing it now.{' '}
            {draft.touched[otherMode]
              ? `The ${otherMode} version has its own colours; switch to ${otherMode === 'dark' ? 'Dark' : 'Light'} above to adjust them.`
              : `The ${otherMode} version is being made from these four as you go; switch to ${otherMode === 'dark' ? 'Dark' : 'Light'} above to see it, and change it there if you like.`}
          </p>
          <div className="appearance-theme-actions">
            {draft.id !== null &&
              (confirmingDelete ? (
                <button type="button" className="progress-clear-button appearance-theme-delete" onClick={() => onDeleteTheme(draft.id as string)}>
                  Delete it for good
                </button>
              ) : (
                <button type="button" className="progress-clear-button appearance-theme-delete" onClick={() => setConfirmingDelete(true)}>
                  Delete this theme
                </button>
              ))}
            <span className="appearance-theme-actions-spacer" />
            <button type="button" className="modal-cancel" onClick={onDiscardDraft}>
              Discard
            </button>
            <button type="button" className="modal-confirm modal-confirm--primary" disabled={!canSave} onClick={onSaveDraft}>
              Save theme
            </button>
          </div>
        </div>
      </div>
    )
  }

  const yourPresets = customThemes.map(customThemeAsPreset)
  const editingId = themeDraft ? themeDraft.id : null
  const showYours = yourPresets.length > 0 || themeDraft !== null
  const makeCard = (label: string): JSX.Element => (
    <button key="make" type="button" className="appearance-theme-make" onClick={() => onStartTheme(colorPresetId)}>
      <span className="appearance-theme-make-title">{label}</span>
      <span className="appearance-theme-make-desc">
        Start from the theme in use and change what you like. The window wears it while you work.
      </span>
    </button>
  )

  return (
    // A fragment: .view-pane is already the flex column, so the bar and the
    // scrolling settings list become its two children directly — which is
    // what keeps the bar in place while the list scrolls under it.
    <>
      <div className="outliner-toolbar appearance-toolbar">
        <label className="appearance-select">
          Font
          <select
            value={defaultTypography.fontFamily ?? ''}
            onChange={(e) => typography({ fontFamily: e.target.value || null })}
          >
            <option value="">App default</option>
            {FONT_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.fonts.map((font) => (
                  <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                    {font.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="appearance-select">
          Size
          <select
            value={defaultTypography.fontSizePt == null ? '' : String(defaultTypography.fontSizePt)}
            onChange={(e) => typography({ fontSizePt: e.target.value === '' ? null : Number(e.target.value) })}
          >
            <option value="">App default</option>
            {FONT_SIZES_PT.map((size) => (
              <option key={size} value={size}>
                {size} pt
              </option>
            ))}
          </select>
        </label>
        <label className="appearance-select">
          Line spacing
          <select
            value={defaultTypography.lineHeight ?? ''}
            onChange={(e) => typography({ lineHeight: e.target.value || null })}
          >
            <option value="">App default</option>
            {LINE_HEIGHTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="appearance-sections-picker" ref={sectionsRef}>
          <button type="button" className="submissions-add-button" onClick={() => setSectionsOpen((v) => !v)}>
            Toolbar sections{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ''}
          </button>
          {sectionsOpen && (
            <div className="story-bible-new-item-popover appearance-sections-popover">
              <span className="progress-hint">Unchecked sections move into the toolbar’s overflow menu.</span>
              {TOOLBAR_SECTIONS.map((section) => (
                <label key={section.id} className="appearance-check">
                  <input
                    type="checkbox"
                    checked={!hiddenToolbarSections.includes(section.id)}
                    onChange={() => onToggleToolbarSection(section.id)}
                  />
                  {section.label}
                </label>
              ))}
            </div>
          )}
        </div>

        <span className="compile-details-spacer" />
        <span className="compile-details-summary">
          Applied to new documents; existing text keeps its own formatting.
        </span>
      </div>

    <div className="appearance-view">
      {/* The global mode switch, first and prominent: it is independent of
          preset choice — a preset supplies a paired variant for whichever
          mode is active here. */}
      <div className="progress-section">
        <div className="appearance-mode-row">
          <div className="book-mode-switch appearance-mode-switch">
            <button
              type="button"
              className={theme === 'light' ? 'is-active' : ''}
              onClick={() => onSetTheme('light')}
            >
              Light
            </button>
            <button type="button" className={theme === 'dark' ? 'is-active' : ''} onClick={() => onSetTheme('dark')}>
              Dark
            </button>
          </div>
        </div>
      </div>

      {/* Themes of your own sit above the presets, drawn the same way. The
          editing card takes the place of the theme it is editing, or leads
          the row when the theme is new. */}
      {showYours && (
        <div className="progress-section">
          <h2 className="progress-section-title appearance-themes-title">Your themes</h2>
          <div className="appearance-themes">
            {themeDraft && themeDraft.id === null && renderEditingCard(themeDraft)}
            {yourPresets.map((preset) =>
              themeDraft && editingId === preset.id ? renderEditingCard(themeDraft) : renderPresetCard(preset, true)
            )}
            {!themeDraft && makeCard('Make another')}
          </div>
        </div>
      )}

      {/* No line under this heading: each card is the app wearing the theme,
          which says what a sentence would have said. */}
      <div className="progress-section">
        <h2 className="progress-section-title appearance-themes-title">Themes</h2>
        <div className="appearance-themes">
          {COLOR_PRESETS.map((preset) => renderPresetCard(preset, false))}
          {!showYours && makeCard('Make your own')}
        </div>
      </div>
    </div>
    </>
  )
}

export default AppearanceView
