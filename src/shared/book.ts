import type { BinderNode } from './binder'

/**
 * The book-interior compile preset's pure model: trim geometry, the chapter
 * classification rules, and the small text helpers the renderer and the
 * workbench share. Everything here runs without Electron so the node test
 * suite can pin the planning rules directly. The renderer itself (segmented
 * printToPDF, assembly, stamping) lives in main/export/bookPdf.ts.
 */

export type BookTrim = 'trim5x8' | 'trim5_25x8' | 'trim5_5x8_5' | 'trim6x9'

export interface BookTrimSpec {
  label: string
  widthIn: number
  heightIn: number
  /** Fixed mirrored margins, per SPEC.md — no per-project margin settings. */
  topIn: number
  bottomIn: number
  outerIn: number
  innerIn: number
}

export const BOOK_TRIMS: Record<BookTrim, BookTrimSpec> = {
  trim5x8: { label: '5 × 8 in', widthIn: 5, heightIn: 8, topIn: 0.75, bottomIn: 0.75, outerIn: 0.5, innerIn: 0.75 },
  trim5_25x8: { label: '5.25 × 8 in', widthIn: 5.25, heightIn: 8, topIn: 0.75, bottomIn: 0.75, outerIn: 0.5, innerIn: 0.75 },
  trim5_5x8_5: { label: '5.5 × 8.5 in', widthIn: 5.5, heightIn: 8.5, topIn: 0.75, bottomIn: 0.75, outerIn: 0.563, innerIn: 0.813 },
  trim6x9: { label: '6 × 9 in', widthIn: 6, heightIn: 9, topIn: 0.75, bottomIn: 0.75, outerIn: 0.625, innerIn: 0.875 }
}

export const BOOK_TRIM_OPTIONS: { id: BookTrim; label: string }[] = (
  Object.entries(BOOK_TRIMS) as [BookTrim, BookTrimSpec][]
).map(([id, spec]) => ({ id, label: spec.label }))

export const DEFAULT_BOOK_TRIM: BookTrim = 'trim6x9'

export function isBookTrim(value: unknown): value is BookTrim {
  return typeof value === 'string' && value in BOOK_TRIMS
}

/** The one chapter-opening drop, shared by the book preset, the manuscript
 *  PDF (.chf-section-title / .chf-chapter-break) and the manuscript docx
 *  spacer — a single constant so the measurement can never fork again. */
export const CHAPTER_DROP_INCHES = 2

const NUMBER_WORDS = [
  '', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN',
  'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN',
  'EIGHTEEN', 'NINETEEN', 'TWENTY'
]

/** "CHAPTER THREE" for 3; numerals beyond twenty ("CHAPTER 21"), matching
 *  the app's copy rule for counts; null when the metadata isn't set. */
export function chapterNumberLine(chapterNumber: number | null): string | null {
  if (chapterNumber === null || !Number.isFinite(chapterNumber) || chapterNumber < 1) return null
  const n = Math.floor(chapterNumber)
  return n <= 20 ? `CHAPTER ${NUMBER_WORDS[n]}` : `CHAPTER ${n}`
}

/** Lowercase roman numerals for front-matter folios (1 → "i"). */
export function toRomanLower(n: number): string {
  if (!Number.isFinite(n) || n < 1) return ''
  const table: [number, string][] = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
    [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']
  ]
  let rest = Math.floor(n)
  let out = ''
  for (const [value, glyph] of table) {
    while (rest >= value) {
      out += glyph
      rest -= value
    }
  }
  return out
}

export interface BookChapterPlan {
  title: string
  chapterNumber: number | null
  /** Exactly one document per chapter — the plan is purely structural.
   *  How consecutive chapters share pages is the renderer's documentSeparation
   *  input, never a planning concern. */
  documentId: string
  /** Chapter 1 of the book opens recto (blank verso inserted if needed);
   *  every other chapter starts on either hand. */
  opensRecto: boolean
}

