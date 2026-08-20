import { useEffect, useState } from 'react'
import type { BackupInfo } from '../../shared/backup'
import ConfirmModal from './ConfirmModal'
import { CloseIcon } from './icons'

interface BackupsModalProps {
  onClose: () => void
}

function formatBackupDate(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.round(diffMs / 60000)

  const absolute = date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })

  if (diffMin < 1) return `Just now — ${absolute}`
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago — ${absolute}`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago — ${absolute}`
  const diffDay = Math.round(diffHr / 24)
  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago — ${absolute}`
}

function BackupsModal(props: BackupsModalProps): JSX.Element {
  const { onClose } = props
  const [backups, setBackups] = useState<BackupInfo[] | null>(null)
  const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    window.api.listBackups().then(setBackups)
  }, [])

  async function confirmRestore(): Promise<void> {
    if (!pendingRestoreId) return
    setRestoring(true)
    await window.api.restoreBackup(pendingRestoreId)
    window.location.reload()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal backups-modal" onClick={(e) => e.stopPropagation()}>
        <div className="backups-modal-header">
          <h2 className="modal-title">Backups</h2>
          <button type="button" className="icon-close-button" title="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <p className="modal-message">
          ChapterFlow automatically backs up your project every 15 minutes while you work. Restoring saves
          your current state first, so it&apos;s never destructive.
        </p>

        {backups === null ? (
          <p className="backups-empty">Loading…</p>
        ) : backups.length === 0 ? (
          <p className="backups-empty">No backups yet — one will be created shortly after you start editing.</p>
        ) : (
          <div className="backups-list">
            {backups.map((backup) => (
              <div key={backup.id} className="backups-row">
                <span className="backups-row-date">{formatBackupDate(backup.date)}</span>
                <button
                  type="button"
                  className="backups-restore-button"
                  disabled={restoring}
                  onClick={() => setPendingRestoreId(backup.id)}
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}

        {pendingRestoreId && (
          <ConfirmModal
            title="Restore this backup?"
            message="Your current project state will be saved as a new backup first, then replaced with the selected backup. The app will reload."
            confirmLabel={restoring ? 'Restoring…' : 'Restore'}
            onConfirm={() => void confirmRestore()}
            onCancel={() => setPendingRestoreId(null)}
          />
        )}
      </div>
    </div>
  )
}

export default BackupsModal
