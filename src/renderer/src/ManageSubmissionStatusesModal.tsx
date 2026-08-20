import { useState } from 'react'
import type { SubmissionStatus } from '../../shared/submissions'
import { TrashIcon } from './icons'

interface ManageSubmissionStatusesModalProps {
  statuses: SubmissionStatus[]
  onSave: (statuses: SubmissionStatus[]) => Promise<void>
  onClose: () => void
}

/** Deliberately not ManageColorListModal: a submission status carries no
 *  color anywhere in this app, so there's no swatch column here. Same
 *  add/rename/remove shape otherwise. */
function ManageSubmissionStatusesModal(props: ManageSubmissionStatusesModalProps): JSX.Element {
  const { statuses, onSave, onClose } = props
  const [list, setList] = useState<SubmissionStatus[]>(statuses)
  const [saving, setSaving] = useState(false)

  function addItem(): void {
    setList((prev) => [...prev, { id: crypto.randomUUID(), name: '' }])
  }

  function updateName(id: string, name: string): void {
    setList((prev) => prev.map((item) => (item.id === id ? { ...item, name } : item)))
  }

  function removeItem(id: string): void {
    setList((prev) => prev.filter((item) => item.id !== id))
  }

  async function handleSave(): Promise<void> {
    setSaving(true)
    await onSave(list.map((item) => ({ ...item, name: item.name.trim() || 'Untitled' })))
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Manage Submission Statuses</h2>
        <p className="modal-message">
          Existing entries keep their status even if you rename it. Removing a status leaves entries that used it
          showing “Unknown status” rather than changing what you recorded.
        </p>

        <div className="color-list-editor">
          {list.length === 0 && <p className="tag-status-filter-empty">None yet — add one below.</p>}
          {list.map((item) => (
            <div key={item.id} className="color-list-row">
              <input
                type="text"
                className="typography-field-input"
                style={{ marginBottom: 0 }}
                placeholder="Status name…"
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
          + Status
        </button>

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

export default ManageSubmissionStatusesModal
