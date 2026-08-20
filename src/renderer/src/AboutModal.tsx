import { useEffect, useState } from 'react'
import type { UpdateStatus, VersionInfo } from '../../shared/update'
import { CloseIcon } from './icons'

interface AboutModalProps {
  onClose: () => void
  /** Flushes pending edits before the app restarts into the new version —
   *  the same guarantee a normal quit gives. */
  onBeforeInstall: () => Promise<void>
}

function statusLine(status: UpdateStatus): string {
  switch (status.state) {
    case 'idle':
      return 'Updates have not been checked this session.'
    case 'checking':
      return 'Checking for updates…'
    case 'up-to-date':
      return `No update available. Checked ${new Date(status.checkedAt).toLocaleTimeString()}.`
    case 'available':
      return `Version ${status.newVersion} is available.`
    case 'downloading':
      return `Downloading… ${status.percent}%`
    case 'ready':
      return `Version ${status.newVersion} is downloaded and ready to install.`
    case 'error':
      return status.message
  }
}

function AboutModal(props: AboutModalProps): JSX.Element {
  const { onClose, onBeforeInstall } = props
  const [info, setInfo] = useState<VersionInfo | null>(null)
  const [status, setStatus] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    void window.api.getVersionInfo().then(setInfo)
    void window.api.getUpdateStatus().then(setStatus)
    return window.api.onUpdateStatus(setStatus)
  }, [])

  const busy = status?.state === 'checking' || status?.state === 'downloading'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal about-modal" onClick={(e) => e.stopPropagation()}>
        <div className="backups-modal-header">
          <h2 className="modal-title">About ChapterFlow</h2>
          <button type="button" className="icon-close-button" title="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="about-version">
          <span className="about-version-number">{info ? info.version : '—'}</span>
          <span className="about-version-label">{info?.packaged ? 'installed build' : 'development build'}</span>
        </div>

        {info && (
          <p className="about-runtime">
            Electron {info.electron} · Chromium {info.chrome} · Node {info.node}
          </p>
        )}

        <div className="about-update">
          <p className={`about-update-status ${status?.state === 'error' ? 'is-error' : ''}`}>
            {status ? statusLine(status) : 'Updates have not been checked this session.'}
          </p>

          <div className="about-update-actions">
            <button
              type="button"
              className="story-bible-manage-types-button"
              disabled={busy}
              onClick={() => void window.api.checkForUpdates()}
            >
              Check for updates
            </button>

            {/* Downloading is a separate, deliberate step — finding an update
                never starts one on its own. */}
            {status?.state === 'available' && (
              <button
                type="button"
                className="modal-confirm modal-confirm--primary"
                onClick={() => void window.api.downloadUpdate()}
              >
                Download {status.newVersion}
              </button>
            )}

            {status?.state === 'ready' && (
              <button
                type="button"
                className="modal-confirm modal-confirm--primary"
                onClick={() => {
                  void onBeforeInstall().then(() => window.api.installUpdateNow())
                }}
              >
                Restart and install
              </button>
            )}
          </div>

          {status?.state === 'available' && status.releaseNotes && (
            <div className="about-release-notes">{status.releaseNotes}</div>
          )}
        </div>

        <p className="about-data-note">
          Updates replace the application only. Your manuscripts stay in your project folder, and preferences
          and backups are kept separately — neither is touched by installing a new version, or by uninstalling.
        </p>
      </div>
    </div>
  )
}

export default AboutModal
