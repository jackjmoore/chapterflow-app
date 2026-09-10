import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { BinderNode } from '../../shared/binder'
import type { CompiledDraftMeta } from '../../shared/compile'
import type { Submission, SubmissionStatus } from '../../shared/submissions'
import { collectAllDocuments } from './search/projectSearch'
import { PlusIcon } from './icons'
import { usePresence, presenceClass } from './usePresence'

interface SubmissionsViewProps {
  submissions: Submission[]
  statuses: SubmissionStatus[]
  tree: BinderNode[]
  /** For resolving a row's attached compiled draft to its live name. */
  compiles: CompiledDraftMeta[]
  onAdd: () => void
  onEdit: (submission: Submission) => void
  onDelete: (submission: Submission) => void
  onViewSent: (submission: Submission) => void
  onManageStatuses: () => void
  /** Writes the same statusId field the edit modal's dropdown writes — the
   *  row menu is a different control over the same record, not a parallel
   *  state. It replaces the board's drag, which went with the board. */
  onStatusChange: (submissionId: string, statusId: string) => void
}

/** The seeded statuses, which are the only ones whose meaning is known. A
 *  status the writer added themselves could mean anything, so it is never
 *  sorted into one of these groups — see `groupOf`. */
const AWAITING = ['sub-sent', 'sub-no-response']
const REQUESTS = ['sub-partial', 'sub-full', 'sub-offer']
const CLOSED = ['sub-rejected', 'sub-withdrawn']

/** The shortest scale the bars are ever drawn against, so a project whose
 *  queries all went out last week doesn't get full-width bars for a few days
 *  of waiting. */
const MIN_SCALE = 60

function parseDate(dateSent: string): Date | null {
  const [year, month, day] = dateSent.split('-').map(Number)
  if (!year || !month || !day) return null
  // Parsed as local, not UTC, so the displayed day matches what was picked.
  return new Date(year, month - 1, day)
}

function formatDate(dateSent: string): string {
  const date = parseDate(dateSent)
  if (!date) return dateSent || 'no date'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** Whole days between the day it was sent and today. Negative (a date typed
 *  in the future) is clamped, since a bar running backwards would say
 *  something the record does not. */
function daysSince(dateSent: string): number | null {
  const date = parseDate(dateSent)
  if (!date) return null
  const today = new Date()
  const days = Math.floor(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - date.getTime()) / 86400000
  )
  return Math.max(0, days)
}

/** How long the reply took, for the entries where that was recorded. Null
 *  when either date is missing, so nothing is counted that was not entered. */
function replyDays(submission: Submission): number | null {
  const sent = parseDate(submission.dateSent)
  const replied = submission.repliedOn ? parseDate(submission.repliedOn) : null
  if (!sent || !replied) return null
  return Math.max(0, Math.round((replied.getTime() - sent.getTime()) / 86400000))
}

/** Below this many recorded replies, a median is a number about nothing, so
 *  the screen says nothing about typical reply times at all. */
const MIN_REPLIES_FOR_MEDIAN = 3

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

const WORDS = [
  'No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen',
  'Nineteen', 'Twenty'
]

/** Sentences lead with a word rather than a numeral, up to the point where
 *  words stop being easier to read than digits. */
function leadingCount(count: number): string {
  return count <= 20 ? WORDS[count] : String(count)
}

/**
 * The Query Tracker as a waiting list.
 *
 * The one thing the record knows about every query, whatever its status, is
 * how long ago it went out, so that is what the screen is built on: a bar per
 * open query against a shared scale, longest wait first. Queries that have
 * already come back are not on that list at all — a request becomes a
 * sentence, and everything closed collapses behind a link — because they are
 * no longer waiting on anything and were only ever padding out the columns of
 * the board this replaced.
 *
 * Only the seeded statuses are sorted by meaning. A status the writer added
 * themselves is shown in its own group under its own name rather than being
 * guessed at, since "Shelved" is not something this screen can know is closed.
 */
