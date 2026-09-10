import { useEffect, useState } from 'react'
import type { BinderNode } from '../../shared/binder'
import type { CompiledDraftMeta } from '../../shared/compile'
import type { SnapshotMeta } from '../../shared/snapshot'
import type { Submission, SubmissionStatus } from '../../shared/submissions'
import { collectAllDocuments } from './search/projectSearch'

export type SubmissionDraft = Omit<Submission, 'id' | 'createdAt' | 'updatedAt'>

interface SubmissionEditModalProps {
  /** The entry being edited, or null when adding a new one. */
  existing: Submission | null
  statuses: SubmissionStatus[]
  tree: BinderNode[]
  /** The project's compiled drafts, newest first, for attribution — a real
   *  id-based reference to a stored artifact, the strongest "what was sent". */
  compiles: CompiledDraftMeta[]
  onSave: (draft: SubmissionDraft, captureSnapshot: boolean) => Promise<void>
  onClose: () => void
}

function todayString(): string {
  // Local date, not toISOString(), so "today" doesn't flip a day early or
  // late depending on timezone — same reasoning as the word-count baseline.
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function formatSnapshotLabel(snapshot: SnapshotMeta): string {
  const when = new Date(snapshot.timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
  return `${snapshot.name ?? (snapshot.auto ? 'Automatic' : 'Untitled')} — ${when}`
}

const NEW_SNAPSHOT = '__capture__'

function formatDraftLabel(meta: CompiledDraftMeta): string {
  const when = new Date(meta.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
  return `${meta.name || 'Untitled'} — ${when} · ${meta.format.toUpperCase()}`
}

function SubmissionEditModal(props: SubmissionEditModalProps): JSX.Element {
  const { existing, statuses, tree, compiles, onSave, onClose } = props

  const [recipient, setRecipient] = useState(existing?.recipient ?? '')
  const [dateSent, setDateSent] = useState(existing?.dateSent || todayString())
  const [repliedOn, setRepliedOn] = useState(existing?.repliedOn ?? '')
  const [statusId, setStatusId] = useState(existing?.statusId ?? statuses[0]?.id ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [documentId, setDocumentId] = useState<string>(existing?.documentId ?? '')
  const [snapshotChoice, setSnapshotChoice] = useState<string>(existing?.snapshotId ?? '')
  const [compiledDraftId, setCompiledDraftId] = useState<string>(existing?.compiledDraftId ?? '')
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([])
  const [saving, setSaving] = useState(false)

  const documents = collectAllDocuments(tree)

  // Load the chosen document's snapshots so one can be pinned.
  useEffect(() => {
    if (!documentId) {
      setSnapshots([])
      return
    }
    let cancelled = false
    void window.api.listSnapshots(documentId).then((list) => {
      if (!cancelled) setSnapshots(list)
    })
    return () => {
      cancelled = true
    }
  }, [documentId])

  // Changing the document invalidates any snapshot picked from the old one.
  function handleDocumentChange(nextId: string): void {
    setDocumentId(nextId)
    setSnapshotChoice('')
  }

  async function handleSave(): Promise<void> {
    setSaving(true)
    const chosenDoc = documents.find((d) => d.id === documentId) ?? null
    const chosenDraft = compiles.find((m) => m.id === compiledDraftId) ?? null
    const captureSnapshot = snapshotChoice === NEW_SNAPSHOT
    const draft: SubmissionDraft = {
      recipient: recipient.trim() || 'Untitled',
      dateSent: dateSent || todayString(),
      repliedOn: repliedOn || null,
      statusId,
      notes,
      documentId: documentId || null,
      // A capture is created by the caller (it needs the new snapshot's id),
      // so leave it null here and let onSave fill it in.
      snapshotId: captureSnapshot || !snapshotChoice ? null : snapshotChoice,
      documentNameAtSend: chosenDoc?.name ?? existing?.documentNameAtSend ?? null,
      compiledDraftId: compiledDraftId || null,
      // Same tombstone pattern as documentNameAtSend: the name at attach
      // time, kept for when the id stops resolving.
      compiledDraftNameAtAttach: chosenDraft?.name ?? existing?.compiledDraftNameAtAttach ?? null
    }
    await onSave(draft, captureSnapshot)
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{existing ? 'Edit submission' : 'Log a submission'}</h2>

        <div className="typography-form">
          <label className="typography-field">
            <span>Agent or publisher</span>
            <input
              type="text"
              className="typography-field-input"
              style={{ marginBottom: 0 }}
              autoFocus
              placeholder="Who it went to"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </label>

          <label className="typography-field">
            <span>Date sent</span>
            <input
              type="date"
              className="typography-field-input"
              style={{ marginBottom: 0 }}
              value={dateSent}
              onChange={(e) => setDateSent(e.target.value)}
            />
          </label>

          {/* Left empty until a reply actually arrives. The tracker's reply
              times are only as real as what is entered here, so nothing fills
              this in on the writer's behalf. */}
          <label className="typography-field">
            <span>Date replied</span>
            <input
              type="date"
              className="typography-field-input"
              style={{ marginBottom: 0 }}
              min={dateSent || undefined}
              value={repliedOn}
              onChange={(e) => setRepliedOn(e.target.value)}
            />
            <span className="submission-field-hint">
              Leave this empty until they answer. Filling it in is what lets the tracker say how long
              replies usually take.
            </span>
          </label>

          <label className="typography-field">
            <span>Status</span>
            <select
              className="typography-field-input"
              style={{ marginBottom: 0 }}
              value={statusId}
              onChange={(e) => setStatusId(e.target.value)}
            >
              {statuses.length === 0 && <option value="">No statuses defined</option>}
              {statuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
          </label>

          <label className="typography-field">
            <span>Document sent</span>
            <select
              className="typography-field-input"
              style={{ marginBottom: 0 }}
              value={documentId}
              onChange={(e) => handleDocumentChange(e.target.value)}
            >
              <option value="">None</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.name || 'Untitled'}
                </option>
              ))}
            </select>
          </label>

          {documentId && (
            <label className="typography-field">
              <span>Version sent</span>
              <select
                className="typography-field-input"
                style={{ marginBottom: 0 }}
                value={snapshotChoice}
                onChange={(e) => setSnapshotChoice(e.target.value)}
              >
                <option value="">Live document (changes as you edit it)</option>
                <option value={NEW_SNAPSHOT}>Capture a snapshot now — freezes what was sent</option>
                {snapshots.map((snapshot) => (
                  <option key={snapshot.id} value={snapshot.id}>
                    {formatSnapshotLabel(snapshot)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="typography-field">
            <span>Compiled draft sent</span>
            <select
              className="typography-field-input"
              style={{ marginBottom: 0 }}
              value={compiledDraftId}
              onChange={(e) => setCompiledDraftId(e.target.value)}
            >
              <option value="">None</option>
              {/* An attached draft that was since deleted still needs a row,
                  or opening the modal would silently drop the attribution. */}
              {existing?.compiledDraftId && !compiles.some((m) => m.id === existing.compiledDraftId) && (
                <option value={existing.compiledDraftId}>
                  {existing.compiledDraftNameAtAttach || 'Compiled draft'} (deleted)
                </option>
              )}
              {compiles.map((meta) => (
                <option key={meta.id} value={meta.id}>
                  {formatDraftLabel(meta)}
                </option>
              ))}
            </select>
          </label>

          <label className="typography-field">
            <span>Notes</span>
            <textarea
              className="typography-field-input submission-notes-input"
              placeholder="Anything worth remembering about this one"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-confirm modal-confirm--primary"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? 'Saving…' : existing ? 'Save' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SubmissionEditModal
