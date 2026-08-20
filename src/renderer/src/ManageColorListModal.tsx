import { useState } from 'react'
import { TrashIcon } from './icons'

interface ColorListItem {
  id: string
  name: string
  color: string
}

interface ManageColorListModalProps {
  title: string
  message: string
  items: ColorListItem[]
  addLabel: string
  defaultColor: string
  onSave: (items: ColorListItem[]) => Promise<void>
  onClose: () => void
}

/** Generic add/rename/recolor/remove list editor — shared by Manage Statuses
 *  and Manage Tags, since a status and a tag are both just a named color. */
function ManageColorListModal(props: ManageColorListModalProps): JSX.Element {
  const { title, message, items, addLabel, defaultColor, onSave, onClose } = props
  const [list, setList] = useState<ColorListItem[]>(items)
  const [saving, setSaving] = useState(false)

  function addItem(): void {
    setList((prev) => [...prev, { id: crypto.randomUUID(), name: '', color: defaultColor }])
  }

  function updateName(id: string, name: string): void {
    setList((prev) => prev.map((item) => (item.id === id ? { ...item, name } : item)))
  }

  function updateColor(id: string, color: string): void {
    setList((prev) => prev.map((item) => (item.id === id ? { ...item, color } : item)))
  }

  function removeItem(id: string): void {
    setList((prev) => prev.filter((item) => item.id !== id))
  }

  async function handleSave(): Promise<void> {
    setSaving(true)
    const cleaned = list.map((item) => ({ ...item, name: item.name.trim() || 'Untitled' }))
    await onSave(cleaned)
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{title}</h2>
        <p className="modal-message">{message}</p>

        <div className="color-list-editor">
          {list.length === 0 && <p className="tag-status-filter-empty">None yet — add one below.</p>}
          {list.map((item) => (
            <div key={item.id} className="color-list-row">
              <input
                type="color"
                className="color-list-swatch-input"
                value={item.color}
                onChange={(e) => updateColor(item.id, e.target.value)}
              />
              <input
                type="text"
                className="typography-field-input"
                style={{ marginBottom: 0 }}
                placeholder="Name…"
                value={item.name}
                onChange={(e) => updateName(item.id, e.target.value)}
              />
              <button type="button" className="row-delete-visible" title="Remove" onClick={() => removeItem(item.id)}>
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>

        <button type="button" className="color-list-add-button" onClick={addItem}>
          + {addLabel}
        </button>

        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="modal-confirm modal-confirm--primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ManageColorListModal
