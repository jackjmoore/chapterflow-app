import type { ReadAloudController } from './useReadAloud'
import { CloseIcon } from './icons'

interface ReadAloudBarProps {
  controller: ReadAloudController
  rate: number
  voiceUri: string | null
  hasSelection: boolean
  onChangeRate: (rate: number) => void
  onChangeVoice: (uri: string | null) => void
  onClose: () => void
}

export const MIN_SPEECH_RATE = 0.5
export const MAX_SPEECH_RATE = 2
/** Slightly under the engine's default — SAPI's 1.0 reads a touch brisk for
 *  prose, and this is the rate the ear settles into for fiction. */
export const DEFAULT_SPEECH_RATE = 0.95

function ReadAloudBar(props: ReadAloudBarProps): JSX.Element {
  const { controller, rate, voiceUri, hasSelection, onChangeRate, onChangeVoice, onClose } = props
  const { status, index, total, voices } = controller

  return (
    <div className="read-aloud-bar">
      <div className="read-aloud-transport">
        {status === 'idle' ? (
          <>
            <button
              type="button"
              className="read-aloud-play"
              onClick={() => controller.start(hasSelection ? 'selection' : 'fromCursor')}
              title={hasSelection ? 'Read the selected passage' : 'Read from the cursor'}
            >
              ▶ {hasSelection ? 'Read selection' : 'Read from cursor'}
            </button>
            <button type="button" className="read-aloud-button" onClick={() => controller.start('document')}>
              From start
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="read-aloud-button"
              title="Previous paragraph"
              onClick={() => controller.skip(-1)}
            >
              ⏮
            </button>
            {status === 'playing' ? (
              <button type="button" className="read-aloud-play" onClick={controller.pause} title="Pause">
                ⏸ Pause
              </button>
            ) : (
              <button type="button" className="read-aloud-play" onClick={controller.resume} title="Resume">
                ▶ Resume
              </button>
            )}
            <button
              type="button"
              className="read-aloud-button"
              title="Next paragraph"
              onClick={() => controller.skip(1)}
            >
              ⏭
            </button>
            <button type="button" className="read-aloud-button" onClick={controller.stop} title="Stop">
              ■
            </button>
            <span className="read-aloud-progress">
              {index + 1} / {total}
            </span>
          </>
        )}
      </div>

      <label className="read-aloud-control" title="Playback speed">
        <span>Speed</span>
        <input
          type="range"
          min={MIN_SPEECH_RATE}
          max={MAX_SPEECH_RATE}
          step={0.05}
          value={rate}
          onChange={(e) => onChangeRate(Number(e.target.value))}
        />
        <span className="read-aloud-rate-value">{rate.toFixed(2)}×</span>
      </label>

      {voices.length > 1 && (
        <label className="read-aloud-control" title="Voice installed on this computer">
          <span>Voice</span>
          <select
            className="read-aloud-voice"
            value={voiceUri ?? ''}
            onChange={(e) => onChangeVoice(e.target.value || null)}
          >
            <option value="">System default</option>
            {voices.map((voice) => (
              <option key={voice.uri} value={voice.uri}>
                {voice.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {voices.length === 0 && <span className="read-aloud-note">No system voices found.</span>}

      <button type="button" className="icon-close-button" title="Close read-aloud" onClick={onClose}>
        <CloseIcon />
      </button>
    </div>
  )
}

export default ReadAloudBar
