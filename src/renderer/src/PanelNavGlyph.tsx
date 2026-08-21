import { isDarkHex } from './colorUtils'

interface PanelNavGlyphProps {
  /** One or two characters. Longer is silently trimmed — the strip is 44px. */
  token: string
  /** Background colour when the token carries a category (a Story Bible type).
   *  Omitted for neutral tokens like a sequence number. */
  color?: string
  active?: boolean
}

/**
 * The collapsed side panel's stand-in for a row.
 *
 * The three tool sections each have their own natural token (an item's
 * initial, an event's number, a status's initial), but at 44px they have to
 * read with the same weight as the binder's document/folder icons beside
 * them — an 8px dot or a 10px dim numeral disappears. One component so the
 * three can't drift apart visually the way they did before.
 */
function PanelNavGlyph(props: PanelNavGlyphProps): JSX.Element {
  const { token, color, active } = props
  const label = token.slice(0, 2)
  const style = color
    ? { background: color, color: isDarkHex(color) ? '#fff' : '#1c1a17', borderColor: 'transparent' }
    : undefined

  return (
    <span className={`panel-nav-glyph ${active ? 'is-active' : ''}`} style={style}>
      {label}
    </span>
  )
}

/** First letter that actually reads as one, uppercased. Falls back to a dash
 *  rather than an empty box for an untitled item. */
export function initialOf(name: string): string {
  const match = /\p{L}|\p{N}/u.exec(name || '')
  return match ? match[0].toUpperCase() : '—'
}

export default PanelNavGlyph
