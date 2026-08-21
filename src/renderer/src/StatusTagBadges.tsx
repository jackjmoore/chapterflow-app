import { useState } from 'react'
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

/**
 * A chip on a binder row: a document's own tag, a tag it contains inline, or a
 * Story Bible item it mentions.
 */
export interface RowChip {
  id: string
  name: string
  color: string
  /** Filled chips are the document's own tags; outlined ones describe what it
   *  merely contains — the distinction predates this component and is kept. */
  filled: boolean
}

/**
 * How many chips a binder row shows before the rest become a count.
 *
 * Two only fits beside a readable title on a wide panel. Measured at the
 * default 260px, two chips plus a status label leave the title about seventy
 * pixels — enough for "1. The Dro…" — and on some rows nothing at all. So the
 * cap follows the row's usable width, the same measure the status badge
 * already uses: two when there is room, one when there is not.
 *
 * What is fixed either way is the row's height and the fact that the count
 * never grows: a row with eight mentions occupies exactly as much as a row
 * with none.
 */
export const MAX_ROW_CHIPS = 2
export const MIN_ROW_CHIPS = 1
/** Usable row width at which a second chip stops costing the title too much. */
export const TWO_CHIP_MIN_WIDTH = 330

export function chipCapFor(usableWidth: number): number {
  return usableWidth >= TWO_CHIP_MIN_WIDTH ? MAX_ROW_CHIPS : MIN_ROW_CHIPS
}

export function RowChips({ chips, cap = MAX_ROW_CHIPS }: { chips: RowChip[]; cap?: number }): JSX.Element | null {
  if (chips.length === 0) return null
  const shown = chips.slice(0, cap)
  const hidden = chips.slice(cap)

  return (
    <span className={`row-chip-row ${cap >= MAX_ROW_CHIPS ? 'is-roomy' : ''}`}>
      {shown.map((chip) => (
        <span
          key={chip.id}
          className={chip.filled ? 'tag-chip' : 'span-tag-rollup-chip'}
          style={chip.filled ? { backgroundColor: chip.color } : { borderColor: chip.color, color: chip.color }}
          title={chip.name}
        >
          {chip.name}
        </span>
      ))}
      {hidden.length > 0 && <ChipOverflow chips={hidden} />}
    </span>
  )
}

/** The "+3". Nothing is lost — hovering lists the rest. The list is positioned
 *  fixed because the binder scrolls, and anything drawn inside that scroller
 *  would be clipped by it. */
function ChipOverflow({ chips }: { chips: RowChip[] }): JSX.Element {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)

  return (
    <span
      className="row-chip-overflow"
      aria-label={`${chips.length} more: ${chips.map((c) => c.name).join(', ')}`}
      onMouseEnter={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        setAt({ left: r.left, top: r.bottom + 4 })
      }}
      onMouseLeave={() => setAt(null)}
    >
      +{chips.length}
      {at && (
        <span className="row-chip-overflow-list" style={{ left: at.left, top: at.top }}>
          {chips.map((chip) => (
            <span
              key={chip.id}
              className={chip.filled ? 'tag-chip' : 'span-tag-rollup-chip'}
              style={chip.filled ? { backgroundColor: chip.color } : { borderColor: chip.color, color: chip.color }}
            >
              {chip.name}
            </span>
          ))}
        </span>
      )}
    </span>
  )
}
