import type { LayoutPreset } from '../../shared/layoutPresets'
import { TrashIcon } from './icons'

interface ManageLayoutPresetsModalProps {
  presets: LayoutPreset[]
  onDelete: (id: string) => void
  onClose: () => void
}

function ManageLayoutPresetsModal(props: ManageLayoutPresetsModalProps): JSX.Element {
  const { presets, onDelete, onClose } = props

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Layout presets</h2>
        {presets.length === 0 ? (
          <p className="modal-message">No saved presets yet — use View → Layout Presets → Save Current as Preset…</p>
        ) : (
          <div className="backups-list">
            {presets.map((preset) => (
              <div key={preset.id} className="backups-row">
                <span className="backups-row-date">{preset.name}</span>
                <button type="button" className="row-delete-visible" title="Delete preset" onClick={() => onDelete(preset.id)}>
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default ManageLayoutPresetsModal
