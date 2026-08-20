import { useState } from 'react'

interface SaveLayoutPresetModalProps {
  onSave: (name: string) => Promise<void>
  onClose: () => void
}

function SaveLayoutPresetModal(props: SaveLayoutPresetModalProps): JSX.Element {
  const { onSave, onClose } = props
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave(): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    await onSave(trimmed)
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Save current layout as a preset</h2>
        <p className="modal-message">
          Captures the current theme, zoom level, distraction-free state, and default font as one named preset you can
          switch back to from View → Layout Presets.
        </p>
        <input
          autoFocus
          type="text"
          className="typography-field-input"
          placeholder="Preset name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSave()
          }}
        />
        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-confirm modal-confirm--primary"
            onClick={() => void handleSave()}
            disabled={saving || !name.trim()}
          >
            {saving ? 'Saving…' : 'Save Preset'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SaveLayoutPresetModal
