import type { SavedView } from '../../shared/binder'
import { TrashIcon } from './icons'

interface ManageSavedViewsModalProps {
  views: SavedView[]
  onDelete: (id: string) => void
  onClose: () => void
}

function ManageSavedViewsModal(props: ManageSavedViewsModalProps): JSX.Element {
  const { views, onDelete, onClose } = props

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Saved views</h2>
        {views.length === 0 ? (
          <p className="modal-message">No saved views yet — use Project → Saved Views → Save Current Filter as View…</p>
        ) : (
          <div className="backups-list">
            {views.map((view) => (
              <div key={view.id} className="backups-row">
                <span className="backups-row-date">{view.name}</span>
                <button type="button" className="row-delete-visible" title="Delete view" onClick={() => onDelete(view.id)}>
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

export default ManageSavedViewsModal
