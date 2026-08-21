import { Fragment, type JSX, type ReactNode } from 'react'
import {
  TIER_LABELS,
  type RankedMatch,
  type SearchKind,
  type SearchResults,
  type SearchTier
} from '../../../shared/search'
import { buildSnippet } from './snippet'
import {
  CommentIcon,
  DocumentIcon,
  LexiconViewIcon,
  StoryBibleViewIcon,
  SubmissionsViewIcon,
  TagSpanIcon,
  TimelineViewIcon
} from '../icons'

/**
 * Ranked project search results, grouped by tier.
 *
 * The grouping is the point. Sorting a character's own sheet above the
 * thirty-one chapters that mention her is not enough on its own — the two are
 * different kinds of answer, and a reader who cannot see which is which cannot
 * tell why one came first. So each tier is a labelled group, and rows get
 * visibly lighter as the tiers descend: an entity is a bordered row with its
 * type and summary, a prose mention is a dense line with a highlighted
 * snippet.
 */

interface ProjectSearchResultsProps {
  results: SearchResults
  onNavigate: (match: RankedMatch) => void
  /** Which tiers are folded away. Held by the caller so a group stays closed
   *  across queries and across the drop-down being dismissed — collapsing "In
   *  the manuscript" is a standing preference, not a per-search one. */
  collapsedTiers: Set<SearchTier>
  onToggleTier: (tier: SearchTier) => void
}

function iconFor(kind: SearchKind): ReactNode {
  switch (kind) {
    case 'storyBibleName':
    case 'storyBibleAlias':
    case 'storyBibleField':
    case 'relationship':
      return <StoryBibleViewIcon />
    case 'lexicon':
      return <LexiconViewIcon />
    case 'spanTag':
      return <TagSpanIcon />
    case 'comment':
    case 'footnote':
      return <CommentIcon />
    case 'timeline':
      return <TimelineViewIcon />
    case 'submission':
      return <SubmissionsViewIcon />
    default:
      return <DocumentIcon />
  }
}

/** The small grey word that says what sort of thing a row is. */
function kindLabel(match: RankedMatch): string {
  switch (match.entry.kind) {
    case 'prose':
      return `${match.occurrences} mention${match.occurrences === 1 ? '' : 's'}`
    case 'documentTitle':
      return match.entry.field === 'synopsis' ? 'Synopsis' : 'Document'
    case 'storyBibleName':
      return 'Story Bible'
    case 'storyBibleAlias':
      return `Alias of ${match.entry.title}`
    case 'storyBibleField':
      return match.entry.title
    case 'lexicon':
      return match.entry.field === 'word' ? 'Lexicon' : `Lexicon · ${match.entry.title}`
    case 'spanTag':
      return 'Tagged text'
    case 'comment':
      return 'Comment'
    case 'footnote':
      return `Footnote · ${match.entry.title}`
    case 'timeline':
      return 'Timeline'
    case 'relationship':
      return 'Relationship'
    case 'submission':
      return 'Submission'
    default:
      return ''
  }
}

/** The bold line: the name of the thing, not the text that matched. */
function headingFor(match: RankedMatch): string {
  switch (match.entry.kind) {
    case 'storyBibleAlias':
    case 'lexicon':
      return match.entry.kind === 'lexicon' && match.entry.field !== 'word'
        ? match.entry.title
        : match.entry.text
    case 'storyBibleName':
      return match.entry.text
    default:
      return match.entry.title || match.entry.text
  }
}

/**
 * Tiers 1 and 2 are the thing itself, so its own descriptor is the useful
 * second line. Everything else is a mention, so the matching text is.
 */
function detailFor(match: RankedMatch, query: string): ReactNode {
  if (match.tier <= 2 && match.entry.subtitle) {
    return <span className="search-result-detail">{match.entry.subtitle}</span>
  }
  // The heading is already the matched text, word for word.
  if (match.entry.kind === 'documentTitle' && match.entry.field === 'name') return null
  const parts = buildSnippet(match.entry.text, query)
  if (parts.length === 0) return null
  return (
    <span className="search-result-detail">
      {parts.map((part, i) =>
        part.hit ? (
          <mark key={i} className="search-result-hit">
            {part.text}
          </mark>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        )
      )}
    </span>
  )
}

function groupByTier(matches: RankedMatch[]): { tier: SearchTier; matches: RankedMatch[] }[] {
  const groups: { tier: SearchTier; matches: RankedMatch[] }[] = []
  for (const match of matches) {
    const last = groups[groups.length - 1]
    if (last && last.tier === match.tier) last.matches.push(match)
    else groups.push({ tier: match.tier, matches: [match] })
  }
  return groups
}

function ProjectSearchResults(props: ProjectSearchResultsProps): JSX.Element {
  const { results, onNavigate, collapsedTiers, onToggleTier } = props
  const groups = groupByTier(results.matches)

  return (
    <div className="search-results" role="listbox" aria-label="Search results">
      {groups.map((group) => {
        const collapsed = collapsedTiers.has(group.tier)
        return (
        <div
          className={`search-result-group ${collapsed ? 'is-collapsed' : ''}`}
          key={group.tier}
          data-tier={group.tier}
          data-collapsed={collapsed ? 'true' : 'false'}
        >
          {/* The header states the collapsed/expanded condition three ways —
              the caret's direction, the word, and the shaded bar — because one
              rotating chevron is easy to miss in a list this dense. */}
          <button
            type="button"
            className="search-result-group-label"
            aria-expanded={!collapsed}
            onClick={() => onToggleTier(group.tier)}
          >
            <span className="search-result-group-caret" aria-hidden="true">
              {collapsed ? '▶' : '▼'}
            </span>
            <span className="search-result-group-name">{TIER_LABELS[group.tier]}</span>
            <span className="search-result-group-count">{group.matches.length}</span>
            <span className="search-result-group-state">{collapsed ? 'Hidden' : 'Hide'}</span>
          </button>
          {!collapsed &&
            group.matches.map((match) => (
            <button
              type="button"
              key={match.entry.id}
              className="search-result"
              data-tier={match.tier}
              data-kind={match.entry.kind}
              title={match.tierName}
              onClick={() => onNavigate(match)}
            >
              <span className="search-result-icon">{iconFor(match.entry.kind)}</span>
              <span className="search-result-body">
                <span className="search-result-heading">
                  {headingFor(match)}
                  <span className="search-result-kind">{kindLabel(match)}</span>
                </span>
                {detailFor(match, results.query)}
              </span>
            </button>
          ))}
        </div>
        )
      })}
      {results.truncated && (
        <div className="search-results-truncated">
          Showing the first {results.matches.length} results — narrow the search to see fewer.
        </div>
      )}
    </div>
  )
}

export default ProjectSearchResults
