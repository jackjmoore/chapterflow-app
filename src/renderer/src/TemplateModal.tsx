import { useState } from 'react'
import { TEMPLATE_OPTIONS, type TemplateId } from '../../shared/templates'

interface TemplateModalProps {
  onChoose: (id: TemplateId) => Promise<void>
  onClose: () => void
}

function TemplateModal(props: TemplateModalProps): JSX.Element {
  const { onChoose, onClose } = props
  const [applying, setApplying] = useState<TemplateId | null>(null)

  async function handleChoose(id: TemplateId): Promise<void> {
    setApplying(id)
    await onChoose(id)
    setApplying(null)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Start a project</h2>
        <p className="modal-message">Choose a starting structure for your binder. You can always add or rename things afterward.</p>
        <div className="template-options">
          {TEMPLATE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className="template-option"
              disabled={applying !== null}
              onClick={() => void handleChoose(opt.id)}
            >
              <span className="template-option-label">{opt.label}</span>
              <span className="template-option-description">{opt.description}</span>
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onClose} disabled={applying !== null}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default TemplateModal
