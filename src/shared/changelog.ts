/**
 * What has changed, newest first.
 *
 * Data rather than markup so the dashboard and — when it exists — a Help menu
 * entry can render the same list without one of them becoming the copy of
 * record. There is currently no Help entry; this is the first home for it.
 */

export interface ChangelogEntry {
  version: string
  /** ISO date, rendered in the reader's locale. */
  date: string
  changes: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.1.0',
    date: '2026-08-21',
    changes: [
      'A dashboard on every launch, with recent projects, lifetime writing totals and this change log.',
      'Project-wide search rewritten: an index maintained as you write, results ranked into tiers, and find and replace merged into the same bar.',
      'A Lexicon for invented words, which stops the editor marking them as misspelled without touching your system dictionary.',
      'Page view with real pagination, page breaks, and more page sizes.',
      'The collapsed binder is now a minimap of the manuscript rather than a strip of icons.',
      'Insert menu: images, footnotes, comments, page and chapter breaks, and word counts.',
      'A pass over spacing, type and depth across the interface.'
    ]
  }
]
