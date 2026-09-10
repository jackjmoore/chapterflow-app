import { findMentionsInText, prepareMentionMatching } from '../shared/mentionMatcher'
import { escapeRegExp } from '../shared/textMatch'
import { query as queryIndex } from './searchIndex'
import {
  TIER_LABELS,
  tokenize,
  type RankedMatch,
  type SearchEntry,
  type SearchKind,
  type SearchMatch,
  type SearchQueryOptions,
  type SearchResults,
  type SearchTier
} from '../shared/search'

/**
 * Turns the index's unordered matches into an ordered, tiered result list.
 *
 * Ranking here is a short ordered list of rules, evaluated top to bottom, first
 * match wins — not a score. Nothing in this file adds, multiplies or weights
 * anything: the only numbers are the tier ordinals, an occurrence count, and a
 * timestamp, and each is used as a sort key in its own right rather than
 * combined with the others. A result's tier is reported alongside it, so the
 * interface can say why something ranked where it did instead of asking the
 * reader to infer it from position.
 */

// --------------------------------------------------------------- kinds

/**
 * An "entity" is a thing's own name: the label you would type if you were
 * trying to navigate to it rather than to read about it. Only these can reach
 * tiers 1 and 2.
 *
 * Note this is finer-grained than kind alone — a Lexicon entry's `word` is an
 * entity, but its `meaning` is prose about that entity and belongs with the
 * other descriptive fields.
 */
function isEntity(entry: SearchEntry): boolean {
  if (entry.kind === 'storyBibleName' || entry.kind === 'storyBibleAlias') return true
  return entry.kind === 'lexicon' && entry.field === 'word'
}

/**
 * A document's own name or synopsis.
 *
 * Kept out of the general metadata band because a chapter is not a piece of
 * information *about* something the way a tag or a tracker row is — typing a
 * chapter's name is one of the most direct ways of saying which thing you
 * want, so it belongs immediately behind the named entities rather than in
 * among the records.
 */
function isDocument(entry: SearchEntry): boolean {
  // Notes are stored alongside the title and synopsis but are prose *about* a
  // document rather than a way of naming it, so they belong in the metadata
  // band below rather than beside the title.
  return entry.kind === 'documentTitle' && entry.field !== 'notes'
}

/** Structured content that describes something: fields, tags, records. */
const METADATA_KINDS: ReadonlySet<SearchKind> = new Set<SearchKind>([
  'storyBibleField',
  'lexicon',
  'spanTag',
  'timeline',
  'relationship',
  'submission'
])

/** Things the author wrote *about* the manuscript rather than in it. */
const ANNOTATION_KINDS: ReadonlySet<SearchKind> = new Set<SearchKind>(['comment', 'footnote'])

/**
 * Below this many characters, a query is not allowed to return prose.
 *
 * One or two characters match nearly every chapter of anything written in
 * English, so the results are noise that buries the tiers above them. Three is
 * the first length at which a prose hit carries information — and it is also
 * where the index itself starts being useful, since its tokeniser already
 * refuses to store one-character tokens.
 *
 * This is deliberately a floor on tier 6 alone. Narrowing towards a name from
 * the first keystroke is the single most useful thing search does, and the
 * entity, document and record tiers stay responsive throughout.
 */
const MIN_PROSE_QUERY_LENGTH = 3

/** Does the query name this thing, from the start of one of its words? Shared
 *  by the entity and document tiers, which ask the same question of different
 *  kinds of name. */
function matchesPrefix(entry: SearchEntry, q: PreparedQuery): boolean {
  return q.prefixRegex !== null && q.prefixRegex.test(entry.text)
}

// --------------------------------------------------------------- query

