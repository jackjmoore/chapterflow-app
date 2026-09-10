import { useLayoutEffect, useRef, useState } from 'react'
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

function chipElement(chip: RowChip): JSX.Element {
  return (
    <span
      key={chip.id}
      className={chip.filled ? 'tag-chip' : 'span-tag-rollup-chip'}
      style={chip.filled ? { backgroundColor: chip.color } : { borderColor: chip.color, color: chip.color }}
      title={chip.name}
    >
      {chip.name}
    </span>
  )
}

/**
 * At most ONE visible chip, everything else always a count — and the chip
 * itself is conditional on measured room, never the title.
 *
 * The sacrifice order under width pressure is fixed and runs opposite to
 * importance: title > status mark > the one chip > "+N". The title renders
 * at its natural width and is never shortened on a chip's behalf; the chip
 * folds into the count when the space actually left can't hold both; the
 * count itself goes before the status mark (which lives outside this
 * component and is uncounted) is touched. Fit is measured, not guessed:
 * hidden twins render the [chip "+N"] pair and the bare count at natural
 * size, and what shows is the richest form the leftover width (parent minus
 * siblings and gaps) can hold. Row height never changes either way.
 */
export function RowChips({ chips }: { chips: RowChip[] }): JSX.Element | null {
  // 2 = chip + count, 1 = count only, 0 = nothing fits.
  const [fitLevel, setFitLevel] = useState(2)
  const hostRef = useRef<HTMLSpanElement>(null)
  const pairTwinRef = useRef<HTMLSpanElement>(null)
  const countTwinRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const host = hostRef.current
    const pairTwin = pairTwinRef.current
    const countTwin = countTwinRef.current
    const parent = host?.parentElement
    if (!host || !pairTwin || !countTwin || !parent) return
    const measure = (): void => {
      const style = getComputedStyle(parent)
      const gap = parseFloat(style.columnGap) || 0
      let available =
        parent.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)
      for (const sibling of parent.children) {
        if (sibling !== host) available -= sibling.getBoundingClientRect().width + gap
      }
      const pairW = pairTwin.getBoundingClientRect().width
      const countW = countTwin.getBoundingClientRect().width
      setFitLevel(available >= pairW ? 2 : available >= countW ? 1 : 0)
    }
    measure()
    // The parent is the stretchy element (the host swaps its own content, so
    // observing the host would loop); the twins resize when chip data does.
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    observer.observe(pairTwin)
    return () => observer.disconnect()
  }, [chips])

  if (chips.length === 0) return null
  const [first, ...rest] = chips
  const hidden = fitLevel === 2 ? rest : chips

  return (
    <span className="row-chip-row" ref={hostRef}>
      <span className="row-chip-twin" aria-hidden="true" ref={pairTwinRef}>
        {chipElement(first)}
        {rest.length > 0 && <span className="row-chip-overflow">+{rest.length}</span>}
      </span>
      <span className="row-chip-twin" aria-hidden="true" ref={countTwinRef}>
        <span className="row-chip-overflow">+{chips.length}</span>
      </span>
      {fitLevel === 2 && chipElement(first)}
      {fitLevel >= 1 && hidden.length > 0 && <ChipOverflow chips={hidden} />}
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
