import type { SnapshotMeta } from '../../shared/snapshot'

/**
 * How a snapshot's age is written wherever one is named — the Snapshots list
 * and revision mode's bar. Shared so the same snapshot never appears as
 * "2 hours ago" in one place and a bare timestamp in another.
 */
export function formatSnapshotDate(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.round(diffMs / 60000)

  const absolute = date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })

  if (diffMin < 1) return `Just now — ${absolute}`
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago — ${absolute}`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago — ${absolute}`
  const diffDay = Math.round(diffHr / 24)
  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago — ${absolute}`
}

export function snapshotLabel(snapshot: SnapshotMeta): string {
  return `${snapshot.name ?? 'Untitled'} (${formatSnapshotDate(snapshot.timestamp)})`
}
