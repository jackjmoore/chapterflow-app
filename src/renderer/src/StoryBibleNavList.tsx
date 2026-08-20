import { useState } from 'react'
import type { StoryBibleItem, StoryBibleTypeDef } from '../../shared/storyBible'

interface StoryBibleNavListProps {
  items: StoryBibleItem[]
  types: StoryBibleTypeDef[]
  /** Which sheet is open in the main area, so the list can mark it. Owned by
   *  StoryBibleView — this list reports clicks upward rather than keeping a
   *  second copy of the selection. */
  selectedItemId: string | null
  /** Icon-only rail mode: type dots only, names carried by the tooltip. */
  collapsed: boolean
  onOpenItem: (id: string) => void
}

/**
 * Panel navigation for the Story Bible section: the same items the browse grid
 * shows, as a flat list you can keep open beside a sheet. Grouped by type in
 * the type list's own order, matching StoryBibleBrowseGrid.
 */
function StoryBibleNavList(props: StoryBibleNavListProps): JSX.Element {
  const { items, types, selectedItemId, collapsed, onOpenItem } = props
  const [filter, setFilter] = useState('')

  // The filter box has nowhere to go in an icon rail, so a stale filter would
  // silently hide items with no visible cause. Collapsed shows everything.
  const query = collapsed ? '' : filter.trim().toLowerCase()
  // Aliases are searchable too — the same text the editor's mention detection
  // matches on, so looking up "the Captain" finds the item it resolves to.
  const visible = query
    ? items.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.aliases.some((alias) => alias.toLowerCase().includes(query))
      )
    : items

  const knownTypeIds = new Set(types.map((t) => t.id))
  const groups = types
    .map((type) => ({ type, members: visible.filter((i) => i.typeId === type.id) }))
    .filter((g) => g.members.length > 0)
  const orphaned = visible.filter((i) => !knownTypeIds.has(i.typeId))

  function row(item: StoryBibleItem, color: string): JSX.Element {
    return (
      <button
        key={item.id}
        type="button"
        className={`panel-nav-row ${selectedItemId === item.id ? 'is-active' : ''}`}
        title={collapsed ? item.name || 'Untitled' : undefined}
        onClick={() => onOpenItem(item.id)}
      >
        <span className="panel-nav-dot" style={{ background: color }} />
        {!collapsed && <span className="panel-nav-label">{item.name || 'Untitled'}</span>}
      </button>
    )
  }

  return (
    <div className={`panel-nav ${collapsed ? 'is-collapsed' : ''}`}>
      {items.length > 0 && !collapsed && (
        <input
          type="text"
          className="panel-nav-filter"
          placeholder="Filter items…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}

      <div className="panel-nav-scroll">
        {items.length === 0 && !collapsed && <p className="panel-nav-empty">No items yet. Add one above.</p>}
        {items.length > 0 && visible.length === 0 && !collapsed && (
          <p className="panel-nav-empty">Nothing matches that.</p>
        )}

        {groups.map(({ type, members }) => (
          <div key={type.id} className="panel-nav-group">
            {!collapsed && <div className="panel-nav-group-label">{type.name}</div>}
            {members.map((item) => row(item, type.color))}
          </div>
        ))}

        {orphaned.length > 0 && (
          <div className="panel-nav-group">
            {!collapsed && <div className="panel-nav-group-label">Uncategorized</div>}
            {orphaned.map((item) => row(item, 'var(--chrome-text-dim)'))}
          </div>
        )}
      </div>
    </div>
  )
}

export default StoryBibleNavList
