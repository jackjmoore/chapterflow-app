import type { SnapshotMeta } from '../../shared/snapshot'
import type { RevisionDiff } from './revisionDiff'
import { formatSnapshotDate } from './snapshotLabel'
import { CloseIcon } from './icons'

interface RevisionBarProps {
  snapshot: SnapshotMeta | null
  diff: RevisionDiff | null
  onTakeSnapshot: () => void
  onClose: () => void
}

/**
 * Names the reference point while revision mode is on.
 *
 * Without it the mode is markup with no stated origin — the highlighting says
 * something changed but never which moment it changed from, and "take a new
 * snapshot to start again from here" has nowhere obvious to live.
 */
function RevisionBar(props: RevisionBarProps): JSX.Element {
  const { snapshot, diff, onTakeSnapshot, onClose } = props

  const additions = diff?.additions.length ?? 0
  const deletions = diff?.deletions.length ?? 0

  return (
    <div className="revision-bar">
      <span className="revision-bar-title">Revision mode</span>

      {snapshot ? (
        <span className="revision-bar-reference" title="Changes are measured from this snapshot">
          since <strong>{snapshot.name ?? 'Untitled'}</strong> · {formatSnapshotDate(snapshot.timestamp)}
        </span>
      ) : (
        <span className="revision-bar-reference">Loading snapshot…</span>
      )}

      <span className="revision-bar-counts">
        {additions === 0 && deletions === 0 ? (
          <span className="revision-bar-clean">No changes yet</span>
        ) : (
          <>
            <span className="revision-bar-count revision-bar-count--add">
              {additions} addition{additions === 1 ? '' : 's'}
            </span>
            <span className="revision-bar-count revision-bar-count--del">
              {deletions} deletion{deletions === 1 ? '' : 's'}
            </span>
          </>
        )}
      </span>

      <button
        type="button"
        className="revision-bar-button"
        title="Snapshot the document as it stands and measure from here instead"
        onClick={onTakeSnapshot}
      >
        Snapshot now
      </button>

      <button type="button" className="icon-close-button" title="Exit revision mode" onClick={onClose}>
        <CloseIcon />
      </button>
    </div>
  )
}

export default RevisionBar
