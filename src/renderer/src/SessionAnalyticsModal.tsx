import { useMemo, useState } from 'react'
import type { BinderNode } from '../../shared/binder'
import {
  hourHistogram,
  lengthVsOutput,
  summarize,
  MIN_IDLE_GAP_MINUTES,
  MAX_IDLE_GAP_MINUTES,
  type WritingSession
} from '../../shared/sessions'
import { sprintsForSession, type Sprint } from '../../shared/sprints'
import { collectAllDocuments } from './search/projectSearch'
import { CloseIcon } from './icons'

interface SessionAnalyticsModalProps {
  sessions: WritingSession[]
  sprints: Sprint[]
  tree: BinderNode[]
  idleGapMinutes: number
  onChangeIdleGap: (minutes: number) => void
  onExport: (format: 'csv' | 'json') => void
  onClose: () => void
}

function formatDuration(ms: number): string {
  // Sub-minute stretches are real (a quick fix between long gaps) and reading
  // them as "0m" looks like a bug rather than a short session.
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

const SCATTER_W = 620
const SCATTER_H = 220

/** Session length against words written. A scatter rather than a single
 *  headline number, because the shape is the finding — and the r value is
 *  reported next to its sample size so a strong-looking figure from six
 *  sessions can be read for what it is. */
function LengthOutputScatter({ sessions }: { sessions: WritingSession[] }): JSX.Element {
  const { points, r, sampleSize } = useMemo(() => lengthVsOutput(sessions), [sessions])

  if (points.length === 0) return <p className="session-empty">No sessions yet.</p>

  const maxMinutes = Math.max(...points.map((p) => p.minutes), 1)
  const maxWords = Math.max(...points.map((p) => p.words), 1)
  const minWords = Math.min(...points.map((p) => p.words), 0)
  const span = maxWords - minWords || 1

  const x = (minutes: number): number => 40 + (minutes / maxMinutes) * (SCATTER_W - 60)
  const y = (words: number): number => SCATTER_H - 26 - ((words - minWords) / span) * (SCATTER_H - 50)

  return (
    <div className="session-chart">
      <svg viewBox={`0 0 ${SCATTER_W} ${SCATTER_H}`} className="session-scatter" role="img" aria-label="Session length against words written">
        <line x1={40} y1={SCATTER_H - 26} x2={SCATTER_W - 16} y2={SCATTER_H - 26} className="session-axis" />
        <line x1={40} y1={10} x2={40} y2={SCATTER_H - 26} className="session-axis" />
        <text x={40} y={SCATTER_H - 8} className="session-axis-label">0</text>
        <text x={SCATTER_W - 16} y={SCATTER_H - 8} textAnchor="end" className="session-axis-label">
          {Math.round(maxMinutes)} min
        </text>
        <text x={36} y={16} textAnchor="end" className="session-axis-label">{maxWords}</text>
        <text x={36} y={SCATTER_H - 30} textAnchor="end" className="session-axis-label">{minWords}</text>
        {minWords < 0 && (
          <line x1={40} y1={y(0)} x2={SCATTER_W - 16} y2={y(0)} className="session-axis session-axis--zero" />
        )}
        {points.map((point) => (
          <circle key={point.session.id} cx={x(point.minutes)} cy={y(point.words)} r={3.5} className="session-point">
            <title>
              {`${new Date(point.session.startedAt).toLocaleString()}\n${Math.round(point.minutes)} min, ${point.words} words`}
            </title>
          </circle>
        ))}
      </svg>

      <p className="session-stat-line">
        {r === null
          ? `Not enough sessions yet to say whether length and output are related (${sampleSize} recorded; 3 needed).`
          : `Correlation between session length and words written: r = ${r.toFixed(2)}, across ${sampleSize} sessions.`}
      </p>
    </div>
  )
}

function HourChart({ sessions }: { sessions: WritingSession[] }): JSX.Element {
  const buckets = useMemo(() => hourHistogram(sessions), [sessions])
  const max = Math.max(...buckets.map((b) => b.sessions), 1)

  return (
    <div className="session-chart">
      <div className="session-hours">
        {buckets.map((bucket) => (
          <div key={bucket.hour} className="session-hour">
            <div
              className="session-hour-bar"
              style={{ height: `${(bucket.sessions / max) * 100}%` }}
              title={`${String(bucket.hour).padStart(2, '0')}:00 — ${bucket.sessions} ${
                bucket.sessions === 1 ? 'session' : 'sessions'
              }, ${bucket.words.toLocaleString()} words`}
            />
            {bucket.hour % 3 === 0 && <span className="session-hour-label">{bucket.hour}</span>}
          </div>
        ))}
      </div>
      <p className="session-stat-line">Sessions by the hour they started. Hover a bar for its totals.</p>
    </div>
  )
}

function SessionAnalyticsModal(props: SessionAnalyticsModalProps): JSX.Element {
  const { sessions, sprints, tree, idleGapMinutes, onChangeIdleGap, onExport, onClose } = props
  const [gapDraft, setGapDraft] = useState(String(idleGapMinutes))

  const summary = useMemo(() => summarize(sessions), [sessions])
  const documentNames = useMemo(() => new Map(collectAllDocuments(tree).map((d) => [d.id, d.name])), [tree])
  const recent = useMemo(
    () => [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 12),
    [sessions]
  )

  function commitGap(): void {
    const parsed = Number(gapDraft)
    const clamped = Math.min(MAX_IDLE_GAP_MINUTES, Math.max(MIN_IDLE_GAP_MINUTES, Math.round(parsed || idleGapMinutes)))
    setGapDraft(String(clamped))
    if (clamped !== idleGapMinutes) onChangeIdleGap(clamped)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal session-modal" onClick={(e) => e.stopPropagation()}>
        <div className="backups-modal-header">
          <h2 className="modal-title">Writing Sessions</h2>
          <button type="button" className="icon-close-button" title="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        {/* Deliberately plain: counts and a stated fact, in the same register
            as the word-target and pace readouts. No badges, no praise. */}
        <div className="session-summary">
          <div className="session-summary-cell">
            <span className="session-summary-value">{summary.count}</span>
            <span className="session-summary-label">{summary.count === 1 ? 'session' : 'sessions'} recorded</span>
          </div>
          <div className="session-summary-cell">
            <span className="session-summary-value">{summary.totalWords.toLocaleString()}</span>
            <span className="session-summary-label">net words written</span>
          </div>
          <div className="session-summary-cell">
            <span className="session-summary-value">{formatDuration(summary.totalMs)}</span>
            <span className="session-summary-label">total time</span>
          </div>
          <div className="session-summary-cell">
            <span className="session-summary-value">{formatDuration(summary.medianMinutes * 60000)}</span>
            <span className="session-summary-label">median session</span>
          </div>
        </div>

        <p className="session-streak">
          {summary.streak === 0
            ? 'No writing recorded today or yesterday.'
            : `${summary.streak} consecutive ${summary.streak === 1 ? 'day' : 'days'} with at least one session.`}
        </p>

        <h3 className="session-section-title">Time of day</h3>
        <HourChart sessions={sessions} />

        <h3 className="session-section-title">Session length vs. output</h3>
        <LengthOutputScatter sessions={sessions} />

        <h3 className="session-section-title">Recent sessions</h3>
        {recent.length === 0 ? (
          <p className="session-empty">
            Nothing recorded yet. A session starts when you begin typing and ends after {idleGapMinutes} minutes
            without an edit.
          </p>
        ) : (
          <div className="backups-list session-list">
            {recent.map((session) => (
              <div key={session.id} className="session-row">
                <span className="session-row-when">
                  {new Date(session.startedAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </span>
                <span className="session-row-duration">{formatDuration(session.durationMs)}</span>
                <span className={`session-row-words ${session.netWords < 0 ? 'is-negative' : ''}`}>
                  {session.netWords >= 0 ? '+' : ''}
                  {session.netWords.toLocaleString()} words
                </span>
                {sprintsForSession(sprints, session.id).length > 0 && (
                  <span
                    className="session-row-sprints"
                    title={sprintsForSession(sprints, session.id)
                      .map((s) => `${s.targetMinutes}m planned, ${s.netWords} words`)
                      .join('\n')}
                  >
                    {sprintsForSession(sprints, session.id).length}{' '}
                    {sprintsForSession(sprints, session.id).length === 1 ? 'sprint' : 'sprints'}
                  </span>
                )}
                <span className="session-row-docs" title={session.documentIds.map((id) => documentNames.get(id) ?? 'Deleted document').join(', ')}>
                  {session.documentIds.length === 0
                    ? '—'
                    : session.documentIds.map((id) => documentNames.get(id) ?? 'Deleted document').join(', ')}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="session-footer">
          <label className="overused-control">
            <span>End a session after</span>
            <input
              type="number"
              min={MIN_IDLE_GAP_MINUTES}
              max={MAX_IDLE_GAP_MINUTES}
              className="overused-min-input"
              value={gapDraft}
              onChange={(e) => setGapDraft(e.target.value)}
              onBlur={commitGap}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
            />
            <span>minutes idle</span>
          </label>

          <div className="session-export">
            <button type="button" className="story-bible-manage-types-button" onClick={() => onExport('csv')}>
              Export CSV…
            </button>
            <button type="button" className="story-bible-manage-types-button" onClick={() => onExport('json')}>
              Export JSON…
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SessionAnalyticsModal
