import { useMemo } from 'react'
import { diffWords } from 'diff'
import { diffText } from './revisionDiff'
import { CloseIcon } from './icons'

export interface DiffSide {
  label: string
  html: string
}

interface SnapshotDiffModalProps {
  left: DiffSide
  right: DiffSide
  onClose: () => void
}

function SnapshotDiffModal(props: SnapshotDiffModalProps): JSX.Element {
  const { left, right, onClose } = props

  // Same extraction and same comparison revision mode uses — one pipeline, so
  // this view and the inline one can never disagree about what changed.
  const parts = useMemo(
    () => diffWords(diffText(left.html), diffText(right.html)),
    [left.html, right.html]
  )

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal snapshot-diff-modal" onClick={(e) => e.stopPropagation()}>
        <div className="backups-modal-header">
          <h2 className="modal-title">Compare Snapshots</h2>
          <button type="button" className="icon-close-button" title="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <p className="modal-message">
          <span className="diff-legend diff-legend-remove">{left.label}</span>
          {' → '}
          <span className="diff-legend diff-legend-add">{right.label}</span>
        </p>

        <div className="snapshot-diff-body">
          {parts.map((part, i) => (
            <span key={i} className={part.added ? 'diff-add' : part.removed ? 'diff-remove' : undefined}>
              {part.value}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default SnapshotDiffModal
