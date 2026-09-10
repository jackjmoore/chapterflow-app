/**
 * What the renderer needs to know about a Scrivener import.
 *
 * The personal dictionary half is deliberately a two-step: scan and parse in
 * main, then show the writer the actual words before anything is written. That
 * file is machine-wide — one list shared by every Scrivener project on the
 * computer — so it routinely carries names from unrelated manuscripts, and a
 * count alone would not be enough to decide on.
 */

export type WordlistKind = 'literatureAndLatte' | 'scrivener'

export interface WordlistLocation {
  kind: WordlistKind
  path: string
  label: string
}

export interface ParsedWordlist {
  location: WordlistLocation | null
  words: string[]
  duplicates: number
  empty: boolean
  /** Present when the file was found but could not be read. */
  error?: string
  /** Set only for a manually picked file, which has no known location. */
  path?: string
}

export interface ScrivenerWordlistScan {
  /**
   * True when both known locations exist. Surfaced rather than resolved:
   * nothing documents which of the two wins, so picking one silently risks
   * importing the stale list.
   */
  ambiguous: boolean
  candidates: ParsedWordlist[]
  /** Both known locations, so the UI can say where it looked when it found
   *  nothing. */
  searched: WordlistLocation[]
}

export type ScrivenerWordlistPick =
  | { canceled: true }
  | { canceled: false; parsed?: ParsedWordlist; error?: string }

/** What an attempted project import reports back. */
export type ScrivenerProjectImportResult =
  | { imported: false; reason?: string }
  | {
      imported: true
      path: string
      documents: number
      /** Earlier versions brought across, keeping their original dates. */
      snapshots: number
      warnings: { kind: string; count: number }[]
      /** Things worth telling the writer that are not losses — a name
       *  collision, a root document that needed wrapping. */
      notes: string[]
      failures: { fileName: string; reason: string }[]
    }
