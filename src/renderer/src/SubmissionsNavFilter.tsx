import type { Submission, SubmissionStatus } from '../../shared/submissions'

interface SubmissionsNavFilterProps {
  submissions: Submission[]
  statuses: SubmissionStatus[]
  /** null = show everything. Renderer-only state, the same tier as the
   *  Submissions table's own sort — nothing here is persisted. */
  statusFilter: string | null
  /** Icon-only rail mode: the count stands in for the status name. */
  collapsed: boolean
  onChange: (statusId: string | null) => void
}

/**
 * Panel navigation for the Query Tracker: filter the table down to one status.
 * Counts come from the live submission list, so a status nobody has used yet
 * still shows (as 0) rather than disappearing.
 */
function SubmissionsNavFilter(props: SubmissionsNavFilterProps): JSX.Element {
  const { submissions, statuses, statusFilter, collapsed, onChange } = props

  const countFor = (statusId: string): number => submissions.filter((s) => s.statusId === statusId).length

  // Entries whose statusId no longer resolves would otherwise be unreachable
  // through this filter — surfaced as one bucket so they can't hide.
  const knownIds = new Set(statuses.map((s) => s.id))
  const unknownCount = submissions.filter((s) => !knownIds.has(s.statusId)).length

  return (
    <div className={`panel-nav ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="panel-nav-scroll">
        <button
          type="button"
          className={`panel-nav-row panel-nav-row--counted ${statusFilter === null ? 'is-active' : ''}`}
          title={collapsed ? `All — ${submissions.length}` : undefined}
          onClick={() => onChange(null)}
        >
          {!collapsed && <span className="panel-nav-label">All</span>}
          <span className="panel-nav-count">{submissions.length}</span>
        </button>

        {statuses.map((status) => (
          <button
            key={status.id}
            type="button"
            className={`panel-nav-row panel-nav-row--counted ${statusFilter === status.id ? 'is-active' : ''}`}
            title={collapsed ? `${status.name} — ${countFor(status.id)}` : undefined}
            onClick={() => onChange(status.id)}
          >
            {!collapsed && <span className="panel-nav-label">{status.name}</span>}
            <span className="panel-nav-count">{countFor(status.id)}</span>
          </button>
        ))}

        {unknownCount > 0 && (
          <button
            type="button"
            className={`panel-nav-row panel-nav-row--counted ${statusFilter === '__unknown__' ? 'is-active' : ''}`}
            title={collapsed ? `Unknown status — ${unknownCount}` : 'Entries whose status was deleted'}
            onClick={() => onChange('__unknown__')}
          >
            {!collapsed && <span className="panel-nav-label panel-nav-label--dim">Unknown status</span>}
            <span className="panel-nav-count">{unknownCount}</span>
          </button>
        )}
      </div>
    </div>
  )
}

export default SubmissionsNavFilter
