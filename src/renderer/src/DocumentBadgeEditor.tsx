import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { StatusDef, TagDef } from '../../shared/binder'

interface DocumentBadgeEditorProps {
  statuses: StatusDef[]
  tags: TagDef[]
  statusId: string | null
  tagIds: string[]
  onChangeStatus: (id: string | null) => void
  onChangeTags: (ids: string[]) => void
  children: ReactNode
}

/** Click-to-edit popover for a single document's status + tags — the same
 *  editor is reused from the binder, outliner, and corkboard (via whatever
 *  trigger markup each of those wants to show), so there's exactly one place
 *  that writes statusId/tagIds. */
function DocumentBadgeEditor(props: DocumentBadgeEditorProps): JSX.Element {
  const { statuses, tags, statusId, tagIds, onChangeStatus, onChangeTags, children } = props
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

  function toggleTag(id: string): void {
    const next = tagIds.includes(id) ? tagIds.filter((t) => t !== id) : [...tagIds, id]
    onChangeTags(next)
  }

  return (
    <div className="document-badge-editor" ref={ref}>
      <button
        type="button"
        className="document-badge-trigger"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        {children}
      </button>
      {open && (
        <div className="document-badge-popover" onClick={(e) => e.stopPropagation()}>
          <div className="tag-status-filter-section">
            <span className="find-options-popover-label">Status</span>
            <label className="tag-status-filter-row">
              <input type="radio" name="status-picker" checked={statusId === null} onChange={() => onChangeStatus(null)} />
              <span>None</span>
            </label>
            {statuses.map((status) => (
              <label key={status.id} className="tag-status-filter-row">
                <input
                  type="radio"
                  name="status-picker"
                  checked={statusId === status.id}
                  onChange={() => onChangeStatus(status.id)}
                />
                <span className="tag-status-filter-swatch" style={{ backgroundColor: status.color }} />
                <span>{status.name}</span>
              </label>
            ))}
          </div>
          <div className="tag-status-filter-section">
            <span className="find-options-popover-label">Tags</span>
            {tags.length === 0 && <span className="tag-status-filter-empty">No tags defined yet.</span>}
            {tags.map((tag) => (
              <label key={tag.id} className="tag-status-filter-row">
                <input type="checkbox" checked={tagIds.includes(tag.id)} onChange={() => toggleTag(tag.id)} />
                <span className="tag-status-filter-swatch" style={{ backgroundColor: tag.color }} />
                <span>{tag.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default DocumentBadgeEditor
