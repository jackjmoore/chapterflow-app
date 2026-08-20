import { useState } from 'react'
import {
  sprintResultLine,
  SPRINT_PRESETS_MINUTES,
  MIN_SPRINT_MINUTES,
  MAX_SPRINT_MINUTES,
  type Sprint
} from '../../shared/sprints'

interface SprintStartModalProps {
  softLockout: boolean
  chime: boolean
  onChangePreferences: (next: { softLockout: boolean; chime: boolean }) => void
  onStart: (minutes: number) => void
  onClose: () => void
}

export function SprintStartModal(props: SprintStartModalProps): JSX.Element {
  const { softLockout, chime, onChangePreferences, onStart, onClose } = props
  const [custom, setCustom] = useState('')

  function startCustom(): void {
    const parsed = Math.round(Number(custom))
    if (!Number.isFinite(parsed) || parsed < MIN_SPRINT_MINUTES) return
    onStart(Math.min(MAX_SPRINT_MINUTES, parsed))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal sprint-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Start a sprint</h2>

        <div className="sprint-presets">
          {SPRINT_PRESETS_MINUTES.map((minutes) => (
            <button key={minutes} type="button" className="sprint-preset" onClick={() => onStart(minutes)}>
              <span className="sprint-preset-value">{minutes}</span>
              <span className="sprint-preset-unit">minutes</span>
            </button>
          ))}
        </div>

        <div className="sprint-custom">
          <input
            type="number"
            min={MIN_SPRINT_MINUTES}
            max={MAX_SPRINT_MINUTES}
            className="typography-field-input"
            style={{ marginBottom: 0 }}
            placeholder="Custom minutes…"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                startCustom()
              }
            }}
          />
          <button type="button" className="modal-confirm" onClick={startCustom} disabled={!custom.trim()}>
            Start
          </button>
        </div>

        <div className="sprint-options">
          <label className="overused-control">
            <input
              type="checkbox"
              checked={softLockout}
              onChange={(e) => onChangePreferences({ softLockout: e.target.checked, chime })}
            />
            <span>Dim the rest of the app while the sprint runs</span>
          </label>
          <label className="overused-control">
            <input
              type="checkbox"
              checked={chime}
              onChange={(e) => onChangePreferences({ softLockout, chime: e.target.checked })}
            />
            <span>Play a tone when it finishes</span>
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

interface SprintResultModalProps {
  sprint: Sprint
  onStartAnother: () => void
  onClose: () => void
}

/** The end-of-sprint report. One sentence of fact, plus the plain context of
 *  what was planned — no praise, no comparison, no exclamation. */
export function SprintResultModal(props: SprintResultModalProps): JSX.Element {
  const { sprint, onStartAnother, onClose } = props
  const ranMinutes = Math.max(1, Math.round(sprint.durationMs / 60000))

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal sprint-result-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{sprint.completed ? 'Sprint finished' : 'Sprint stopped'}</h2>

        <p className="sprint-result-line">{sprintResultLine(sprint)}</p>

        <p className="sprint-result-context">
          {sprint.completed
            ? `Planned ${sprint.targetMinutes} ${sprint.targetMinutes === 1 ? 'minute' : 'minutes'}.`
            : `Planned ${sprint.targetMinutes} ${sprint.targetMinutes === 1 ? 'minute' : 'minutes'}, ran ${ranMinutes}.`}
          {sprint.sessionId === null && ' No writing activity was recorded, so this sprint is not attached to a session.'}
        </p>

        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onStartAnother}>
            Start another
          </button>
          <button type="button" className="modal-confirm modal-confirm--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
