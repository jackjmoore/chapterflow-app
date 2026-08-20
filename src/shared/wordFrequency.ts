/**
 * Overused-word analysis.
 *
 * The point is not "which words appear most" — that answer is always "the, of,
 * and". It's "which *distinctive* words am I leaning on without noticing":
 * crutch adverbs (suddenly, just, really), a pet adjective, a tic of phrasing.
 * So function words are filtered out entirely rather than ranked lower, and
 * repeated multi-word phrases are surfaced alongside single words because a
 * repeated construction ("out of the corner of her eye") is the kind of thing
 * a writer notices least in their own prose.
 */

/** Function words: filtered out completely. Repetition of these carries no
 *  signal — English can't be written without them. Deliberately does NOT
 *  include ordinary content words, so a genuinely overused 'quietly' or
 *  'shrugged' still surfaces. */
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', "aren't",
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  "can't", 'cannot', 'could', "couldn't", 'did', "didn't", 'do', 'does', "doesn't", 'doing', "don't",
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', "hadn't", 'has', "hasn't", 'have',
  "haven't", 'having', 'he', "he'd", "he'll", "he's", 'her', 'here', "here's", 'hers', 'herself', 'him',
  'himself', 'his', 'how', "how's", 'i', "i'd", "i'll", "i'm", "i've", 'if', 'in', 'into', 'is', "isn't",
  'it', "it's", 'its', 'itself', "let's", 'me', 'more', 'most', "mustn't", 'my', 'myself', 'no', 'nor',
  'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out',
  'over', 'own', 'same', "shan't", 'she', "she'd", "she'll", "she's", 'should', "shouldn't", 'so', 'some',
  'such', 'than', 'that', "that's", 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there',
  "there's", 'these', 'they', "they'd", "they'll", "they're", "they've", 'this', 'those', 'through',
  'to', 'too', 'under', 'until', 'up', 'very', 'was', "wasn't", 'we', "we'd", "we'll", "we're", "we've",
  'were', "weren't", 'what', "what's", 'when', "when's", 'where', "where's", 'which', 'while', 'who',
  "who's", 'whom', 'why', "why's", 'with', "won't", 'would', "wouldn't", 'you', "you'd", "you'll",
  "you're", "you've", 'your', 'yours', 'yourself', 'yourselves'
])

export interface Token {
  text: string
  /** Offset into the source text — used to build snippets and to count which
   *  occurrence within a document a result refers to. */
  start: number
  end: number
}

/** Words only, apostrophes and hyphens kept so "don't" and "half-open" stay
 *  whole. Unicode-aware so accented names tokenize correctly. */
const WORD_RE = /[\p{L}][\p{L}'’-]*/gu

export function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let m: RegExpExecArray | null
  WORD_RE.lastIndex = 0
  while ((m = WORD_RE.exec(text))) {
    tokens.push({ text: m[0].toLowerCase().replace(/’/g, "'"), start: m.index, end: m.index + m[0].length })
  }
  return tokens
}

export interface TermStat {
  /** Lowercased word or phrase. */
  term: string
  /** Number of words in the term: 1 for a single word, 2–3 for a phrase. */
  wordCount: number
  /** Total occurrences across everything scanned. */
  count: number
  /** Occurrences per 1000 words — lets a count be judged against length,
   *  since 8 uses in a short scene means something different from 8 across a
   *  whole novel. */
  per1000: number
  /** Per-document breakdown, in the order the documents were scanned. */
  byDocument: { documentId: string; count: number }[]
}

export interface AnalyzeOptions {
  /** Minimum occurrences before a term is reported at all. */
  minCount: number
  /** Terms the writer never wants flagged — character names, deliberate
   *  motifs. Matched case-insensitively against whole terms, and any phrase
   *  containing one is suppressed too. */
  ignore: string[]
  /** Single words shorter than this are skipped even when not stop words. */
  minWordLength: number
  /** Whether to look for repeated 2- and 3-word phrases as well. */
  includePhrases: boolean
}

export const DEFAULT_ANALYZE_OPTIONS: AnalyzeOptions = {
  minCount: 3,
  ignore: [],
  minWordLength: 4,
  includePhrases: true
}

export interface ScannedDocument {
  id: string
  name: string
  text: string
}

interface Bucket {
  count: number
  byDocument: Map<string, number>
}

function bump(map: Map<string, Bucket>, key: string, documentId: string): void {
  let bucket = map.get(key)
  if (!bucket) {
    bucket = { count: 0, byDocument: new Map() }
    map.set(key, bucket)
  }
  bucket.count += 1
  bucket.byDocument.set(documentId, (bucket.byDocument.get(documentId) ?? 0) + 1)
}

/**
 * Scans one or more documents and returns the terms worth a second look,
 * most-repeated first.
 */
/** Longest phrase considered. Seven covers the long stock constructions that
 *  matter most ("out of the corner of her eye") without the n-gram table
 *  growing without bound. */
const MAX_PHRASE_WORDS = 7

