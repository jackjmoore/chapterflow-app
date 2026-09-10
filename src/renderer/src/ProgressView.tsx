import { useEffect, useMemo, useState } from 'react'
import type { BinderNode } from '../../shared/binder'
import type { PaceInfo } from '../../shared/pace'
import type { WritingSession } from '../../shared/sessions'
import { collectAllDocuments } from './search/projectSearch'
import { cumulativeWords, dailyWords, recentDailyWords, weekStartKey, type DayPoint } from './progressCharts'
import { CumulativeChart, Sparkline, WritingCalendar, formatShortDate } from './ProgressChartViews'


interface ProgressViewProps {
  /** Live totals — the same derivations the footer reads. */
  projectWordCount: number
  sessionWordCount: number
  projectWordTarget: number | null
  projectDeadline: string | null
  projectTargetStartDate: string | null
  projectTargetStartCount: number | null
  /** computePace over the same inputs the footer's pace sentence uses. */
  pace: PaceInfo | null
  /** The session record — the app's one historical account of writing.
   *  Everything on the page derives from it; nothing new is tracked. */
  sessions: WritingSession[]
  tree: BinderNode[]
  wordCounts: Record<string, number>
  /** The same save the old Word Target & Deadline modal called. */
  onSaveTarget: (target: number | null, deadline: string | null) => Promise<void>
  /** Repoints pace tracking at a date (start count re-derived by the caller
   *  from the same session history). Null returns to automatic capture. */
  onSaveStartDate: (date: string | null) => Promise<void>
  /** The same per-document setter the Outliner and Corkboard call. */
  onEditWordTarget: (id: string, target: number | null) => void
}

/** Lowercase because they sit mid-sentence in the hero's sub-line. */
const PACE_PHRASES: Record<PaceInfo['status'], string> = {
  complete: 'target reached',
  overdue: 'deadline passed',
  ahead: 'ahead of pace',
  behind: 'behind pace',
  'no-data': 'not enough pace data yet'
}

const PACE_TONE: Record<PaceInfo['status'], 'good' | 'bad' | 'dim'> = {
  complete: 'good',
  ahead: 'good',
  behind: 'bad',
  overdue: 'bad',
  'no-data': 'dim'
}

/** How far back the writing calendar looks — a quarter's worth of weeks. */
const CALENDAR_DAYS = 91

function formatDeadlineLong(key: string): string {
  const date = new Date(key + 'T00:00:00')
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric'
  return date.toLocaleDateString(undefined, options)
}

/**
 * The project's progress as a page: one statement (the live total and how it
 * stands against target, today, pace, and deadline), one hero chart, then a
 * writing calendar, four quiet facts, and the per-document targets. The same
 * saves and the same session-derived data the old sectioned panel had — only
 * the shape changed, toward the manuscript's own register: target controls
 * collapse to a single link, and the numbers read as facts, nothing
 * celebratory.
 *
 * Deliberately project-scoped: cross-project stats live on the landing
 * dashboard and nowhere else.
 */
