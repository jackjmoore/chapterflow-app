import { diffWords } from 'diff'
import type { Node as PMNode } from '@tiptap/pm/model'
import { htmlToDoc } from './search/projectSearch'
import { extractTextWithPositions } from './search/searchCore'

/** A stretch of text present now but not in the reference snapshot. Real
 *  positions in the live document, so it can be decorated in place. */
export interface RevisionAddition {
  from: number
  to: number
}

/** Text that was in the snapshot and is now gone. It has no range in the live
 *  document — only the position where it used to begin. */
export interface RevisionDeletion {
  pos: number
  text: string
}

export interface RevisionDiff {
  additions: RevisionAddition[]
  deletions: RevisionDeletion[]
  hasChanges: boolean
}

export const EMPTY_REVISION_DIFF: RevisionDiff = { additions: [], deletions: [], hasChanges: false }

/**
 * The text a diff actually compares.
 *
 * Parsed through the editor's real schema rather than regex-stripped, because
 * the same flattening has to serve two callers: the Compare Snapshots modal,
 * which only needs the string, and revision mode, which needs every character
 * to still know where it lives in the document. A second, looser extraction
 * for the modal alone would let the two views disagree about what changed.
 */
export function diffText(html: string): string {
  return extractTextWithPositions(htmlToDoc(html)).text
}

/**
 * Word-level diff of a snapshot against the live document, expressed in
 * document positions.
 *
 * The comparison itself is jsdiff's `diffWords` — the same call the snapshot
 * comparison has always made. What this adds is the mapping back: jsdiff
 * answers in offsets into a flat string, and decorations need positions in a
 * real document.
 *
 * Only the current side is walked, because only the current side exists. A
 * cursor tracks how far through the current text the diff has travelled:
 * equal and added segments advance it (they are present now), removed
 * segments do not (they are not), which is precisely why a deletion collapses
 * to the single position where the missing text used to start.
 */
export function computeRevisionDiff(snapshotHtml: string, currentDoc: PMNode): RevisionDiff {
  const before = diffText(snapshotHtml)
  const { text: after, positions } = extractTextWithPositions(currentDoc)

  // Identical text is the common case once a snapshot has just been taken —
  // worth short-circuiting rather than walking a diff of one equal segment.
  if (before === after) return EMPTY_REVISION_DIFF

  const additions: RevisionAddition[] = []
  const deletions: RevisionDeletion[] = []
  const docEnd = currentDoc.content.size

  /** Position of the character at `offset`; the end of the document once the
   *  cursor has run past the last mapped character. */
  const positionAt = (offset: number): number => {
    const mapped = positions[offset]
    if (mapped !== undefined) return Math.min(mapped, docEnd)
    const last = positions[positions.length - 1]
    return last === undefined ? docEnd : Math.min(last + 1, docEnd)
  }

  let cursor = 0
  for (const part of diffWords(before, after)) {
    const length = part.value.length
    if (part.added) {
      const from = positionAt(cursor)
      const to = positionAt(cursor + length - 1) + 1
      // A run of pure block separators has no visible text to underline.
      if (to > from) additions.push({ from, to: Math.min(to, docEnd) })
      cursor += length
      continue
    }
    if (part.removed) {
      // Whitespace-only removals are noise — a paragraph split reads as a
      // deleted newline, which is not a change worth marking up.
      if (part.value.trim()) deletions.push({ pos: positionAt(cursor), text: part.value })
      continue
    }
    cursor += length
  }

  return { additions, deletions, hasChanges: additions.length > 0 || deletions.length > 0 }
}
