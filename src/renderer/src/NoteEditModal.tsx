import { useState } from 'react'

interface NoteEditModalProps {
  title: string
  message: string
  placeholder: string
  initialText: string
  /** Shown only when there's an existing note to remove — inserting a new one
   *  has nothing to delete yet. */
  onDelete?: () => void
  onSave: (text: string) => void
  onClose: () => void
}

/**
 * The text prompt behind both footnotes and comments. One component because
 * the interaction is identical — a body of free text attached to a spot in
 * the manuscript — and two near-identical modals would drift apart.
 *
 * Ctrl+Enter saves: a plain Enter has to stay available for paragraph breaks,
 * since a footnote or comment can reasonably run to more than one line.
 */
function NoteEditModal(props: NoteEditModalProps): JSX.Element {
  const { title, message, placeholder, initialText, onDelete, onSave, onClose } = props
  const [text, setText] = useState(initialText)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{title}</h2>
        <p className="modal-message">{message}</p>
        <textarea
          autoFocus
          className="note-edit-textarea"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              onSave(text)
            }
            if (e.key === 'Escape') onClose()
          }}
        />
        <div className="modal-actions">
          {onDelete && (
            <button type="button" className="modal-cancel modal-cancel--danger" onClick={onDelete}>
              Delete
            </button>
          )}
          <button type="button" className="modal-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-confirm modal-confirm--primary"
            onClick={() => onSave(text)}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

export default NoteEditModal
