import type { TimelineEntry } from '../../shared/timeline'
import PanelNavGlyph from './PanelNavGlyph'

interface TimelineNavListProps {
  entries: TimelineEntry[]
  /** Icon-only rail mode: the sequence number stands in for the entry. */
  collapsed: boolean
  /** Scrolls the board to this entry and flashes it — same reveal contract the
   *  binder's "Reveal in Outliner/Corkboard" uses. */
  onJumpToEntry: (id: string) => void
}

/**
 * Panel navigation for the Continuity Board: the chronology as a compact
 * jump-list. Numbering matches the board's own, since both read the entries
 * array in stored order.
 */
function TimelineNavList(props: TimelineNavListProps): JSX.Element {
  const { entries, collapsed, onJumpToEntry } = props

  return (
    <div className={`panel-nav ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="panel-nav-scroll">
        {entries.length === 0 && !collapsed && <p className="panel-nav-empty">No events yet.</p>}
        {entries.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            className="panel-nav-row panel-nav-row--numbered"
            title={collapsed ? `${index + 1}. ${entry.description || 'Untitled event'}` : undefined}
            onClick={() => onJumpToEntry(entry.id)}
          >
            {collapsed ? (
              <PanelNavGlyph token={String(index + 1)} />
            ) : (
              <>
                <span className="panel-nav-number">{index + 1}</span>
                <span className="panel-nav-stacked">
                  <span className="panel-nav-label">{entry.description || 'Untitled event'}</span>
                  {entry.whenText && <span className="panel-nav-sublabel">{entry.whenText}</span>}
                </span>
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

export default TimelineNavList
