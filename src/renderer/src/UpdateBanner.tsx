import type { UpdateStatus } from '../../shared/update'
import { CloseIcon } from './icons'

interface UpdateBannerProps {
  status: UpdateStatus | null
  onOpenDetails: () => void
  onDismiss: () => void
}

/**
 * A quiet strip, shown only when an update is actually waiting on a decision.
 *
 * It never applies anything itself: the two states it appears in are "one is
 * available" and "one is downloaded and ready", and both hand off to an
 * explicit choice. Dismissing it does not cancel anything — the update stays
 * available under Help.
 */
function UpdateBanner(props: UpdateBannerProps): JSX.Element | null {
  const { status, onOpenDetails, onDismiss } = props
  if (!status || (status.state !== 'available' && status.state !== 'ready')) return null

  const available = status.state === 'available'

  return (
    <div className="update-banner">
      <span className="update-banner-text">
        {available
          ? `Version ${status.newVersion} is available. You are on ${status.version}.`
          : `Version ${status.newVersion} is downloaded. It will be applied when you choose to restart.`}
      </span>
      <button type="button" className="update-banner-action" onClick={onOpenDetails}>
        {available ? 'View update' : 'Restart to install'}
      </button>
      <button type="button" className="icon-close-button" title="Dismiss" onClick={onDismiss}>
        <CloseIcon />
      </button>
    </div>
  )
}

export default UpdateBanner
