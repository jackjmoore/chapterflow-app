import { useEffect, useRef, useState } from 'react'
import type { StoryBibleItem, StoryBibleTypeDef } from '../../shared/storyBible'
import { PlusIcon, StoryBibleViewIcon } from './icons'

interface StoryBibleBrowseGridProps {
  items: StoryBibleItem[]
  types: StoryBibleTypeDef[]
  onOpenItem: (id: string) => void
  onCreateItem: (typeId: string) => void
  onManageTypes: () => void
}

const UNKNOWN_TYPE_COLOR = 'var(--chrome-text-dim)'

function StoryBibleBrowseGrid(props: StoryBibleBrowseGridProps): JSX.Element {
  const { items, types, onOpenItem, onCreateItem, onManageTypes } = props
  const [newPickerOpen, setNewPickerOpen] = useState(false)
  const newPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!newPickerOpen) return
    function handlePointerDown(e: MouseEvent): void {
      if (newPickerRef.current && !newPickerRef.current.contains(e.target as Node)) setNewPickerOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [newPickerOpen])

  const groups = types.map((type) => ({ type, items: items.filter((i) => i.typeId === type.id) }))
  const knownTypeIds = new Set(types.map((t) => t.id))
  const orphaned = items.filter((i) => !knownTypeIds.has(i.typeId))

  return (
    <div className="story-bible-browse">
      <div className="story-bible-browse-toolbar">
        <div className="story-bible-new-item" ref={newPickerRef}>
          <button type="button" className="story-bible-new-item-button" onClick={() => setNewPickerOpen((v) => !v)}>
            <PlusIcon /> New…
          </button>
          {newPickerOpen && (
            <div className="story-bible-new-item-popover">
              {types.length === 0 && <span className="tag-status-filter-empty">No types yet — add one below.</span>}
              {types.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  className="story-bible-type-popover-row"
                  onClick={() => {
                    onCreateItem(type.id)
                    setNewPickerOpen(false)
                  }}
                >
                  <span className="story-bible-type-swatch" style={{ backgroundColor: type.color }} />
                  {type.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="story-bible-manage-types-button" onClick={onManageTypes}>
          Manage Types…
        </button>
      </div>

      <div className="story-bible-browse-scroll">
        {items.length === 0 && (
          <div className="story-bible-browse-empty">
            <StoryBibleViewIcon />
            <span className="story-bible-browse-empty-title">Nothing in the Story Bible yet</span>
            <span>
              Characters, locations and objects you record here are recognised in your manuscript as you write.
            </span>
          </div>
        )}

        {groups.map(
          ({ type, items: groupItems }) =>
            groupItems.length > 0 && (
              <div key={type.id} className="story-bible-group">
                <div className="story-bible-group-label">
                  <span className="story-bible-type-swatch" style={{ backgroundColor: type.color }} />
                  {type.name}
                </div>
                <div className="story-bible-grid">
                  {groupItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="story-bible-card"
                      onClick={() => onOpenItem(item.id)}
                    >
                      <span className="story-bible-card-type-pill" style={{ backgroundColor: type.color }}>
                        {type.name}
                      </span>
                      <span className="story-bible-card-name">{item.name || 'Untitled'}</span>
                      {item.summary && <span className="story-bible-card-summary">{item.summary}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )
        )}

        {orphaned.length > 0 && (
          <div className="story-bible-group">
            <div className="story-bible-group-label">Unknown type</div>
            <div className="story-bible-grid">
              {orphaned.map((item) => (
                <button key={item.id} type="button" className="story-bible-card" onClick={() => onOpenItem(item.id)}>
                  <span className="story-bible-card-type-pill" style={{ backgroundColor: UNKNOWN_TYPE_COLOR }}>
                    Unknown
                  </span>
                  <span className="story-bible-card-name">{item.name || 'Untitled'}</span>
                  {item.summary && <span className="story-bible-card-summary">{item.summary}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default StoryBibleBrowseGrid
