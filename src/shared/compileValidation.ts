/**
 * Pre-compile validation: the types every layer shares, and the rules that
 * are pure data-in/findings-out (so the node test suite can pin them without
 * an Electron process). The checks that need the disk — document content,
 * store files — live in main/compile/validate.ts and call into these.
 *
 * Everything here is a *warning* the writer sees and can compile past, never
 * a silent fix and never a hard block: the pass exists to surface the
 * problems writers otherwise discover only after uploading somewhere.
 */

export type CompileFindingKind =
  | 'untitled-project'
  | 'missing-author'
  | 'chapter-duplicate'
  | 'chapter-order'
  | 'chapter-gap'
  | 'empty-document'
  | 'empty-footnote'
  | 'timeline-broken-link'
  | 'dangling-mention'
  // Book preset only — structure the book planner flattens or works around,
  // and front matter the interior expects. Warnings like everything else.
  | 'book-structure'
  | 'book-front-matter'

export interface CompileFinding {
  kind: CompileFindingKind
  /** Complete, self-contained sentence — shown verbatim in the pre-flight
   *  list and stored verbatim on the compile record. */
  message: string
  /** The binder document to jump to, when the finding is about one. */
  documentId?: string
}

export interface CompileValidationReport {
  findings: CompileFinding[]
  /** How many in-scope documents were actually opened and checked. */
  checkedDocuments: number
}

/** What the chapter-numbering rules need to know about one in-scope document,
 *  in binder order. */
export interface ChapterCheckDoc {
  id: string
  name: string
  chapterNumber: number | null
}

/** "A", "A" and "B", or "A", "B" and 3 more — for duplicate lists. */
function nameList(names: string[]): string {
  const quoted = names.map((n) => `“${n}”`)
  if (quoted.length <= 2) return quoted.join(' and ')
  return `${quoted[0]}, ${quoted[1]} and ${quoted.length - 2} more`
}

/**
 * Inconsistencies in the manual chapter-number labels, over the in-scope
 * documents in binder order: the same number used twice, numbers that run
 * backwards against binder order, and skipped numbers. Documents without a
 * number are simply not part of the sequence (scenes under a numbered
 * chapter are legitimately unnumbered), so an entirely unnumbered manuscript
 * produces no findings at all.
 *
 * The labels are only read, never rewritten — chapterNumber stays purely a
 * label, exactly as its declaration promises.
 */
export function chapterNumberFindings(docs: ChapterCheckDoc[]): CompileFinding[] {
  const numbered = docs.filter((d) => d.chapterNumber !== null)
  if (numbered.length < 2) return []
  const findings: CompileFinding[] = []

  const byNumber = new Map<number, ChapterCheckDoc[]>()
  for (const doc of numbered) {
    const group = byNumber.get(doc.chapterNumber as number) ?? []
    group.push(doc)
    byNumber.set(doc.chapterNumber as number, group)
  }
  for (const [number, group] of [...byNumber.entries()].sort((a, b) => a[0] - b[0])) {
    if (group.length < 2) continue
    findings.push({
      kind: 'chapter-duplicate',
      // The later occurrence is the likelier mistake, so it's the jump target.
      documentId: group[group.length - 1].id,
      message: `Chapter number ${number} is used by ${group.length} documents: ${nameList(group.map((d) => d.name))}.`
    })
  }

  for (let i = 1; i < numbered.length; i += 1) {
    const prev = numbered[i - 1]
    const doc = numbered[i]
    if ((doc.chapterNumber as number) < (prev.chapterNumber as number)) {
      findings.push({
        kind: 'chapter-order',
        documentId: doc.id,
        message: `“${doc.name}” is numbered ${doc.chapterNumber}, but follows “${prev.name}” (numbered ${prev.chapterNumber}).`
      })
    }
  }

  const unique = [...byNumber.keys()].sort((a, b) => a - b)
  for (let i = 1; i < unique.length; i += 1) {
    if (unique[i] - unique[i - 1] > 1) {
      findings.push({
        kind: 'chapter-gap',
        message: `Chapter numbers skip from ${unique[i - 1]} to ${unique[i]}.`
      })
    }
  }

  return findings
}
