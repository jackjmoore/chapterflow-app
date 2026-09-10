import { useEffect, useRef, useState } from 'react'
import type { StoryBibleItem, StoryBibleSheet, StoryBibleTypeDef } from '../../shared/storyBible'
import { ChevronIcon } from './icons'
import { presenceClass } from './usePresence'

interface MentionHoverCardProps {
  rect: DOMRect
  item: StoryBibleItem
  type: StoryBibleTypeDef | null
  /** null while the sheet is still being fetched. */
  sheet: StoryBibleSheet | null
  onOpenItem: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  /** Drives the entrance/exit fade — see usePresence, which owns the timing.
   *  This prop only ever flips a class; it never delays a mount. */
  fadeVisible: boolean
}

/**
 * What the card shows before you ask for more.
 *
 * The default carries real information: the summary, the first couple of stat
 * pairs, and the opening of the sheet's text block. A hover that shows only a
 * name has cost the reader a gesture and told them what the sentence already
 * said — the point of the card is to answer the question without going
 * anywhere, so the answer has to be in it.
 *
 * Size is controlled by spacing and by capping each block, not by withholding
 * blocks. More is reserved for detail beyond what a glance can hold: the
 * remaining stat pairs, the rest of the text block, and any list blocks.
 */
const SUMMARY_STAT_COUNT = 2
const TEXT_PREVIEW_MAX_LENGTH = 120
const EXPANDED_TEXT_MAX_LENGTH = 420

function htmlToPlainText(html: string): string {
  const el = document.createElement('div')
  el.innerHTML = html
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Small, hover-only profile card for a detected or manually-tagged Story Bible
 * mention — content is real, not a link you have to click through: name and
 * type, the item's own summary, a couple of stat pairs, and the opening of its
 * first text block, whichever of those exist.
 *
 * The card body is deliberately inert. It used to be one large click target
 * that navigated to the full sheet, which meant brushing past it on the way
 * back to the manuscript could throw you out of the editor. Reading is now
 * free; leaving the editor takes an explicit press on Open, and seeing more
 * without leaving takes the expand control.
 */
function MentionHoverCard(props: MentionHoverCardProps): JSX.Element {
  const { rect, item, type, sheet, onOpenItem, onMouseEnter, onMouseLeave, fadeVisible } = props
  const [pos, setPos] = useState({ left: rect.left, top: rect.bottom + 6 })
  const [expanded, setExpanded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const cardRect = el.getBoundingClientRect()
    const maxLeft = Math.max(8, window.innerWidth - cardRect.width - 8)
    const maxTop = Math.max(8, window.innerHeight - cardRect.height - 8)
    setPos({ left: Math.min(rect.left, maxLeft), top: Math.min(rect.bottom + 6, maxTop) })
    // `sheet` is in here because the card mounts before its sheet arrives and
    // grows when it does. Clamping only at mount measured a card that had not
    // finished being itself, and one opened near the bottom of the window then
    // grew past the edge — taking its own buttons out of reach with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect, expanded, sheet])

  // A different mention reuses this component, so the expansion has to reset
  // rather than carry over to the next item.
  useEffect(() => setExpanded(false), [item.id])

  const statsBlock = sheet?.blocks.find((b) => b.kind === 'stats')
  const statPairs = statsBlock && statsBlock.kind === 'stats' ? statsBlock.pairs : []
  const textBlock = sheet?.blocks.find((b) => b.kind === 'text')
  const rawText = textBlock && textBlock.kind === 'text' ? htmlToPlainText(textBlock.html) : ''
  // A sheet's first text block often opens by restating the summary. Showing
  // both spends the card's height saying one thing twice.
  const summary = (item.summary ?? '').trim()
  const textPreview =
    summary && rawText.startsWith(summary) ? rawText.slice(summary.length).trim() : rawText

  const listBlocks = (sheet?.blocks ?? []).filter((b) => b.kind === 'list')
  const shownStats = expanded ? statPairs : statPairs.slice(0, SUMMARY_STAT_COUNT)
  const textLimit = expanded ? EXPANDED_TEXT_MAX_LENGTH : TEXT_PREVIEW_MAX_LENGTH
  const shownText = textPreview.length > textLimit ? `${textPreview.slice(0, textLimit)}…` : textPreview

  /** Only offer expansion when something is genuinely held back. */
  const hasMore =
    statPairs.length > SUMMARY_STAT_COUNT || textPreview.length > TEXT_PREVIEW_MAX_LENGTH || listBlocks.length > 0

  const isEmpty = !item.summary && statPairs.length === 0 && !textPreview

  return (
    <div
      ref={ref}
      className={`mention-hover-card ${presenceClass(fadeVisible)}`}
      style={{ left: pos.left, top: pos.top }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="mention-hover-card-header">
        {type && (
          <span className="mention-hover-card-type-pill" style={{ backgroundColor: type.color }}>
            {type.name}
          </span>
        )}
        <span className="mention-hover-card-name">{item.name}</span>
      </div>

      {item.summary && <div className="mention-hover-card-summary">{item.summary}</div>}

      {shownStats.length > 0 && (
        <div className="mention-hover-card-stats">
          {shownStats.map((pair) => (
            <span key={pair.id} className="mention-hover-card-stat">
              <strong>{pair.label || 'Untitled'}:</strong> {pair.value}
            </span>
          ))}
        </div>
      )}

      {shownText && <div className="mention-hover-card-text-preview">{shownText}</div>}

      {expanded &&
        listBlocks.map((block) =>
          block.kind === 'list' && block.items.length > 0 ? (
            <div key={block.id} className="mention-hover-card-list">
              <strong>{block.label || 'Untitled'}</strong>
              <ul>
                {block.items.map((entry, i) => (
                  <li key={i}>{entry}</li>
                ))}
              </ul>
            </div>
          ) : null
        )}

      {isEmpty && sheet && <div className="mention-hover-card-empty">No details on this sheet yet.</div>}

      <div className="mention-hover-card-actions">
        {hasMore ? (
          <button
            type="button"
            className={`mention-hover-card-expand ${expanded ? 'is-expanded' : ''}`}
            aria-expanded={expanded}
            title={expanded ? 'Show less' : 'Show more from this sheet'}
            onClick={() => setExpanded((v) => !v)}
          >
            <ChevronIcon />
            {expanded ? 'Less' : 'More'}
          </button>
        ) : (
          <span />
        )}

        {/* The only thing on this card that leaves the manuscript. */}
        <button
          type="button"
          className="mention-hover-card-open"
          title={`Open ${item.name} in the Story Bible`}
          onClick={onOpenItem}
        >
          Open
        </button>
      </div>
    </div>
  )
}

export default MentionHoverCard
