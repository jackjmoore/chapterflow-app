import { useEffect, useRef, useState } from 'react'
import type { LexiconEntry } from '../../shared/lexicon'

interface LexiconHoverCardProps {
  rect: DOMRect
  entry: LexiconEntry
  onOpenEntry: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

/**
 * Hover profile for a Lexicon word, using the same card mechanism and styling
 * as the Story Bible mention card — same positioning rules, same clamping to
 * the window, same click-through-to-the-entry affordance — so the two read as
 * one behaviour rather than two lookalikes.
 */
function LexiconHoverCard(props: LexiconHoverCardProps): JSX.Element {
  const { rect, entry, onOpenEntry, onMouseEnter, onMouseLeave } = props
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

  return (
    <div
      ref={ref}
      className="mention-hover-card"
      style={{ left: pos.left, top: pos.top }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onOpenEntry}
    >
      <div className="mention-hover-card-header">
        <span className="mention-hover-card-type-pill lexicon-hover-pill">Lexicon</span>
        <span className="mention-hover-card-name">{entry.word}</span>
      </div>

      {entry.pronunciation && (
        <div className="mention-hover-card-stats">
          <span className="mention-hover-card-stat">{entry.pronunciation}</span>
        </div>
      )}

      {entry.meaning && <div className="mention-hover-card-summary">{entry.meaning}</div>}

      {!entry.pronunciation && !entry.meaning && (
        <div className="mention-hover-card-empty">No meaning recorded yet.</div>
      )}
    </div>
  )
}

export default LexiconHoverCard
