import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { StoryBibleItem, StoryBibleTypeDef } from '../../shared/storyBible'
import type { MentionStatsSummary } from './mentionUtils'
import { PresenceStrip, countWord, initialsFor, mentionLabel } from './StoryBiblePresence'

interface StoryBibleBrowseGridProps {
  items: StoryBibleItem[]
  types: StoryBibleTypeDef[]
  /** The manuscript in reading order, for the presence strips. */
  documents: { id: string; name: string }[]
  /** Ordered mention statistics per item id, or null while they load. */
  statsByItem: Record<string, MentionStatsSummary>
  onOpenItem: (id: string) => void
  onCreateItem: (typeId: string) => void
  onManageTypes: () => void
}

const UNKNOWN_TYPE_COLOR = 'var(--chrome-text-dim)'

/**
 * The card wall: every entry as a card carrying its portrait, its summary,
 * how often it is mentioned, and where those mentions fall across the
 * manuscript. Grouped by type — the section has no side panel, so the wall is
 * the navigation.
 */
function StoryBibleBrowseGrid(props: StoryBibleBrowseGridProps): JSX.Element {
  const { items, types, documents, statsByItem, onOpenItem, onCreateItem, onManageTypes } = props
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

  function renderCard(item: StoryBibleItem, color: string): JSX.Element {
    const stats = statsByItem[item.id] ?? null
    return (
      <button
        key={item.id}
        type="button"
        className="story-bible-card"
        style={{ '--card-color': color } as CSSProperties}
        onClick={() => onOpenItem(item.id)}
      >
        <span className="story-bible-card-portrait">{initialsFor(item.name)}</span>
        <span className="story-bible-card-name">{item.name || 'Untitled'}</span>
        {item.summary && <span className="story-bible-card-summary">{item.summary}</span>}
        <span className="story-bible-card-foot">
          <PresenceStrip documents={documents} stats={stats} itemName={item.name || 'Untitled'} small />
          <span className="story-bible-card-mentions">{mentionLabel(stats)}</span>
        </span>
      </button>
    )
  }

  const lead =
    items.length === 0
      ? 'Nothing has been added to the Story Bible yet. Add a character, a location, or an object, and it will appear here as a card and be found in the manuscript automatically.'
      : `The Story Bible holds ${countWord(items.length)} ${items.length === 1 ? 'entry' : 'entries'}. Each card shows how often that entry appears in the manuscript and where those appearances fall.`

  return (
    // A fragment, not a wrapper: .story-bible is already the flex column, so
    // the bar and the scroller become its two children directly — which is
    // what makes the bar stay put while the wall scrolls under it. Wrapping
    // them would put the bar back inside the scrolling box.
    <>
      <div className="outliner-toolbar story-bible-browse-toolbar">
        <div className="story-bible-new-item" ref={newPickerRef}>
            <button
              type="button"
              className="submissions-add-button"
              onClick={() => setNewPickerOpen((v) => !v)}
            >
              Add an entry
            </button>
            {newPickerOpen && (
              <div className="story-bible-new-item-popover">
                {types.length === 0 && (
                  <span className="tag-status-filter-empty">
                    There are no types yet. Add one from Manage types.
                  </span>
                )}
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
                    New {type.name.toLowerCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        <button type="button" className="story-bible-manage-types-button" onClick={onManageTypes}>
          Manage types
        </button>
      </div>

      <div className="story-bible-browse">
        {/* The scroller spans the window so its scrollbar sits at the edge;
            the content inside it holds the same page column as every other
            section that has no side panel. */}
        <div className="page-column">
          {/* Deliberately left on the page rather than moved into the bar
              beside the buttons. Measured in the running app: this line needs
              692px populated and 883px empty, against 627px of free bar at a
              900px window and 810px at the default 1100px one — so the empty
              state wraps to two lines below a 1280px window and the populated
              one wraps below 1000px. The bar is 53px like every other
              section's, and keeping it that way matters more than having the
              copy in it. */}
          <p className="story-bible-lead">{lead}</p>

        {groups.map(
          ({ type, items: groupItems }) =>
            groupItems.length > 0 && (
              <div key={type.id} className="story-bible-group">
                <div className="story-bible-group-label">
                  <span className="story-bible-type-swatch" style={{ backgroundColor: type.color }} />
                  {type.name}
                  <span className="story-bible-group-count">
                    {countWord(groupItems.length)} {groupItems.length === 1 ? 'entry' : 'entries'}
                  </span>
                </div>
                <div className="story-bible-grid">{groupItems.map((item) => renderCard(item, type.color))}</div>
              </div>
            )
        )}

        {orphaned.length > 0 && (
          <div className="story-bible-group">
            <div className="story-bible-group-label">
              Unknown type
              <span className="story-bible-group-count">
                {countWord(orphaned.length)} {orphaned.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>
            <div className="story-bible-grid">{orphaned.map((item) => renderCard(item, UNKNOWN_TYPE_COLOR))}</div>
          </div>
        )}
        </div>
      </div>
    </>
  )
}

export default StoryBibleBrowseGrid
