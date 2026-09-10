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
  /**
   * The day a reply arrived, in the same YYYY-MM-DD form. Null while nothing
   * has come back, and undefined on records written before this field existed
   * — treat both as no reply recorded.
   *
   * Recorded, never inferred. `updatedAt` moves on any edit at all, so it
   * cannot stand in for this, and the tracker's reply times are only as real
   * as what was actually entered here.
   */
  repliedOn?: string | null
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
  /** A real compiled-draft id under compiles/ — the strongest form of "what
   *  was sent": the stored artifact is byte-for-byte the file that went out.
   *  Independent of documentId/snapshotId (a query letter document and a
   *  compiled sample can both be attached). Kept (not nulled) if the draft
   *  is later deleted, same as statusId. Undefined on records from before
   *  compiled drafts existed — treat as null. */
  compiledDraftId?: string | null
  /** The draft's name when it was attached — the tombstone label once
   *  compiledDraftId no longer resolves, same pattern as documentNameAtSend. */
  compiledDraftNameAtAttach?: string | null
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
