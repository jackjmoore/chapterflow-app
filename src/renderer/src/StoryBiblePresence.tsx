import type { MentionStatsSummary } from './mentionUtils'

/**
 * Where an item appears across the manuscript: one cell per document in
 * reading order, shaded by how often it is mentioned there.
 *
 * The same habit-visual idea as the Progress page's writing calendar, turned
 * on mention frequency instead of writing frequency — quiet, honest, and
 * comparable between items because every strip is drawn against the same
 * document list in the same order.
 */
export function PresenceStrip(props: {
  documents: { id: string; name: string }[]
  stats: MentionStatsSummary | null
  itemName: string
  /** The card size; the sheet uses the larger default. */
  small?: boolean
}): JSX.Element | null {
  const { documents, stats, itemName, small } = props
  if (documents.length === 0) return null

  const counts = new Map((stats?.byChapter ?? []).map((c) => [c.documentId, c.count]))
  const max = Math.max(1, ...counts.values())

  return (
    <span
      className={`story-bible-presence ${small ? 'is-small' : ''}`}
      role="img"
      aria-label={`Where ${itemName} appears across the manuscript`}
    >
      {documents.map((doc) => {
        const count = counts.get(doc.id) ?? 0
        const level =
          count === 0
            ? ''
            : count <= max * 0.25
              ? 'is-l1'
              : count <= max * 0.5
                ? 'is-l2'
                : count <= max * 0.75
                  ? 'is-l3'
                  : 'is-l4'
        return (
          <i
            key={doc.id}
            className={level}
            title={`${doc.name}: ${count === 0 ? 'no mentions' : `${count} ${count === 1 ? 'mention' : 'mentions'}`}`}
          />
        )
      })}
    </span>
  )
}

/** "255 mentions", or an honest sentence fragment when there are none. Used
 *  on cards, where a bare figure reads as a number without a noun. */
export function mentionLabel(stats: MentionStatsSummary | null): string {
  const total = stats?.totalCount ?? 0
  if (total === 0) return 'Not mentioned yet'
  return `${total.toLocaleString()} ${total === 1 ? 'mention' : 'mentions'}`
}

const SMALL_COUNTS = [
  'no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve'
]

/** Counts read as words up to twelve and as numerals beyond. */
export function countWord(n: number): string {
  return n >= 0 && n < SMALL_COUNTS.length ? SMALL_COUNTS[n] : n.toLocaleString()
}

/** One sentence stating where an item appears. Mentions are counted rather
 *  than estimated, so this says them plainly. */
export function appearanceSentence(name: string, stats: MentionStatsSummary | null): string {
  const total = stats?.totalCount ?? 0
  const subject = name || 'This entry'
  if (total === 0 || !stats) return `${subject} has not been mentioned in the manuscript yet.`
  const docs = stats.byChapter.length
  const first = stats.firstAppearance?.documentName
  const last = stats.lastAppearance?.documentName
  const where =
    first && last && first !== last
      ? ` The first mention is in ${first} and the last is in ${last}.`
      : first
        ? ` Every mention is in ${first}.`
        : ''
  return `${subject} appears ${total.toLocaleString()} ${
    total === 1 ? 'time' : 'times'
  } across ${countWord(docs)} ${docs === 1 ? 'document' : 'documents'}.${where}`
}

/** The initials a portrait falls back to, ignoring a leading "The". */
export function initialsFor(name: string): string {
  const trimmed = (name || 'Untitled').replace(/^The\s+/i, '').trim()
  return (
    trimmed
      .split(/\s+/)
      .map((word) => word[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  )
}
