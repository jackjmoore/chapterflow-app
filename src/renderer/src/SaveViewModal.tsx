import { useState } from 'react'

interface SaveViewModalProps {
  onSave: (name: string) => Promise<void>
  onClose: () => void
}

function SaveViewModal(props: SaveViewModalProps): JSX.Element {
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
        <h2 className="modal-title">Save current filter as a view</h2>
        <p className="modal-message">
          Captures the current status and tag filter as one named view you can return to from Project → Saved Views.
        </p>
        <input
          autoFocus
          type="text"
          className="typography-field-input"
          placeholder="View name…"
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
            {saving ? 'Saving…' : 'Save View'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SaveViewModal
