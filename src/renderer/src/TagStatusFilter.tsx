import { useEffect, useRef, useState } from 'react'
import type { StatusDef, TagDef } from '../../shared/binder'
import { OptionsIcon } from './icons'

interface TagStatusFilterProps {
  statuses: StatusDef[]
  tags: TagDef[]
  statusFilter: string[]
  tagFilter: string[]
  onChange: (statusFilter: string[], tagFilter: string[]) => void
}

/** Shared status/tag filter control for the outliner and corkboard toolbars —
 *  one filter dropdown, one implementation, so both views stay in sync on the
 *  same underlying filter state rather than each keeping its own copy. */
function TagStatusFilter(props: TagStatusFilterProps): JSX.Element {
  const { statuses, tags, statusFilter, tagFilter, onChange } = props
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

  function toggleStatus(id: string): void {
    const next = statusFilter.includes(id) ? statusFilter.filter((s) => s !== id) : [...statusFilter, id]
    onChange(next, tagFilter)
  }

  function toggleTag(id: string): void {
    const next = tagFilter.includes(id) ? tagFilter.filter((t) => t !== id) : [...tagFilter, id]
    onChange(statusFilter, next)
  }

  const activeCount = statusFilter.length + tagFilter.length

  return (
    <div className="tag-status-filter" ref={ref}>
      <button
        type="button"
        className={`tag-status-filter-toggle ${activeCount > 0 ? 'is-active' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <OptionsIcon />
        <span>Filter</span>
        {activeCount > 0 && <span className="tag-status-filter-count">{activeCount}</span>}
      </button>
      {open && (
        <div className="tag-status-filter-popover">
          <div className="tag-status-filter-section">
            <span className="find-options-popover-label">Status</span>
            {statuses.length === 0 && <span className="tag-status-filter-empty">No statuses defined.</span>}
            {statuses.map((status) => (
              <label key={status.id} className="tag-status-filter-row">
                <input type="checkbox" checked={statusFilter.includes(status.id)} onChange={() => toggleStatus(status.id)} />
                <span className="tag-status-filter-swatch" style={{ backgroundColor: status.color }} />
                <span>{status.name}</span>
              </label>
            ))}
          </div>
          <div className="tag-status-filter-section">
            <span className="find-options-popover-label">Tags</span>
            {tags.length === 0 && <span className="tag-status-filter-empty">No tags defined.</span>}
            {tags.map((tag) => (
              <label key={tag.id} className="tag-status-filter-row">
                <input type="checkbox" checked={tagFilter.includes(tag.id)} onChange={() => toggleTag(tag.id)} />
                <span className="tag-status-filter-swatch" style={{ backgroundColor: tag.color }} />
                <span>{tag.name}</span>
              </label>
            ))}
          </div>
          {activeCount > 0 && (
            <button type="button" className="tag-status-filter-clear" onClick={() => onChange([], [])}>
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default TagStatusFilter
