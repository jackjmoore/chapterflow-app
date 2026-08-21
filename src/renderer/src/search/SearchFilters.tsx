import type { JSX } from 'react'
import type { SearchKind } from '../../../shared/search'

/**
 * Narrowing by content kind.
 *
 * Ranking is meant to make these unnecessary at any realistic project size —
 * a character's name puts her sheet first without being told to look in the
 * Story Bible — so they are drawn as quietly as a control can be and still be
 * read: small, unfilled, sharing a row with the scope toggle rather than
 * occupying one of their own.
 *
 * The groups mirror the ranking tiers rather than the file layout, which is
 * why a document's title is its own chip and not part of the manuscript: those
 * are two different tiers and two different kinds of answer.
 */

export const FILTER_GROUPS: { label: string; kinds: SearchKind[] }[] = [
  { label: 'Manuscript', kinds: ['prose'] },
  { label: 'Documents', kinds: ['documentTitle'] },
  { label: 'Story Bible', kinds: ['storyBibleName', 'storyBibleAlias', 'storyBibleField', 'relationship'] },
  { label: 'Lexicon', kinds: ['lexicon'] },
  { label: 'Notes', kinds: ['comment', 'footnote', 'spanTag'] },
  { label: 'Tracking', kinds: ['timeline', 'submission'] }
]

interface SearchFiltersProps {
  /** Null means no filter at all — every kind. An empty set would mean
   *  "nothing", which is never what an untouched filter should say. */
  selected: Set<SearchKind> | null
  onChange: (next: Set<SearchKind> | null) => void
  /** Greyed out rather than removed when the current scope has no use for
   *  them, so the bar does not change shape as the scope changes. */
  disabled?: boolean
  disabledHint?: string
}

function SearchFilters(props: SearchFiltersProps): JSX.Element {
  const { selected, onChange, disabled = false, disabledHint } = props

  function toggleGroup(kinds: SearchKind[]): void {
    const active = selected ?? new Set<SearchKind>()
    const next = new Set(selected ? active : [])
    const allOn = kinds.every((k) => active.has(k))
    for (const kind of kinds) {
      if (allOn) next.delete(kind)
      else next.add(kind)
    }
    onChange(next.size === 0 ? null : next)
  }

  return (
    <div className={`search-filters ${disabled ? 'is-disabled' : ''}`}>
      {FILTER_GROUPS.map((group) => {
        const active = !disabled && !!selected && group.kinds.every((k) => selected.has(k))
        return (
          <button
            type="button"
            key={group.label}
            className={`search-filter ${active ? 'is-active' : ''}`}
            aria-pressed={active}
            disabled={disabled}
            title={disabled ? disabledHint : undefined}
            onClick={() => toggleGroup(group.kinds)}
          >
            {group.label}
          </button>
        )
      })}
      {selected && !disabled && (
        <button
          type="button"
          className="search-filter-clear"
          title="Search everything again"
          onClick={() => onChange(null)}
        >
          Clear
        </button>
      )}
    </div>
  )
}

export default SearchFilters
