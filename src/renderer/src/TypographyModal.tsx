import { useState } from 'react'
import type { TypographyDefaults } from '../../shared/preferences'
import { FONT_FAMILIES, FONT_SIZES_PT, LINE_HEIGHTS } from './toolbarOptions'

interface TypographyModalProps {
  initial: TypographyDefaults
  onSave: (value: TypographyDefaults) => Promise<void>
  onClose: () => void
}

function TypographyModal(props: TypographyModalProps): JSX.Element {
  const { initial, onSave, onClose } = props
  const [fontFamily, setFontFamily] = useState(initial.fontFamily ?? '')
  const [fontSizePt, setFontSizePt] = useState(initial.fontSizePt ? String(initial.fontSizePt) : '')
  const [lineHeight, setLineHeight] = useState(initial.lineHeight ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave(): Promise<void> {
    setSaving(true)
    await onSave({
      fontFamily: fontFamily || null,
      fontSizePt: fontSizePt ? Number(fontSizePt) : null,
      lineHeight: lineHeight || null
    })
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Default typography for new documents</h2>
        <p className="modal-message">
          Applies to documents when you first create them — not to documents you&apos;ve already written in. Per-selection
          formatting in the toolbar always overrides this.
        </p>

        <div className="typography-form">
          <label className="typography-field">
            <span>Default font</span>
            <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}>
              <option value="">App default</option>
              {FONT_FAMILIES.map((font) => (
                <option key={font.value} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>

          <label className="typography-field">
            <span>Default size</span>
            <select value={fontSizePt} onChange={(e) => setFontSizePt(e.target.value)}>
              <option value="">App default</option>
              {FONT_SIZES_PT.map((size) => (
                <option key={size} value={size}>
                  {size} pt
                </option>
              ))}
            </select>
          </label>

          <label className="typography-field">
            <span>Default line spacing</span>
            <select value={lineHeight} onChange={(e) => setLineHeight(e.target.value)}>
              <option value="">App default</option>
              {LINE_HEIGHTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-confirm modal-confirm--primary"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default TypographyModal