function ProgressView(props: ProgressViewProps): JSX.Element {
  const {
    projectWordCount,
    sessionWordCount,
    projectWordTarget,
    projectDeadline,
    projectTargetStartDate,
    projectTargetStartCount,
    pace,
    sessions,
    tree,
    wordCounts,
    onSaveTarget,
    onSaveStartDate,
    onEditWordTarget
  } = props

  const [targetDraft, setTargetDraft] = useState(projectWordTarget == null ? '' : String(projectWordTarget))
  const [deadlineDraft, setDeadlineDraft] = useState(projectDeadline ?? '')
  const [startDraft, setStartDraft] = useState(projectTargetStartDate ?? '')

  const [editingDocId, setEditingDocId] = useState<string | null>(null)
  const [docDraft, setDocDraft] = useState('')

  // External changes (another control, project load) refresh the drafts.
  useEffect(() => {
    setTargetDraft(projectWordTarget == null ? '' : String(projectWordTarget))
  }, [projectWordTarget])
  useEffect(() => {
    setDeadlineDraft(projectDeadline ?? '')
  }, [projectDeadline])
  useEffect(() => {
    setStartDraft(projectTargetStartDate ?? '')
  }, [projectTargetStartDate])

  // Everything below derives once per sessions/total change, not per render.
  const daily = useMemo(() => dailyWords(sessions), [sessions])
  const cumulative = useMemo(() => cumulativeWords(sessions, projectWordCount), [sessions, projectWordCount])
  // Recorded history only — recentDailyWords would pad zeros back before the
  // first session ever, and the calendar must not claim days it knows nothing
  // about.
  const calendarDays = useMemo(() => daily.slice(-CALENDAR_DAYS), [daily])
  const spark = useMemo(() => recentDailyWords(sessions, 14), [sessions])

  const thisWeek = useMemo(() => {
    if (daily.length === 0) return 0
    const start = weekStartKey(daily[daily.length - 1].date)
    return daily.filter((d) => d.date >= start).reduce((sum, d) => sum + d.words, 0)
  }, [daily])

  const bestDay = useMemo(
    () =>
      daily.reduce<DayPoint | null>(
        (best, day) => (day.words > 0 && (best == null || day.words > best.words) ? day : best),
        null
      ),
    [daily]
  )

  const daysWritten = useMemo(() => daily.filter((d) => d.words !== 0).length, [daily])

  function commitTarget(): void {
    const target = targetDraft.trim() === '' ? null : Math.max(0, Math.round(Number(targetDraft)))
    void onSaveTarget(Number.isFinite(target ?? 0) ? target : null, deadlineDraft || null)

  }

  const percent =
    projectWordTarget != null && projectWordTarget > 0
      ? Math.min(100, (projectWordCount / projectWordTarget) * 100)
      : null

  const documents = collectAllDocuments(tree)

  function commitDocTarget(id: string): void {
    const value = docDraft.trim() === '' ? null : Math.max(0, Math.round(Number(docDraft)))
    onEditWordTarget(id, Number.isFinite(value ?? 0) ? value : null)
    setEditingDocId(null)
  }

  // The words-a-day fact speaks the pace machinery's numbers when it has
  // them (actualPace is only measured once a start date/count exist), and
  // falls back to a plain average over recorded days otherwise.
  const paceMeasured =
    pace != null &&
    (pace.status === 'ahead' || pace.status === 'behind' || pace.status === 'overdue') &&
    projectTargetStartDate != null &&
    projectTargetStartCount != null
  const avgDaily = daily.length > 0 ? Math.round(daily.reduce((sum, d) => sum + d.words, 0) / daily.length) : 0
  const wordsADay = paceMeasured ? Math.round(pace.actualPace) : avgDaily
  const wordsADaySub =
    pace != null && (pace.status === 'ahead' || pace.status === 'behind')
      ? `${Math.ceil(pace.requiredPace).toLocaleString()} needed`
      : pace?.status === 'overdue'
        ? 'deadline passed'
        : 'daily average'

  // The same three inputs and the same saves the old Target section had, now
  // standing in the sticky bar at the top of the page rather than behind a
  // disclosure link at the foot of it. Always on screen, so there is nothing
  // left here to expand or collapse.
  const targetControls = (
    <div className="outliner-toolbar progress-toolbar">
      <div className="progress-target-row">
        <label>
          Word target
          <input
            type="number"
            min={0}
            placeholder="None"
            value={targetDraft}
            onChange={(e) => setTargetDraft(e.target.value)}
          />
        </label>
        <label>
          Deadline
          <input type="date" value={deadlineDraft} onChange={(e) => setDeadlineDraft(e.target.value)} />
        </label>
        <label title="Pace is measured from this date. Defaults to when the target was first set.">
          Start date
          <input
            type="date"
            value={startDraft}
            onChange={(e) => setStartDraft(e.target.value)}
            onBlur={() => {
              if ((startDraft || null) !== projectTargetStartDate) void onSaveStartDate(startDraft || null)
            }}
          />
        </label>
        <button type="button" className="progress-save-button" onClick={commitTarget}>
          Save
        </button>
        <button
          type="button"
          className="progress-clear-button"
          onClick={() => {
            setTargetDraft('')
            setDeadlineDraft('')
            void onSaveTarget(null, null)
          }}
        >
          Clear
        </button>
      </div>
    </div>
  )

  return (
    // A fragment: .view-pane is already the flex column, so the bar and the
    // scrolling page become its two children directly, which is what keeps
    // the bar in place while the page scrolls under it.
    <>
      {targetControls}
      <div className="progress-view">
      <div className="progress-hero">
        <span className="progress-hero-count">{projectWordCount.toLocaleString()}</span>
        <p className="progress-hero-sub">
          {projectWordTarget != null && <span>of {projectWordTarget.toLocaleString()} words</span>}
          <span>{sessionWordCount.toLocaleString()} today</span>
          {pace != null && (
            <span>
              <i className={`progress-hero-dot progress-hero-dot--${PACE_TONE[pace.status]}`} />
              {PACE_PHRASES[pace.status]}
            </span>
          )}
          {projectDeadline != null && <span>due {formatDeadlineLong(projectDeadline)}</span>}
        </p>
        {percent != null && (
          <>
            <div className="progress-track">
              <div className="progress-track-fill" style={{ width: `${percent}%` }} />
              <div className="progress-track-tick" style={{ left: `${percent}%` }} />
            </div>
            <div className="progress-track-labels">
              <span>
                {projectTargetStartDate != null && projectTargetStartCount != null
                  ? `${formatShortDate(projectTargetStartDate)} · ${projectTargetStartCount.toLocaleString()}`
                  : ''}
              </span>
              <span>{Math.round(percent)}%</span>
              <span>
                {projectDeadline != null ? `${formatShortDate(projectDeadline)} · ` : ''}
                {projectWordTarget!.toLocaleString()}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="progress-section">
        <CumulativeChart
          points={cumulative}
          target={projectWordTarget}
          deadline={projectDeadline}
          startDate={projectTargetStartDate}
          startCount={projectTargetStartCount}
          height={300}
        />
      </div>

      {daily.length > 0 && (
        <>
          <div className="progress-section progress-centered">
            <h2 className="progress-section-title progress-section-title--centered">
              {calendarDays.length} {calendarDays.length === 1 ? 'day' : 'days'} of writing
            </h2>
            <WritingCalendar days={calendarDays} />
          </div>

          <div className="progress-facts">
            <div className="progress-fact">
              <span className="progress-fact-label">This week</span>
              <span className="progress-fact-value">{thisWeek.toLocaleString()}</span>
              <Sparkline days={spark} />
            </div>
            <div className="progress-fact">
              <span className="progress-fact-label">Best day</span>
              <span className="progress-fact-value">{bestDay != null ? bestDay.words.toLocaleString() : '—'}</span>
              <span className="progress-fact-sub">{bestDay != null ? formatShortDate(bestDay.date) : ''}</span>
            </div>
            <div className="progress-fact">
              <span className="progress-fact-label">Days written</span>
              <span className="progress-fact-value">
                {daysWritten} of {daily.length}
              </span>
              <span className="progress-fact-sub">since {formatShortDate(daily[0].date)}</span>
            </div>
            <div className="progress-fact">
              <span className="progress-fact-label">Words a day</span>
              <span className="progress-fact-value">{wordsADay.toLocaleString()}</span>
              <span className="progress-fact-sub">{wordsADaySub}</span>
            </div>
          </div>
        </>
      )}

      <div className="progress-section">
        <h2 className="progress-section-title progress-section-title--centered">Documents</h2>
        {documents.length === 0 && <p className="progress-hint">No documents yet.</p>}
        <div className="progress-docs">
          {documents.map((doc) => {
            const node = findDocumentNode(tree, doc.id)
            const target = node?.wordTarget ?? null
            const count = wordCounts[doc.id] ?? 0
            const docPercent = target != null && target > 0 ? Math.min(100, (count / target) * 100) : null
            return (
              <div key={doc.id} className="progress-doc-row">
                <span className="progress-doc-name">{doc.name || 'Untitled'}</span>
                {editingDocId === doc.id ? (
                  <input
                    autoFocus
                    type="number"
                    min={0}
                    className="progress-doc-input"
                    value={docDraft}
                    onChange={(e) => setDocDraft(e.target.value)}
                    onBlur={() => commitDocTarget(doc.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitDocTarget(doc.id)
                      if (e.key === 'Escape') setEditingDocId(null)
                    }}
                  />
                ) : (
                  <>
                    <span className="progress-doc-count">
                      {count.toLocaleString()}
                      {target != null && <> / {target.toLocaleString()}</>}
                    </span>
                    <span className={`progress-doc-bar ${docPercent == null ? 'is-empty' : ''}`}>
                      {docPercent != null && (
                        <span className="progress-doc-bar-fill" style={{ width: `${docPercent}%` }} />
                      )}
                    </span>
                    <button
                      type="button"
                      className="progress-doc-edit"
                      title="Set a word target for this document"
                      onClick={() => {
                        setDocDraft(target == null ? '' : String(target))
                        setEditingDocId(doc.id)
                      }}
                    >
                      {target == null ? 'Set' : 'Edit'}
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
      </div>
    </>
  )
}

function findDocumentNode(tree: BinderNode[], id: string): (BinderNode & { type: 'document' }) | null {
  for (const node of tree) {
    if (node.type === 'document' && node.id === id) return node
    const found = findDocumentNode(node.children, id)
    if (found) return found
  }
  return null
}

export default ProgressView
