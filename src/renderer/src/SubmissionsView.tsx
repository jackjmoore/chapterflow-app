import { useState } from 'react'
import type { BinderNode } from '../../shared/binder'
import type { Submission, SubmissionSort, SubmissionSortColumn, SubmissionStatus } from '../../shared/submissions'
import { collectAllDocuments } from './search/projectSearch'
import { PlusIcon, TrashIcon } from './icons'

interface SubmissionsViewProps {
  submissions: Submission[]
  statuses: SubmissionStatus[]
  tree: BinderNode[]
  /** From the side panel: a status id, '__unknown__' for entries whose status
   *  was deleted, or null for everything. View-only — no entry is hidden from
   *  the data, just from this render. */
  statusFilter: string | null
  onAdd: () => void
  onEdit: (submission: Submission) => void
  onDelete: (submission: Submission) => void
  onViewSent: (submission: Submission) => void
  onManageStatuses: () => void
}

const COLUMNS: { id: SubmissionSortColumn; label: string }[] = [
  { id: 'recipient', label: 'Agent / Publisher' },
  { id: 'dateSent', label: 'Date Sent' },
  { id: 'status', label: 'Status' }
]

function formatDate(dateSent: string): string {
  if (!dateSent) return '—'
  // Parsed as local, not UTC, so the displayed day matches what was picked.
  const [year, month, day] = dateSent.split('-').map(Number)
  if (!year || !month || !day) return dateSent
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function SubmissionsView(props: SubmissionsViewProps): JSX.Element {
  const { submissions, statuses, tree, statusFilter, onAdd, onEdit, onDelete, onViewSent, onManageStatuses } = props
  const [sort, setSort] = useState<SubmissionSort>({ column: 'dateSent', direction: 'desc' })

  const statusName = (id: string): string => statuses.find((s) => s.id === id)?.name ?? 'Unknown status'
  const documentsById = new Map(collectAllDocuments(tree).map((d) => [d.id, d.name]))

  /** What to show in the Document column. The live name wins while the id
   *  resolves; once it doesn't, the name captured at send time is shown as a
   *  tombstone so the record still reads as a record. */
  function documentLabel(submission: Submission): { text: string; missing: boolean } {
    if (submission.documentId) {
      const live = documentsById.get(submission.documentId)
      if (live !== undefined) return { text: live || 'Untitled', missing: false }
    }
    if (submission.documentNameAtSend) {
      return { text: `${submission.documentNameAtSend} (deleted)`, missing: true }
    }
    return { text: '—', missing: false }
  }

  function handleSort(column: SubmissionSortColumn): void {
    setSort((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    )
  }

  const knownStatusIds = new Set(statuses.map((s) => s.id))
  const filtered = submissions.filter((s) => {
    if (statusFilter === null) return true
    if (statusFilter === '__unknown__') return !knownStatusIds.has(s.statusId)
    return s.statusId === statusFilter
  })

  const sorted = [...filtered].sort((a, b) => {
    const dir = sort.direction === 'asc' ? 1 : -1
    let av: string
    let bv: string
    if (sort.column === 'recipient') {
      av = a.recipient.toLowerCase()
      bv = b.recipient.toLowerCase()
    } else if (sort.column === 'status') {
      av = statusName(a.statusId).toLowerCase()
      bv = statusName(b.statusId).toLowerCase()
    } else {
      // YYYY-MM-DD sorts correctly as a plain string.
      av = a.dateSent
      bv = b.dateSent
    }
    if (av < bv) return -1 * dir
    if (av > bv) return 1 * dir
    return 0
  })

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
          {statusFilter === null
            ? `${submissions.length} ${submissions.length === 1 ? 'entry' : 'entries'}`
            : `${filtered.length} of ${submissions.length} ${submissions.length === 1 ? 'entry' : 'entries'}`}
        </span>
      </div>

      <div className="outliner-table-wrap">
        <table className="outliner-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.id}>
                  <button type="button" className="outliner-sort-button" onClick={() => handleSort(col.id)}>
                    {col.label}
                    {sort.column === col.id && (
                      <span className="outliner-sort-arrow">{sort.direction === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </button>
                </th>
              ))}
              <th>
                <span className="outliner-sort-button outliner-tags-header">Document Sent</span>
              </th>
              <th>
                <span className="outliner-sort-button outliner-tags-header">Notes</span>
              </th>
              <th>
                <span className="outliner-sort-button outliner-tags-header" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="outliner-empty">
                  {submissions.length === 0 ? 'No submissions logged yet.' : 'No entries with that status.'}
                </td>
              </tr>
            )}
            {sorted.map((submission) => {
              const doc = documentLabel(submission)
              return (
                <tr key={submission.id} onDoubleClick={() => onEdit(submission)}>
                  <td>{submission.recipient || 'Untitled'}</td>
                  <td>{formatDate(submission.dateSent)}</td>
                  <td>{statusName(submission.statusId)}</td>
                  <td>
                    <span className={doc.missing ? 'submissions-doc-missing' : undefined}>{doc.text}</span>
                    {submission.snapshotId && <span className="submissions-pinned"> · pinned version</span>}
                  </td>
                  <td className="submissions-notes-cell" title={submission.notes}>
                    {submission.notes || '—'}
                  </td>
                  <td className="submissions-actions-cell">
                    {submission.documentId && (
                      <button
                        type="button"
                        className="outliner-open-button"
                        title="View what was sent"
                        onClick={() => onViewSent(submission)}
                      >
                        View sent
                      </button>
                    )}
                    <button type="button" className="outliner-open-button" onClick={() => onEdit(submission)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="row-delete-visible"
                      title="Delete submission"
                      onClick={() => onDelete(submission)}
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default SubmissionsView
