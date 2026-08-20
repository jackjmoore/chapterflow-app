/** A submission status. Deliberately name-only — no color: a submission's
 *  state is a fact to read, not something to celebrate, so these render as
 *  plain text everywhere. Ids (not raw strings) are stored on entries, so
 *  renaming a status never orphans history. */
export interface SubmissionStatus {
  id: string
  name: string
}

export interface Submission {
  id: string
  /** Agent or publisher the query went to. */
  recipient: string
  /** YYYY-MM-DD, matching the projectDeadline convention. */
  dateSent: string
  statusId: string
  notes: string
  /** A real binder document id — nulled if that document is deleted. */
  documentId: string | null
  /** A real snapshot id under snapshots/<documentId>/, pinning exactly what
   *  was sent. Null when the submission points at the live document only. */
  snapshotId: string | null
  /** The document's name when it was attached. A tombstone label used only
   *  once documentId no longer resolves — never the lookup mechanism. */
  documentNameAtSend: string | null
  createdAt: string
  updatedAt: string
}

export interface SubmissionState {
  submissions: Submission[]
  statuses: SubmissionStatus[]
}

/** Seeds a new project. Fully editable afterward (add/rename/remove). */
export const DEFAULT_SUBMISSION_STATUSES: SubmissionStatus[] = [
  { id: 'sub-sent', name: 'Sent' },
  { id: 'sub-no-response', name: 'No Response' },
  { id: 'sub-rejected', name: 'Rejected' },
  { id: 'sub-partial', name: 'Requested Partial' },
  { id: 'sub-full', name: 'Requested Full' },
  { id: 'sub-offer', name: 'Offer' },
  { id: 'sub-withdrawn', name: 'Withdrawn' }
]

export type SubmissionSortColumn = 'recipient' | 'dateSent' | 'status'

export interface SubmissionSort {
  column: SubmissionSortColumn
  direction: 'asc' | 'desc'
}
