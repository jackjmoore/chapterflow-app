import { useEffect, useRef, useState } from 'react'
import type { StoryBibleItem, StoryBibleSheet, StoryBibleTypeDef } from '../../shared/storyBible'
import { ChevronIcon } from './icons'

interface MentionHoverCardProps {
  rect: DOMRect
  item: StoryBibleItem
  type: StoryBibleTypeDef | null
  /** null while the sheet is still being fetched. */
  sheet: StoryBibleSheet | null
  onOpenItem: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

/**
 * What the card shows before you ask for more.
 *
 * Compact is deliberately one glance: the type, the name, and the item's own
 * summary clamped to two lines. That is enough to answer "who is this again?"
 * without the card becoming a panel that covers the sentence you were reading.
 *
 * Everything else — the stat pairs, the sheet's text block, any list blocks —
 * waits behind More. Previously two stats and a hundred characters of prose
 * showed by default and More was for "even more", which made the default case
 * large for no benefit: if you already know who Wren is, none of it was
 * wanted, and if you don't, you are going to open the sheet anyway.
 */
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
  const { rect, item, type, sheet, onOpenItem, onMouseEnter, onMouseLeave } = props
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect, expanded])

  // A different mention reuses this component, so the expansion has to reset
  // rather than carry over to the next item.
  useEffect(() => setExpanded(false), [item.id])

  const statsBlock = sheet?.blocks.find((b) => b.kind === 'stats')
  const statPairs = statsBlock && statsBlock.kind === 'stats' ? statsBlock.pairs : []
  const textBlock = sheet?.blocks.find((b) => b.kind === 'text')
  const textPreview = textBlock && textBlock.kind === 'text' ? htmlToPlainText(textBlock.html) : ''

  const listBlocks = (sheet?.blocks ?? []).filter((b) => b.kind === 'list')
  const shownStats = expanded ? statPairs : []
  const shownText = expanded
    ? textPreview.length > EXPANDED_TEXT_MAX_LENGTH
      ? `${textPreview.slice(0, EXPANDED_TEXT_MAX_LENGTH)}…`
      : textPreview
    : ''

  /** Only offer expansion when there is genuinely something held back. */
  const hasMore = statPairs.length > 0 || textPreview.length > 0 || listBlocks.length > 0

  const isEmpty = !item.summary && statPairs.length === 0 && !textPreview

  return (
    <div
      ref={ref}
      className="mention-hover-card"
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

      {/* An item with no summary would otherwise be a bare name in compact
          form, which says less than the mention itself already did. */}
      {!item.summary && !expanded && statPairs[0] && (
        <div className="mention-hover-card-summary">
          <strong>{statPairs[0].label || 'Untitled'}:</strong> {statPairs[0].value}
        </div>
      )}

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