interface PreparedQuery {
  raw: string
  /** Lowercased, whitespace-collapsed — what tier 1's equality test compares. */
  normalized: string
  /** Unique query tokens, in the order typed. */
  terms: string[]
  /** Whole-word alternation over the terms, for counting. Null when the query
   *  produced no tokens at all (a single character, punctuation only). */
  termRegex: RegExp | null
  /** Term text -> the index of that term, so a per-term count can be recovered
   *  from one scan. */
  termLookup: Map<string, string>
  /** The whole query as a contiguous whole-word phrase, or null if it is a
   *  single term (in which case the term regex already covers it). */
  phraseRegex: RegExp | null
  phraseLookup: Map<string, string>
  /** Word-boundary-anchored *prefix* of the whole query. Deliberately open at
   *  the right-hand end: this is what lets "Wre" reach Wren Halloway while
   *  still refusing to match "ren" inside her name. */
  prefixRegex: RegExp | null
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

function prepare(raw: string): PreparedQuery {
  const trimmed = raw.trim()
  const terms = [...new Set(tokenize(trimmed))]

  // Word boundaries come from the same helper Story Bible mention detection
  // uses, so search and mention highlighting can never disagree about whether
  // "Ral" occurs in "feral". The itemId slot carries the term's position,
  // which is how one scan yields a count per term.
  const prepared = prepareMentionMatching(terms.map((text, i) => ({ itemId: String(i), text })))

  const phrase =
    terms.length > 1 ? prepareMentionMatching([{ itemId: 'phrase', text: trimmed }]) : { regex: null, lookup: new Map() }

  return {
    raw: trimmed,
    normalized: normalize(trimmed),
    terms,
    termRegex: prepared.regex,
    termLookup: prepared.lookup,
    phraseRegex: phrase.regex,
    phraseLookup: phrase.lookup,
    // Not global: this one is only ever `.test`ed, and a global regex carries
    // `lastIndex` between calls.
    prefixRegex: trimmed ? new RegExp(`\\b${escapeRegExp(trimmed)}`, 'i') : null
  }
}

/**
 * How many times the query occurs in this text, counting whole words only.
 *
 * A multi-word query that appears contiguously is counted as that phrase.
 * Otherwise it is the count of the *rarest* term, which is the binding
 * constraint under an AND query: a chapter with "old" twenty times and "mill"
 * three times has three places worth looking at, not twenty.
 */
function countOccurrences(text: string, q: PreparedQuery): number {
  if (q.phraseRegex) {
    const count = findMentionsInText(text, q.phraseRegex, q.phraseLookup).get('phrase')?.count ?? 0
    if (count > 0) return count
  }

  // A query too short to contain a whole word cannot make a whole-word match.
  // Counting it as a raw substring instead would let a single keystroke claim
  // every record, comment and chapter that happens to contain that letter
  // anywhere — which is exactly the noise the tiers exist to keep out. Such a
  // query is still free to match a *name* by prefix, which is what the tiers
  // above use, and is the useful thing a first keystroke can do.
  if (!q.termRegex) return 0

  const perTerm = findMentionsInText(text, q.termRegex, q.termLookup)
  let rarest = Infinity
  for (let i = 0; i < q.terms.length; i += 1) {
    const count = perTerm.get(String(i))?.count ?? 0
    if (count === 0) return 0
    rarest = Math.min(rarest, count)
  }
  return rarest === Infinity ? 0 : rarest
}

// ---------------------------------------------------------------- tiers

interface Candidate {
  entry: SearchEntry
  offsets: number[]
  phrase: boolean
  /** Every query term occurs as a whole word. False for candidates the index
   *  only surfaced through its trailing-token prefix expansion. */
  wholeWord: boolean
  occurrences: number
}

type Comparator = (a: RankedMatch, b: RankedMatch) => number

interface TierRule {
  tier: SearchTier
  name: string
  matches: (candidate: Candidate, q: PreparedQuery) => boolean
  /** How results inside this tier order among themselves. */
  compare: Comparator
}

/** Most recently edited first. */
const byRecency: Comparator = (a, b) => b.entry.updatedAt - a.entry.updatedAt

/**
 * Prose only (tier 6). Recency alone would mean a chapter mentioning the
 * harbour once outranks the chapter that is *about* the harbour purely because
 * it was touched more recently — and since file mtimes are effectively unique,
 * occurrence count would never get to break a tie at all.
 */
const byOccurrencesThenRecency: Comparator = (a, b) => b.occurrences - a.occurrences || byRecency(a, b)

/**
 * The rules, in order. Read top to bottom: the first one that claims a
 * candidate decides its tier, and a candidate no rule claims is dropped.
 *
 * Tiers 4-6 require `wholeWord`. Tiers 1 and 2 deliberately do not — matching
 * a partly-typed name is the whole point of tier 2 — and tier 3 accepts either,
 * because a document name is a name.
 */
const TIERS: readonly TierRule[] = [
  {
    tier: 1,
    name: TIER_LABELS[1],
    matches: (c, q) => isEntity(c.entry) && normalize(c.entry.text) === q.normalized,
    compare: byRecency
  },
  {
    tier: 2,
    name: TIER_LABELS[2],
    matches: (c, q) => isEntity(c.entry) && matchesPrefix(c.entry, q),
    compare: byRecency
  },
  {
    tier: 3,
    name: TIER_LABELS[3],
    // A document's *name* also answers to a partly-typed query, for the same
    // reason a character's does — you are naming the thing you want. Its
    // synopsis is descriptive text, so it holds to whole words.
    matches: (c, q) => isDocument(c.entry) && (c.wholeWord || (c.entry.field === 'name' && matchesPrefix(c.entry, q))),
    compare: byRecency
  },
  {
    tier: 4,
    name: TIER_LABELS[4],
    matches: (c) => !isEntity(c.entry) && METADATA_KINDS.has(c.entry.kind) && c.wholeWord,
    compare: byRecency
  },
  {
    tier: 5,
    name: TIER_LABELS[5],
    matches: (c) => ANNOTATION_KINDS.has(c.entry.kind) && c.wholeWord,
    compare: byRecency
  },
  {
    tier: 6,
    name: TIER_LABELS[6],
    matches: (c, q) => c.entry.kind === 'prose' && c.wholeWord && q.raw.length >= MIN_PROSE_QUERY_LENGTH,
    compare: byOccurrencesThenRecency
  }
]

function tierFor(candidate: Candidate, q: PreparedQuery): TierRule | null {
  for (const rule of TIERS) {
    if (rule.matches(candidate, q)) return rule
  }
  return null
}

const RULES_BY_TIER = new Map<SearchTier, TierRule>(TIERS.map((rule) => [rule.tier, rule]))

/**
 * Within a tier: a contiguous phrase match ahead of a scattered one, then the
 * tier's own rule, then entry id so repeated queries agree exactly.
 */
function withinTier(tier: SearchTier): Comparator {
  const rule = RULES_BY_TIER.get(tier)
  return (a, b) =>
    Number(b.phrase) - Number(a.phrase) || (rule ? rule.compare(a, b) : 0) || a.entry.id.localeCompare(b.entry.id)
}

// --------------------------------------------------------------- public

const DEFAULT_LIMIT = 200

/**
 * Ranked project search.
 *
 * Note the index is asked for everything matching, with no limit: truncating
 * before ranking would discard results the rules might have put first.
 */
export function search(text: string, options: SearchQueryOptions = {}): SearchResults {
  const q = prepare(text)
  if (!q.raw) return { query: q.raw, matches: [], truncated: false }

  const raw: SearchMatch[] = queryIndex(q.raw, { kinds: options.kinds })

  const ranked: RankedMatch[] = []
  for (const match of raw) {
    const occurrences = countOccurrences(match.entry.text, q)
    const candidate: Candidate = {
      entry: match.entry,
      offsets: match.offsets,
      phrase: match.phrase,
      wholeWord: occurrences > 0,
      occurrences
    }
    const rule = tierFor(candidate, q)
    if (!rule) continue
    ranked.push({
      entry: match.entry,
      offsets: match.offsets,
      phrase: match.phrase,
      tier: rule.tier,
      tierName: rule.name,
      occurrences: Math.max(1, occurrences)
    })
  }

  ranked.sort((a, b) => (a.tier !== b.tier ? a.tier - b.tier : withinTier(a.tier)(a, b)))

  const limit = options.limit ?? DEFAULT_LIMIT
  const truncated = ranked.length > limit
  return { query: q.raw, matches: truncated ? ranked.slice(0, limit) : ranked, truncated }
}

/** Exposed for tests: the ordered rule list, as names. */
export function tierNames(): string[] {
  return TIERS.map((rule) => `${rule.tier}. ${rule.name}`)
}
