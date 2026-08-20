import { useState } from 'react'

interface ProjectTargetModalProps {
  initialTarget: number | null
  initialDeadline: string | null
  onSave: (target: number | null, deadline: string | null) => Promise<void>
  onClose: () => void
}

function ProjectTargetModal(props: ProjectTargetModalProps): JSX.Element {
  const { initialTarget, initialDeadline, onSave, onClose } = props
  const [target, setTarget] = useState(initialTarget != null ? String(initialTarget) : '')
  const [deadline, setDeadline] = useState(initialDeadline ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave(): Promise<void> {
    setSaving(true)
    const parsed = target.trim() ? Math.max(0, Math.round(Number(target))) : null
    await onSave(Number.isFinite(parsed) ? parsed : null, deadline || null)
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Project word target & deadline</h2>
        <p className="modal-message">
          Drives the progress bar in the footer and the pace comparison — required words/day to hit the deadline vs. your
          actual average since the target was set.
        </p>

        <div className="typography-form">
          <label className="typography-field">
            <span>Total word target</span>
            <input
              type="number"
              min={0}
              className="typography-field-input"
              style={{ marginBottom: 0 }}
              placeholder="e.g. 80000"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </label>
          <label className="typography-field">
            <span>Deadline</span>
            <input
              type="date"
              className="typography-field-input"
              style={{ marginBottom: 0 }}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </label>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="modal-cancel"
            onClick={() => {
              setTarget('')
              setDeadline('')
            }}
            disabled={saving}
          >
            Clear
          </button>
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

export default ProjectTargetModal
