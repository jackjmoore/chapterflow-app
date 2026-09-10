/**
 * External word lookup — the app's first feature that reaches outside
 * itself, so its shape is deliberately narrow: two fixed, writing-specific
 * reference services (no general search engines), a URL built here from a
 * whitelisted template (the renderer never passes a URL across IPC, only a
 * word and one of these two kinds), and nothing fires until the user
 * explicitly picks a menu item — no background requests, no telemetry.
 *
 * Merriam-Webster serves both: one reputable publisher, stable URL scheme,
 * and the dictionary/thesaurus pair lives under a single domain.
 */
export type LookupKind = 'dictionary' | 'thesaurus'

export const LOOKUP_LABELS: Record<LookupKind, string> = {
  dictionary: 'Dictionary (Merriam-Webster)',
  thesaurus: 'Thesaurus (Merriam-Webster)'
}

export function isLookupKind(value: unknown): value is LookupKind {
  return value === 'dictionary' || value === 'thesaurus'
}

export function lookupUrl(kind: LookupKind, word: string): string {
  const path = kind === 'dictionary' ? 'dictionary' : 'thesaurus'
  return `https://www.merriam-webster.com/${path}/${encodeURIComponent(word)}`
}

/** The single word a selection means to look up: the first whitespace-run of
 *  the trimmed selection, with surrounding punctuation shed ("whisper," →
 *  whisper) but interior apostrophes/hyphens kept (don't, well-worn). */
export function lookupWordFrom(selectionText: string): string {
  const first = selectionText.trim().split(/\s+/)[0] ?? ''
  return first.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}
