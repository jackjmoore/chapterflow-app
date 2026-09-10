import { useEffect, useState } from 'react'
import type { SnapshotMeta } from '../../shared/snapshot'
import ConfirmModal from './ConfirmModal'
import SnapshotDiffModal, { type DiffSide } from './SnapshotDiffModal'
import { formatSnapshotDate, snapshotLabel as labelFor } from './snapshotLabel'
import { CloseIcon } from './icons'

interface SnapshotsModalProps {
  documentId: string
  documentName: string
  getCurrentHtml: () => string
  onCreateSnapshot: (name: string | null) => Promise<SnapshotMeta>
  onRestore: (snapshotId: string) => Promise<void>
  onClose: () => void
}

function SnapshotsModal(props: SnapshotsModalProps): JSX.Element {
  const { documentId, documentName, getCurrentHtml, onCreateSnapshot, onRestore, onClose } = props
  const [snapshots, setSnapshots] = useState<SnapshotMeta[] | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [diffSides, setDiffSides] = useState<{ left: DiffSide; right: DiffSide } | null>(null)
  const [error, setError] = useState<string | null>(null)

  function refresh(): void {
    void window.api.listSnapshots(documentId).then(setSnapshots)
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId])

  async function handleCreate(): Promise<void> {
    setCreating(true)
    try {
      await onCreateSnapshot(newName.trim() || null)
      setNewName('')
      refresh()
    } catch (err) {
      setError(`Couldn't take snapshot: ${err}`)
    } finally {
      setCreating(false)
    }
  }

  async function confirmRestore(): Promise<void> {
    if (!pendingRestoreId) return
    setRestoring(true)
    try {
      await onRestore(pendingRestoreId)
      setPendingRestoreId(null)
      refresh()
    } catch (err) {
      setError(`Couldn't restore snapshot: ${err}`)
    } finally {
      setRestoring(false)
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!pendingDeleteId) return
    await window.api.deleteSnapshot(documentId, pendingDeleteId)
    setSelectedIds((ids) => ids.filter((id) => id !== pendingDeleteId))
    setPendingDeleteId(null)
    refresh()
  }

  function toggleSelected(id: string): void {
    setSelectedIds((ids) => {
      if (ids.includes(id)) return ids.filter((x) => x !== id)
      if (ids.length >= 2) return [ids[1], id]
      return [...ids, id]
    })
  }

  async function compareToCurrent(snapshot: SnapshotMeta): Promise<void> {
    try {
      const html = await window.api.getSnapshotContent(documentId, snapshot.id)
      setDiffSides({ left: { label: labelFor(snapshot), html }, right: { label: 'Current', html: getCurrentHtml() } })
    } catch (err) {
      setError(`Couldn't load snapshot: ${err}`)
    }
  }

  async function compareSelected(): Promise<void> {
    if (!snapshots || selectedIds.length !== 2) return
    const a = snapshots.find((s) => s.id === selectedIds[0])
    const b = snapshots.find((s) => s.id === selectedIds[1])
    if (!a || !b) return
    const [older, newer] = a.timestamp <= b.timestamp ? [a, b] : [b, a]
    try {
      const [olderHtml, newerHtml] = await Promise.all([
        window.api.getSnapshotContent(documentId, older.id),
        window.api.getSnapshotContent(documentId, newer.id)
      ])
      setDiffSides({ left: { label: labelFor(older), html: olderHtml }, right: { label: labelFor(newer), html: newerHtml } })
    } catch (err) {
      setError(`Couldn't load snapshots: ${err}`)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal snapshots-modal" onClick={(e) => e.stopPropagation()}>
        <div className="backups-modal-header">
          <h2 className="modal-title">Snapshots — {documentName}</h2>
          <button type="button" className="icon-close-button" title="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <p className="modal-message">
          Manually capture this document&apos;s current content and formatting. Restoring saves the current
          state as a new snapshot first, so it&apos;s never destructive.
        </p>

        <div className="snapshots-new-row">
          <input
            type="text"
            className="snapshots-name-input"
            placeholder="Name (optional)"
            value={newName}
            disabled={creating}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !creating) void handleCreate()
            }}
          />
          <button type="button" className="backups-restore-button" disabled={creating} onClick={() => void handleCreate()}>
            {creating ? 'Saving…' : 'Take Snapshot'}
          </button>
        </div>

        {error && <p className="snapshots-error">{error}</p>}

        {snapshots === null ? (
          <p className="backups-empty">Loading…</p>
        ) : snapshots.length === 0 ? (
          <p className="backups-empty">No snapshots yet — take one to capture this document&apos;s current state.</p>
        ) : (
          <>
            <div className="backups-list">
              {snapshots.map((snapshot) => (
                <div key={snapshot.id} className="backups-row snapshots-row">
                  <input
                    type="checkbox"
                    className="snapshots-row-checkbox"
                    checked={selectedIds.includes(snapshot.id)}
                    onChange={() => toggleSelected(snapshot.id)}
                    title="Select to compare"
                  />
                  <div className="snapshots-row-info">
                    <span className="backups-row-date">{formatSnapshotDate(snapshot.timestamp)}</span>
                    <span className="snapshots-row-name">
                      {snapshot.name ?? 'Untitled'}
                      {snapshot.auto && <span className="snapshot-auto-badge">Auto</span>}
                    </span>
                  </div>
                  <div className="snapshots-row-actions">
                    <button type="button" className="backups-restore-button" onClick={() => void compareToCurrent(snapshot)}>
                      Compare to Current
                    </button>
                    <button
                      type="button"
                      className="backups-restore-button"
                      disabled={restoring}
                      onClick={() => setPendingRestoreId(snapshot.id)}
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      className="row-delete-visible"
                      title="Delete snapshot"
                      onClick={() => setPendingDeleteId(snapshot.id)}
                    >
                      <CloseIcon />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="snapshots-compare-bar">
              <button
                type="button"
                className="backups-restore-button"
                disabled={selectedIds.length !== 2}
                onClick={() => void compareSelected()}
              >
                Compare Selected
              </button>
            </div>
          </>
        )}

        {pendingRestoreId && (
          <ConfirmModal
            title="Restore this snapshot?"
            message="The document's current content will be saved as a new 'Before restore' snapshot first, then replaced with the selected snapshot."
            confirmLabel={restoring ? 'Restoring…' : 'Restore'}
            onConfirm={() => void confirmRestore()}
            onCancel={() => setPendingRestoreId(null)}
          />
        )}

        {pendingDeleteId && (
          <ConfirmModal
            title="Delete this snapshot?"
            message="This can't be undone."
            confirmLabel="Delete"
            onConfirm={() => void confirmDelete()}
            onCancel={() => setPendingDeleteId(null)}
          />
        )}

        {diffSides && (
          <SnapshotDiffModal left={diffSides.left} right={diffSides.right} onClose={() => setDiffSides(null)} />
        )}
      </div>
    </div>
  )
}

export default SnapshotsModal