export function analyzeDocuments(documents: ScannedDocument[], options: AnalyzeOptions): {
  terms: TermStat[]
  totalWords: number
} {
  const ignore = new Set(options.ignore.map((w) => w.trim().toLowerCase()).filter(Boolean))
  const singles = new Map<string, Bucket>()
  const phrases = new Map<string, Bucket>()
  let totalWords = 0

  // Tokenize once per document and reuse across every phrase length.
  const tokensByDoc = new Map<string, Token[]>()
  for (const doc of documents) {
    const tokens = tokenize(doc.text)
    tokensByDoc.set(doc.id, tokens)
    totalWords += tokens.length

    for (const token of tokens) {
      const word = token.text
      if (
        word.length >= options.minWordLength &&
        !STOP_WORDS.has(word) &&
        !ignore.has(word) &&
        // A bare number-like token carries no style signal.
        !/^\d+$/.test(word)
      ) {
        bump(singles, word, doc.id)
      }
    }
  }

  const phraseMin = Math.max(options.minCount, 3)

  if (options.includePhrases) {
    // Grown one word at a time, only extending phrases that already repeat
    // often enough. A phrase can't be more frequent than its own prefix, so
    // this finds exactly the same results as counting every n-gram outright
    // while keeping the table small enough to run over a whole novel.
    let frequentPrefixes: Set<string> | null = null

    for (let size = 2; size <= MAX_PHRASE_WORDS; size++) {
      const level = new Map<string, Bucket>()

      for (const doc of documents) {
        const tokens = tokensByDoc.get(doc.id) ?? []
        for (let i = 0; i + size <= tokens.length; i++) {
          const parts = tokens.slice(i, i + size).map((t) => t.text)
          if (frequentPrefixes && !frequentPrefixes.has(parts.slice(0, size - 1).join(' '))) continue
          // An ignored name suppresses the phrase entirely, including as a
          // growth path — that's what ignoring is for.
          if (parts.some((p) => ignore.has(p))) continue
          bump(level, parts.join(' '), doc.id)
        }
      }

      // Counting and reporting are deliberately separate. "out of the" is all
      // function words and worth reporting to nobody, but it still has to
      // count as a prefix or "out of the corner of her eye" could never grow
      // out of it.
      const frequent = new Set<string>()
      for (const [term, bucket] of level) {
        if (bucket.count < phraseMin) continue
        frequent.add(term)
        if (!term.split(' ').every((p) => STOP_WORDS.has(p))) phrases.set(term, bucket)
      }
      if (frequent.size === 0) break
      frequentPrefixes = frequent
    }
  }

  const perThousand = (count: number): number => (totalWords > 0 ? (count / totalWords) * 1000 : 0)

  const toStat = (term: string, bucket: Bucket, wordCount: number): TermStat => ({
    term,
    wordCount,
    count: bucket.count,
    per1000: perThousand(bucket.count),
    byDocument: [...bucket.byDocument.entries()].map(([documentId, count]) => ({ documentId, count }))
  })

  const results: TermStat[] = []
  for (const [term, bucket] of singles) {
    if (bucket.count >= options.minCount) results.push(toStat(term, bucket, 1))
  }

  const phraseStats: TermStat[] = []
  for (const [term, bucket] of phrases) {
    phraseStats.push(toStat(term, bucket, term.split(' ').length))
  }

  // Word-boundary containment: "her" is inside "the corner of her eye" but not
  // inside "hero". Terms are space-joined words, so padding makes this exact.
  const contains = (outer: string, inner: string): boolean => ` ${outer} `.includes(` ${inner} `)

  // One repeated construction should be one finding. "corner of her", "of her
  // eye" and "the corner of" are all fragments of "out of the corner of her
  // eye" — reporting four rows for one habit is worse than reporting none.
  const keptPhrases = phraseStats.filter(
    (candidate) =>
      !phraseStats.some(
        (other) =>
          other !== candidate &&
          other.wordCount > candidate.wordCount &&
          other.count >= candidate.count &&
          contains(other.term, candidate.term)
      )
  )
  results.push(...keptPhrases)

  // Same argument one level down: if every use of "corner" is already inside a
  // reported phrase, the bare word adds nothing.
  const deduped = results.filter(
    (candidate) =>
      candidate.wordCount > 1 ||
      !keptPhrases.some((phrase) => phrase.count >= candidate.count && contains(phrase.term, candidate.term))
  )

  deduped.sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
  return { terms: deduped, totalWords }
}

/** Every occurrence of `term` in `text`, as offsets — used for snippets and to
 *  address the Nth occurrence within a document when jumping. */
export function findTermOccurrences(text: string, term: string): { start: number; end: number }[] {
  const wanted = term.split(' ')
  const tokens = tokenize(text)
  const out: { start: number; end: number }[] = []
  for (let i = 0; i + wanted.length <= tokens.length; i++) {
    let match = true
    for (let k = 0; k < wanted.length; k++) {
      if (tokens[i + k].text !== wanted[k]) {
        match = false
        break
      }
    }
    if (match) out.push({ start: tokens[i].start, end: tokens[i + wanted.length - 1].end })
  }
  return out
}

/** A one-line window of context around an occurrence, for the results list. */
export function snippetAround(text: string, start: number, end: number, radius = 42): string {
  const from = Math.max(0, start - radius)
  const to = Math.min(text.length, end + radius)
  const prefix = from > 0 ? '…' : ''
  const suffix = to < text.length ? '…' : ''
  return `${prefix}${text.slice(from, to).replace(/\s+/g, ' ').trim()}${suffix}`
}
