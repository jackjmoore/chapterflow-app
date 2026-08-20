import { useEffect, useRef, useState } from 'react'
import type { StoryBibleItem, StoryBibleSheet, StoryBibleTypeDef } from '../../shared/storyBible'

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

const TEXT_PREVIEW_MAX_LENGTH = 100

function htmlToPlainText(html: string): string {
  const el = document.createElement('div')
  el.innerHTML = html
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** Small, hover-only profile card for a detected/manually-tagged Story Bible
 *  mention — content is real, not a link you have to click through: name +
 *  type, the item's own summary, up to 2 stat pairs, and the first line of
 *  its first text block, whichever of those exist. Clicking is an optional
 *  shortcut into the full sheet, not required to see anything here. */
function MentionHoverCard(props: MentionHoverCardProps): JSX.Element {
  const { rect, item, type, sheet, onOpenItem, onMouseEnter, onMouseLeave } = props
  const [pos, setPos] = useState({ left: rect.left, top: rect.bottom + 6 })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const cardRect = el.getBoundingClientRect()
    const maxLeft = Math.max(8, window.innerWidth - cardRect.width - 8)
    const maxTop = Math.max(8, window.innerHeight - cardRect.height - 8)
    setPos({ left: Math.min(rect.left, maxLeft), top: Math.min(rect.bottom + 6, maxTop) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect])

  const statsBlock = sheet?.blocks.find((b) => b.kind === 'stats')
  const textBlock = sheet?.blocks.find((b) => b.kind === 'text')
  const textPreview = textBlock && textBlock.kind === 'text' ? htmlToPlainText(textBlock.html) : ''
  const truncatedText =
    textPreview.length > TEXT_PREVIEW_MAX_LENGTH ? `${textPreview.slice(0, TEXT_PREVIEW_MAX_LENGTH)}…` : textPreview

  return (
    <div
      ref={ref}
      className="mention-hover-card"
      style={{ left: pos.left, top: pos.top }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onOpenItem}
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

      {statsBlock && statsBlock.kind === 'stats' && statsBlock.pairs.length > 0 && (
        <div className="mention-hover-card-stats">
          {statsBlock.pairs.slice(0, 2).map((pair) => (
            <span key={pair.id} className="mention-hover-card-stat">
              <strong>{pair.label || 'Untitled'}:</strong> {pair.value}
            </span>
          ))}
        </div>
      )}

      {truncatedText && <div className="mention-hover-card-text-preview">{truncatedText}</div>}

      {!item.summary && !statsBlock && !truncatedText && sheet && (
        <div className="mention-hover-card-empty">No details on this sheet yet.</div>
      )}
    </div>
  )
}

export default MentionHoverCard
