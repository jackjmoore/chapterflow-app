/**
 * What kind of thing a search result is.
 *
 * Deliberately finer-grained than "the seven features": a document title and
 * its prose are different sorts of hit, and so are an item's real name and one
 * of its aliases. Ranking is not this layer's job, but that distinction is
 * impossible to recover later if the index collapses it now.
 */
export type SearchKind =
  | 'prose'
  | 'documentTitle'
  | 'storyBibleName'
  | 'storyBibleAlias'
  | 'storyBibleField'
  | 'lexicon'
  | 'spanTag'
  | 'comment'
  | 'footnote'
  | 'timeline'
  | 'relationship'
  | 'submission'

export interface SearchEntry {
  /** `${kind}:${ownerId}:${field}` — stable across re-indexing, so an update
   *  replaces an entry rather than accumulating duplicates. */
  id: string
  kind: SearchKind
  /** The thing this text belongs to: a document, Story Bible item, comment,
   *  timeline entry… Whatever a result would navigate to. */
  ownerId: string
  /** Set when the text lives inside a manuscript document; null otherwise.
   *  A comment has both — its own id, and the document it is anchored in. */
  documentId: string | null
  /** Which part of the owner this is: 'body', 'name', 'meaning', 'notes'… */
  field: string
  /** Display label for the owner — the chapter name, the character's name. */
  title: string
  /** One identifying line about the owner, for results that are the thing
   *  itself rather than a mention of it: a Lexicon word's meaning, a Story
   *  Bible item's type and summary. Absent where there is nothing useful to
   *  say that the title has not already said. */
  subtitle?: string
  /** The searchable text itself. Tokenised for lookup and kept for exact
   *  verification, so phrase queries stay exact rather than token-approximate. */
  text: string
  /** Edit recency, epoch ms — the tiebreaker ranking uses within a tier.
   *  Taken from the record's own `updatedAt` where one exists, and from the
   *  source file's mtime otherwise, so the index never has to re-read a file
   *  to order results. */
  updatedAt: number
}

export interface SearchMatch {
  entry: SearchEntry
  /** Character offsets in `entry.text` where the query was found. Empty when
   *  the entry matched on tokens without the raw query appearing contiguously. */
  offsets: number[]
  /** True when the raw query string appears verbatim, rather than the entry
   *  merely containing every query token somewhere. Free to compute here and
   *  the sort of thing ranking will want. */
  phrase: boolean
}

export interface SearchQueryOptions {
  kinds?: SearchKind[]
  limit?: number
}

/** Index-level statistics, for diagnostics and for tests that need to prove
 *  a save re-indexed one document rather than the whole project. */
export interface SearchIndexStats {
  entries: number
  tokens: number
  /** Sources re-indexed since the process started. */
  reindexedSources: number
  ready: boolean
}

/** Words worth putting in the index. Single characters are excluded: they
 *  match almost everything and cost the most to store. */
export function tokenize(text: string): string[] {
  const tokens: string[] = []
  const pattern = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match[0].length > 1) tokens.push(match[0].toLowerCase())
  }
  return tokens
}

// ------------------------------------------------------------- ranking

/**
 * Which band of relevance a result falls into.
 *
 * A small fixed ordinal, not a score: nothing adds to it, multiplies it or
 * interpolates between the values. A result is in exactly one tier because
 * exactly one rule claimed it, and the rule that did is reported alongside.
 */
export type SearchTier = 1 | 2 | 3 | 4 | 5 | 6

/** Human-facing name of each tier, used as the result group heading. */
export const TIER_LABELS: Record<SearchTier, string> = {
  1: 'Exact match',
  2: 'Matching names',
  3: 'Documents',
  4: 'Details & records',
  5: 'Comments & footnotes',
  6: 'In the manuscript'
}

export interface RankedMatch extends SearchMatch {
  tier: SearchTier
  /** The name of the rule that placed this result, so a result can explain its
   *  own position rather than the reader inferring it from the order. */
  tierName: string
  /** Whole-word occurrences of the query in this entry. The ordering signal
   *  inside tier 5; always at least 1. */
  occurrences: number
}

export interface SearchResults {
  /** Echoed back so a late-arriving response can be discarded once the query
   *  has moved on. */
  query: string
  matches: RankedMatch[]
  /** True when `limit` cut the list short. */
  truncated: boolean
}

export interface RecentSearch {
  query: string
  /** Epoch ms of the most recent time this query was run. */
  at: number
}