function SubmissionsView(props: SubmissionsViewProps): JSX.Element {
  const {
    submissions,
    statuses,
    tree,
    compiles,
    onAdd,
    onEdit,
    onDelete,
    onViewSent,
    onManageStatuses,
    onStatusChange
  } = props

  const [closedOpen, setClosedOpen] = useState(false)
  const closedPresence = usePresence(closedOpen || null)
  const [statusMenuFor, setStatusMenuFor] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Clicking anywhere else puts the status menu away, the same as the Story
  // Bible's type picker.
  useEffect(() => {
    if (!statusMenuFor) return
    function onDown(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setStatusMenuFor(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [statusMenuFor])

  const documentsById = new Map(collectAllDocuments(tree).map((d) => [d.id, d.name]))
  const compilesById = new Map(compiles.map((m) => [m.id, m.name]))
  const statusById = new Map(statuses.map((s) => [s.id, s]))

  /** Same live-name-then-tombstone contract as documentLabel below. */
  function compiledDraftLabel(submission: Submission): { text: string; missing: boolean } | null {
    if (submission.compiledDraftId) {
      const live = compilesById.get(submission.compiledDraftId)
      if (live !== undefined) return { text: live || 'Untitled', missing: false }
    }
    if (submission.compiledDraftNameAtAttach) {
      return { text: `${submission.compiledDraftNameAtAttach} (deleted)`, missing: true }
    }
    return null
  }

  /** What to show for the sent document. The live name wins while the id
   *  resolves; once it doesn't, the name captured at send time is shown as a
   *  tombstone so the record still reads as a record. */
  function documentLabel(submission: Submission): { text: string; missing: boolean } | null {
    if (submission.documentId) {
      const live = documentsById.get(submission.documentId)
      if (live !== undefined) return { text: live || 'Untitled', missing: false }
    }
    if (submission.documentNameAtSend) {
      return { text: `${submission.documentNameAtSend} (deleted)`, missing: true }
    }
    return null
  }

  function statusName(submission: Submission): string {
    return statusById.get(submission.statusId)?.name ?? 'Unknown status'
  }

  type Group = 'awaiting' | 'requests' | 'closed' | 'other' | 'unknown'
  function groupOf(submission: Submission): Group {
    if (!statusById.has(submission.statusId)) return 'unknown'
    if (AWAITING.includes(submission.statusId)) return 'awaiting'
    if (REQUESTS.includes(submission.statusId)) return 'requests'
    if (CLOSED.includes(submission.statusId)) return 'closed'
    return 'other'
  }

  /** Longest wait first. A row with no date sorts last rather than first,
   *  since an empty date is not a long wait. */
  function byLongestWait(a: Submission, b: Submission): number {
    const left = daysSince(a.dateSent)
    const right = daysSince(b.dateSent)
    if (left === null) return 1
    if (right === null) return -1
    if (left !== right) return right - left
    return a.recipient.localeCompare(b.recipient)
  }

  const inGroup = (group: Group): Submission[] => submissions.filter((s) => groupOf(s) === group).sort(byLongestWait)
  const awaiting = inGroup('awaiting')
  const requests = inGroup('requests')
  const other = inGroup('other')
  const unknown = inGroup('unknown')
  const closed = inGroup('closed')

  // Every bar on the screen is drawn against the same scale, which is what
  // makes two of them comparable at a glance.
  const onBars = [...awaiting, ...other, ...unknown]
  const scale = Math.max(MIN_SCALE, ...onBars.map((s) => daysSince(s.dateSent) ?? 0))
  const oldest = onBars.reduce<number | null>((longest, s) => {
    const days = daysSince(s.dateSent)
    if (days === null) return longest
    return longest === null || days > longest ? days : longest
  }, null)

  // Typical reply time, from the replies that were actually dated. The marker
  // is what makes a bar mean something beyond its own length: it says where
  // this query sits against the ones that already came back.
  const recordedReplies = submissions.map(replyDays).filter((d): d is number => d !== null)
  const median = recordedReplies.length >= MIN_REPLIES_FOR_MEDIAN ? medianOf(recordedReplies) : null
  // Counted over the same queries the leading sentence counts, so the two
  // are never talking about different populations.
  const pastTypical =
    median === null ? 0 : awaiting.filter((s) => (daysSince(s.dateSent) ?? 0) > median).length
  const markerPct = median === null ? null : Math.min(100, (median / scale) * 100)

  /** A row with its menu open has to paint above the rows below it, which
   *  otherwise cover the menu simply by coming later in the document. */
  function menuRowClass(submission: Submission): string {
    return statusMenuFor === submission.id ? 'is-menu-open' : ''
  }

  function renderActions(submission: Submission): JSX.Element {
    const draft = compiledDraftLabel(submission)
    // View works while either reference still resolves — the compiled draft
    // (byte-exact) wins over the document/snapshot when both exist.
    const canViewSent =
      !!(submission.compiledDraftId && compilesById.has(submission.compiledDraftId)) || !!submission.documentId
    return (
      <div className="submission-actions">
        {canViewSent && (
          <button
            type="button"
            className="outliner-open-button"
            title={draft ? 'Open the draft that was sent' : 'Open what was sent'}
            onClick={() => onViewSent(submission)}
          >
            View what was sent
          </button>
        )}
        <div className="submission-status-menu-wrap" ref={statusMenuFor === submission.id ? menuRef : undefined}>
          <button
            type="button"
            className="outliner-open-button"
            onClick={() => setStatusMenuFor(statusMenuFor === submission.id ? null : submission.id)}
          >
            Change status
          </button>
          {statusMenuFor === submission.id && (
            <div className="submission-status-menu">
              {statuses.map((status) => (
                <button
                  key={status.id}
                  type="button"
                  className={`submission-status-menu-row ${
                    status.id === submission.statusId ? 'is-current' : ''
                  }`}
                  onClick={() => {
                    if (status.id !== submission.statusId) onStatusChange(submission.id, status.id)
                    setStatusMenuFor(null)
                  }}
                >
                  {status.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="outliner-open-button" onClick={() => onEdit(submission)}>
          Edit
        </button>
        <button
          type="button"
          className="outliner-open-button submission-delete-action"
          onClick={() => onDelete(submission)}
        >
          Delete
        </button>
      </div>
    )
  }

  /** What was sent, under the recipient's name. */
  function renderSent(submission: Submission): JSX.Element | null {
    const draft = compiledDraftLabel(submission)
    const doc = documentLabel(submission)
    if (!draft && !doc) return null
    return (
      <span className="submission-sent-label">
        {draft && <span className={draft.missing ? 'submissions-doc-missing' : undefined}>{draft.text}</span>}
        {draft && doc && ', '}
        {doc && (
          <>
            <span className={doc.missing ? 'submissions-doc-missing' : undefined}>{doc.text}</span>
            {submission.snapshotId && <span className="submissions-pinned"> · pinned version</span>}
          </>
        )}
      </span>
    )
  }

  function renderBar(submission: Submission): JSX.Element {
    const days = daysSince(submission.dateSent)
    const pct = days === null ? 0 : Math.min(100, (days / scale) * 100)
    const sent = renderSent(submission)
    return (
      <div key={submission.id} className={`submission-wait-row ${menuRowClass(submission)}`}>
        <div className="submission-wait-who">
          <span className="submission-wait-name">{submission.recipient || 'Untitled'}</span>
          <span className="submission-wait-meta">
            {statusName(submission)}
            {sent && <> · {sent}</>}
          </span>
        </div>

        <div className="submission-wait-track" title={`Sent ${formatDate(submission.dateSent)}`}>
          <div className="submission-wait-fill" style={{ '--wait-pct': `${pct.toFixed(1)}%` } as CSSProperties} />
          {markerPct !== null && (
            <span
              className="submission-wait-mark"
              style={{ '--mark-pct': `${markerPct.toFixed(1)}%` } as CSSProperties}
            />
          )}
        </div>

        <div className="submission-wait-days">
          {days === null ? 'No date' : plural(days, 'day', 'days')}
        </div>

        {renderActions(submission)}
      </div>
    )
  }

  /** A query that came back. The wait is over, so it reads as a sentence
   *  rather than as a bar. */
  function renderRequest(submission: Submission): JSX.Element {
    const days = daysSince(submission.dateSent)
    const took = replyDays(submission)
    const what =
      submission.statusId === 'sub-offer'
        ? 'has made an offer of representation'
        : submission.statusId === 'sub-full'
          ? 'has asked for the full manuscript'
          : 'has asked for a partial'
    // With a reply date recorded there is something better to say than how
    // long ago the query went out: how long they took.
    const sentPhrase =
      took !== null
        ? `They answered ${plural(took, 'day', 'days')} after the query went out on ${formatDate(submission.dateSent)}.`
        : days === null
          ? 'The query has no date recorded.'
          : `The query went out on ${formatDate(submission.dateSent)}, ${plural(days, 'day', 'days')} ago.`
    return (
      <div key={submission.id} className={`submission-request ${menuRowClass(submission)}`}>
        <div className="submission-request-line">
          <b>{submission.recipient || 'Untitled'}</b> {what}. {sentPhrase}
        </div>
        {submission.notes && <div className="submission-request-notes">{submission.notes}</div>}
        {renderActions(submission)}
      </div>
    )
  }

  function renderClosed(submission: Submission): JSX.Element {
    const sent = renderSent(submission)
    return (
      <div key={submission.id} className={`submission-closed-row ${menuRowClass(submission)}`}>
        <div className="submission-wait-who">
          <span className="submission-wait-name">{submission.recipient || 'Untitled'}</span>
          <span className="submission-wait-meta">
            {statusName(submission)}
            {sent && <> · {sent}</>}
          </span>
        </div>
        <div className="submission-closed-date">
          Sent {formatDate(submission.dateSent)}
          {replyDays(submission) !== null && (
            <> · answered after {plural(replyDays(submission) as number, 'day', 'days')}</>
          )}
        </div>
        {renderActions(submission)}
      </div>
    )
  }

  const section = (name: string, note: string, rows: JSX.Element[]): JSX.Element | null =>
    rows.length === 0 ? null : (
      <>
        <div className="submission-section-head">
          <span className="submission-section-name">{name}</span>
          {note && <span className="submission-section-note">{note}</span>}
        </div>
        {rows}
      </>
    )

  const lead =
    awaiting.length === 0
      ? 'No queries are waiting on a reply.'
      : `${leadingCount(awaiting.length)} ${awaiting.length === 1 ? 'query is' : 'queries are'} still waiting on a reply.`

  const subParts: string[] = []
  if (oldest !== null && awaiting.length > 0) subParts.push(`The longest has been out for ${plural(oldest, 'day', 'days')}.`)
  if (requests.length > 0) {
    subParts.push(
      `${leadingCount(requests.length)} ${requests.length === 1 ? 'has' : 'have'} come back with a request.`
    )
  }
  if (closed.length > 0) subParts.push(`${leadingCount(closed.length)} ${closed.length === 1 ? 'is' : 'are'} closed.`)
  // Only from the replies that were dated, and only once there are enough of
  // them for a middle value to mean anything.
  if (median !== null) {
    subParts.push(
      `Of the ${leadingCount(recordedReplies.length).toLowerCase()} dated replies, half came within about ${plural(median, 'day', 'days')}.`
    )
    if (pastTypical > 0) {
      subParts.push(
        `${leadingCount(pastTypical)} of the queries still waiting ${pastTypical === 1 ? 'has' : 'have'} been out longer than that.`
      )
    }
  }

  return (
    <div className="outliner submissions">
      <div className="outliner-toolbar">
        <button type="button" className="submissions-add-button" onClick={onAdd}>
          <PlusIcon /> Log a submission
        </button>
        <button type="button" className="story-bible-manage-types-button" onClick={onManageStatuses}>
          Manage Statuses…
        </button>
        <span className="submissions-count">
          {plural(submissions.length, 'entry', 'entries')}
        </span>
      </div>

      <div className="submissions-scroll">
        {submissions.length === 0 ? (
          <div className="submissions-empty">
            <p>No queries have been logged yet. Log one with the date it was sent and what was sent with it.</p>
            <button type="button" className="submissions-add-button" onClick={onAdd}>
              <PlusIcon /> Log a submission
            </button>
          </div>
        ) : (
          <div className="submissions-measure">
            <p className="submission-lead">{lead}</p>
            {subParts.length > 0 && <p className="submission-sub">{subParts.join(' ')}</p>}

            {section('Awaiting a reply', 'Longest wait first.', awaiting.map(renderBar))}
            {section('Other statuses', 'Statuses added to this project.', other.map(renderBar))}
            {section(
              'Unknown status',
              'The status these were logged under has been deleted.',
              unknown.map(renderBar)
            )}

            {/* The scale every bar above is drawn against, and where the
                typical reply falls on it. Laid out on the same grid as a row
                so the labels sit under the track rather than under the page. */}
            {onBars.length > 0 && (
              <div className="submission-axis">
                <span />
                <span className="submission-axis-scale">
                  {median !== null && markerPct !== null && (
                    <span className="submission-axis-mark" style={{ left: `${markerPct.toFixed(1)}%` }}>
                      {plural(median, 'day', 'days')}, the median reply
                    </span>
                  )}
                  <span className="submission-axis-end">{plural(scale, 'day', 'days')}</span>
                </span>
                <span />
                <span />
              </div>
            )}

            {section('Requests', 'Partial, full, or an offer.', requests.map(renderRequest))}

            {closed.length > 0 && (
              <>
                {/* section() returns a fragment, so the presence classes need
                    a box of their own. .submissions-measure is block flow, so
                    one more block child changes no layout. */}
                {closedPresence.rendered && (
                  <div className={presenceClass(closedPresence.visible)}>
                    {section('Closed', 'Rejected or withdrawn.', closed.map(renderClosed))}
                  </div>
                )}
                <button
                  type="button"
                  className="submission-disclosure"
                  onClick={() => setClosedOpen((open) => !open)}
                >
                  {closedOpen
                    ? 'Hide closed queries'
                    : `Show ${plural(closed.length, 'closed query', 'closed queries')}`}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default SubmissionsView
