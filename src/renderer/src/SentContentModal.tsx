import { useEffect } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { createEditorExtensions } from './editorExtensions'

interface SentContentModalProps {
  title: string
  /** Null while loading; a string once resolved. */
  html: string | null
  /** Set when the referenced content could not be loaded (e.g. the snapshot
   *  was deleted after this submission was logged). */
  error: string | null
  onClose: () => void
}

/** Renders what was actually sent. Uses a read-only editor instance rather
 *  than injecting raw HTML — same extensions as the real editor, so the
 *  formatting renders exactly as it did when it was written, and the app
 *  keeps its no-raw-HTML-injection property. */
function SentContentModal(props: SentContentModalProps): JSX.Element {
  const { title, html, error, onClose } = props
  const editor = useEditor({
    extensions: createEditorExtensions(),
    content: '',
    editable: false
  })

  useEffect(() => {
    if (editor && html != null) editor.commands.setContent(html, false)
  }, [editor, html])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{title}</h2>
        {error ? (
          <p className="modal-message">{error}</p>
        ) : html == null ? (
          <p className="modal-message">Loading…</p>
        ) : (
          <div className="sent-content-body editor">
            <EditorContent editor={editor} />
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="modal-confirm modal-confirm--primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default SentContentModal
