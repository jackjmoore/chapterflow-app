import { useState } from 'react'
import type { LexiconEntry } from '../../shared/lexicon'
import PanelNavGlyph, { initialOf } from './PanelNavGlyph'

interface LexiconNavListProps {
  entries: LexiconEntry[]
  /** Icon-only rail mode: initials only, names carried by the tooltip. */
  collapsed: boolean
  /** Hover-flyout mode: names only, no filter box. */
  compact?: boolean
  onJumpToEntry: (id: string) => void
}

/**
 * Panel navigation for the Lexicon: the project's words as a jump-list,
 * matching the shape the Story Bible and Continuity lists already use.
 */
function LexiconNavList(props: LexiconNavListProps): JSX.Element {
  const { entries, collapsed, compact, onJumpToEntry } = props
  const [filter, setFilter] = useState('')

  // No room for a filter box in the rail or the flyout, and a stale filter
  // there would hide words with no visible cause.
  const query = collapsed || compact ? '' : filter.trim().toLowerCase()
  const visible = query ? entries.filter((e) => e.word.toLowerCase().includes(query)) : entries

  return (
    <div className={`panel-nav ${collapsed ? 'is-collapsed' : ''}`}>
      {entries.length > 0 && !collapsed && !compact && (
        <input
          type="text"
          className="panel-nav-filter"
          placeholder="Filter words…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}

      <div className="panel-nav-scroll">
        {entries.length === 0 && !collapsed && (
          <p className="panel-nav-empty">No words yet.</p>
        )}
        {entries.length > 0 && visible.length === 0 && !collapsed && (
          <p className="panel-nav-empty">Nothing matches that.</p>
        )}

        {visible.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="panel-nav-row"
            title={collapsed ? entry.word : undefined}
            onClick={() => onJumpToEntry(entry.id)}
          >
            {collapsed ? (
              <PanelNavGlyph token={initialOf(entry.word)} />
            ) : (
              <span className="panel-nav-stacked">
                <span className="panel-nav-label">{entry.word}</span>
                {entry.pronunciation && <span className="panel-nav-sublabel">{entry.pronunciation}</span>}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

export default LexiconNavList
