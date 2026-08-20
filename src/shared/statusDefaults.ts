import type { StatusDef } from './binder'

/** Starting stage list for a brand-new project — fully editable afterward
 *  (rename, recolor, add, remove) via Project → Manage Statuses…. */
export const DEFAULT_STATUSES: StatusDef[] = [
  { id: 'status-draft', name: 'Draft', color: '#8a8a8a' },
  { id: 'status-revising', name: 'Revising', color: '#d9a441' },
  { id: 'status-final', name: 'Final', color: '#4b9363' }
]
