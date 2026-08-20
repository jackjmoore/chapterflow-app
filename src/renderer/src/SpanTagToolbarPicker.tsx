import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import type { TagDef } from '../../shared/binder'
import { TagSpanIcon } from './icons'

interface SpanTagToolbarPickerProps {
  editor: Editor | null
  tags: TagDef[]
}

/** Toolbar control for tagging the current text selection — reuses the same
 *  project tag palette (name + color) document-level tagging already uses,
 *  just applied to a run of text instead of a whole document. Deliberately
 *  a separate control from the document-level tag editor: these write to
 *  completely different places (a ProseMirror mark in the editor's own
 *  transaction stream vs. a DocumentNode.tagIds array over IPC). */
function SpanTagToolbarPicker(props: SpanTagToolbarPickerProps): JSX.Element {
  const { editor, tags } = props
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  const hasSelection = !!editor && !editor.state.selection.empty

  function toggle(tagId: string): void {
    editor?.chain().focus().toggleSpanTag(tagId).run()
  }

  return (
    <div className="document-badge-editor span-tag-picker" ref={ref}>
      <button
        type="button"
        className="span-tag-picker-trigger"
        title={hasSelection ? 'Tag selected text' : 'Select text to tag it'}
        disabled={!hasSelection}
        onClick={() => setOpen((v) => !v)}
      >
        <TagSpanIcon />
      </button>
      {open && (
        <div className="document-badge-popover span-tag-picker-popover" onClick={(e) => e.stopPropagation()}>
          {tags.length === 0 ? (
            <span className="tag-status-filter-empty">No tags defined yet.</span>
          ) : (
            tags.map((tag) => (
              <label key={tag.id} className="tag-status-filter-row">
                <input
                  type="checkbox"
                  checked={editor?.isActive('spanTag', { tagId: tag.id }) ?? false}
                  onChange={() => toggle(tag.id)}
                />
                <span className="tag-status-filter-swatch" style={{ backgroundColor: tag.color }} />
                <span>{tag.name}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default SpanTagToolbarPicker
