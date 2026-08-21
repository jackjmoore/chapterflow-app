import type { StatusDef, TagDef } from '../../shared/binder'

/** Same rendering logic used everywhere a document's status/tags show up
 *  (binder, outliner, corkboard) — one place, no duplicated markup.
 *
 *  `compact` drops the label and keeps only the colour, for when the row is
 *  too narrow to carry both a readable title and the word "Revising". The
 *  name moves to the tooltip rather than being lost, so the colour never has
 *  to be decoded from memory. Only the binder passes it; the outliner and
 *  corkboard have the room and stay as they were. */
export function StatusBadge({
  status,
  compact = false
}: {
  status: StatusDef | undefined | null
  compact?: boolean
}): JSX.Element | null {
  if (!status) return null
  if (compact) {
    return <span className="status-dot" style={{ backgroundColor: status.color }} title={status.name} />
  }
  return (
    <span className="status-badge" style={{ backgroundColor: status.color }} title={status.name}>
      {status.name}
    </span>
  )
}

export function TagChips({ tags }: { tags: TagDef[] }): JSX.Element | null {
  if (tags.length === 0) return null
  return (
    <span className="tag-chip-row">
      {tags.map((tag) => (
        <span key={tag.id} className="tag-chip" style={{ backgroundColor: tag.color }}>
          {tag.name}
        </span>
      ))}
    </span>
  )
}

/** Distinct from TagChips on purpose: this document isn't itself tagged —
 *  it merely contains one or more inline spans somewhere inside it that
 *  are. Outlined instead of filled so the two signals never read as one.
 *  Generic over {id,name,color} (not tied to TagDef specifically) so the
 *  Story Bible mention rollup can reuse this exact same rendering rather
 *  than a parallel chip component — see mentionUtils.resolveMentionChips. */
export function SpanTagRollupChips({ tags }: { tags: { id: string; name: string; color: string }[] }): JSX.Element | null {
  if (tags.length === 0) return null
  return (
    <span className="span-tag-rollup-row" title="Contains tagged text">
      {tags.map((tag) => (
        <span key={tag.id} className="span-tag-rollup-chip" style={{ borderColor: tag.color, color: tag.color }}>
          {tag.name}
        </span>
      ))}
    </span>
  )
}

export function resolveStatus(statuses: StatusDef[], statusId: string | null): StatusDef | undefined {
  return statusId ? statuses.find((s) => s.id === statusId) : undefined
}

export function resolveTags(tags: TagDef[], tagIds: string[]): TagDef[] {
  return tagIds.map((id) => tags.find((t) => t.id === id)).filter((t): t is TagDef => !!t)
}