export interface BookPartPlan {
  kind: 'part'
  title: string
  chapters: BookChapterPlan[]
}

export interface BookChapterEntry extends BookChapterPlan {
  kind: 'chapter'
}

export interface BookPlan {
  /** Front-matter documents 1–4 in binder order: the blind display pages
   *  (half title, title, copyright, dedication by the seeded convention). */
  frontDisplayIds: string[]
  /** Front-matter documents 5+ (a preface, say): rendered after the
   *  Contents, with visible roman folios. */
  frontTextIds: string[]
  body: (BookPartPlan | BookChapterEntry)[]
  backIds: string[]
  /** Structure findings, folded into the pre-compile validation pass. */
  warnings: string[]
}

function documentIdsIn(nodes: BinderNode[]): string[] {
  const ids: string[] = []
  const walk = (list: BinderNode[]): void => {
    for (const node of list) {
      if (node.type === 'document') ids.push(node.id)
      walk(node.children)
    }
  }
  walk(nodes)
  return ids
}

/** Walks a forest at chapter level, emitting one chapter per document in
 *  binder order — a document's children compile as chapters after it, the
 *  same position the outline gives them. Folders are grouping only, walked
 *  through transparently, their names appearing nowhere in the book. */
function chaptersOf(nodes: BinderNode[], warnings: string[]): BookChapterPlan[] {
  const out: BookChapterPlan[] = []
  for (const node of nodes) {
    if (node.type === 'document') {
      out.push({
        title: node.name || 'Untitled',
        chapterNumber: node.chapterNumber,
        documentId: node.id,
        opensRecto: false
      })
      out.push(...chaptersOf(node.children, warnings))
    } else {
      if (node.isPart) {
        warnings.push(
          `“${node.name || 'Untitled'}” is marked as a Part but is not a top-level Draft folder — only those act as Parts, so its contents compile as ordinary chapters.`
        )
      }
      out.push(...chaptersOf(node.children, warnings))
    }
  }
  return out
}

/**
 * Classifies the scoped forests per the book chapter rules: chapters come
 * from documents, never from folders. Every document in Draft, at any
 * depth, is its own chapter — uniformly, with no exceptions. A folder is
 * grouping only: its name appears nowhere in the book. The one folder that
 * contributes anything is a top-level Draft folder designated as a Part
 * (recto part-title page); `isPart` anywhere else is ignored, with a
 * warning. Matter contents are never chapters. How consecutive chapters
 * share pages (the documentSeparation compile setting) is entirely the
 * renderer's concern — the plan is the same under both choices.
 */
export function planBook(
  draftForest: BinderNode[],
  matterFront: BinderNode[],
  matterBack: BinderNode[]
): BookPlan {
  const warnings: string[] = []
  const body: (BookPartPlan | BookChapterEntry)[] = []

  let pending: BinderNode[] = []
  const flushPending = (): void => {
    for (const chapter of chaptersOf(pending, warnings)) body.push({ kind: 'chapter', ...chapter })
    pending = []
  }
  for (const node of draftForest) {
    if (node.type === 'folder' && node.isPart) {
      flushPending()
      body.push({ kind: 'part', title: node.name || 'Untitled', chapters: chaptersOf(node.children, warnings) })
    } else {
      pending.push(node)
    }
  }
  flushPending()

  // Chapter 1 of the book — wherever it sits — opens recto.
  for (const entry of body) {
    if (entry.kind === 'chapter') {
      entry.opensRecto = true
      break
    }
    if (entry.chapters.length > 0) {
      entry.chapters[0].opensRecto = true
      break
    }
  }

  const frontIds = documentIdsIn(matterFront)
  return {
    frontDisplayIds: frontIds.slice(0, 4),
    frontTextIds: frontIds.slice(4),
    body,
    backIds: documentIdsIn(matterBack),
    warnings
  }
}
