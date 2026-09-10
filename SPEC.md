# Book-Interior Compile Preset — Specification

Status: agreed, not yet built. Decisions below were settled in review on 2026-09-05;
where a decision was the user's, it is stated as fixed, not open.

## Summary

A third compile style, `book`, producing a print/POD-ready PDF interior:
indent-based paragraph separation with no vertical gaps, a consistent 2-inch
chapter drop, recto/verso pagination with blank-verso insertion, mirrored
gutter margins, stamped running headers and folios, and a roman-numeral front
matter restarting at Arabic 1 in the body. PDF only, compile-only. The
`standard` and `manuscript` presets are untouched.

## Why the architecture looks like this

Chromium's `printToPDF` — the engine behind every ChapterFlow PDF — has one
header/footer template for the whole document, an Arabic-only page counter
that cannot restart, no roman numerals, no per-page suppression, no `@page`
margin boxes, and no alternating margins. None of the folio requirements can
be rendered by Chromium directly. Therefore:

1. **Segmented render.** The book is rendered as a sequence of independent
   `printToPDF` calls — one per front-matter page, the Contents, each
   part-title page, each chapter, each back-matter document — with no
   Chromium headers or footers at all.
2. **Assembly.** A PDF library (`pdf-lib`, pure JS, no network — consistent
   with the no-network positioning) merges the segments, inserting blank
   versos where recto placement demands, and tracking the physical index of
   every page.
3. **Stamping.** Folios and running headers are drawn onto the assembled
   pages by the assembler, which — unlike Chromium — knows each page's
   physical parity, its numbering sequence, and whether it is an opener,
   a blank, or a blind display page.

Consequence, accepted: the in-app frozen compile viewer shows the content
HTML without folios, blanks, or gutter shift. The stored PDF is the artifact
of record; the viewer caption should say so.

## Fixed decisions (from review)

- **Formats:** PDF only. In the compile panel, selecting the Book style
  disables the other three format buttons and forces `format: 'pdf'`.
- **Availability:** compile-only. `export:document`, `export:project`,
  `print:document`, `print:project` never accept `book` (defensive check:
  they throw on it rather than mis-rendering).
- **Preset model:** `book` is a third `ExportPreset`. `standard` and
  `manuscript` behavior is unchanged everywhere.
- **Trim sizes:** fixed list — 5×8, 5.25×8, 5.5×8.5, 6×9 inches. Stored
  per-project in compile settings. No relation to the editor Page Setup or
  the existing compile `pageSize` (which continues to govern the other two
  presets).
- **Margins:** fixed per trim, mirrored, no settings. Values (inches):

  | Trim      | Top  | Bottom | Outer | Inner (gutter) |
  |-----------|------|--------|-------|----------------|
  | 5×8       | 0.75 | 0.75   | 0.5   | 0.75           |
  | 5.25×8    | 0.75 | 0.75   | 0.5   | 0.75           |
  | 5.5×8.5   | 0.75 | 0.75   | 0.563 | 0.813          |
  | 6×9       | 0.75 | 0.75   | 0.625 | 0.875          |

- **Running headers:** author surname-less full name? No — verso header is
  the **author name as entered**, recto header is the **book title**; both
  suppressed on chapter openings, part-title pages, blind pages, and blanks.
  Folio in the **outer top corner** on normal pages, sharing the header
  line; **bottom center** on chapter openings. Part-title pages are blind
  (no folio at all).
- **Chapters** (revised 2026-09-05 — folder merging removed, then document
  runs removed with it): a chapter is a document in Draft, at any depth —
  uniformly, with no exceptions and no scene relationship between
  documents. Folders never merge their contents into a chapter: an
  undesignated folder is grouping only, walked through transparently, its
  name appearing nowhere in the book. (The original decision 6b — a
  non-Part folder at chapter position merges its scene documents into one
  chapter — is withdrawn, as is the run-merging form of the old
  `bookDocumentBoundary` setting.) Front/back matter contents are never
  chapters.
- **Parts:** a folder is a Part only when explicitly designated (new folder
  flag, see below). Parts get their own recto part-title page.
- **Recto policy:** part-title pages and Chapter 1 open recto, blank verso
  inserted if needed. Other chapters start on either hand.
- **Numbering:** front matter counts in lowercase roman from physical page 1
  (the half title = i). Arabic restarts at 1 on the first body page — the
  Part I title page when parts exist (blind), otherwise Chapter 1's opening
  page. Arabic continues unbroken through back matter. No sequence ever
  skips or restarts elsewhere.
- **Front matter order:** half title → title → copyright → dedication →
  Contents. All four display pages are blind. Roman folios become visible at
  the generated Contents page. Convention for extra documents: front-matter
  documents 1–4 (binder order) are the blind display pages; documents 5+
  (e.g. a Preface) render **after** the Contents with visible roman folios.
  Existing projects' front matter does not auto-restructure — accepted v1
  limitation, surfaced as a validation warning, never a block.
- **Contents:** optional (new setting, default on). Linked via the PDF
  outline (bookmarks for parts and chapters); the printed Contents lists
  titles without page numbers in v1.
- **Document separation (revised 2026-09-05, replacing the old
  `bookDocumentBoundary`):** one per-project compile setting,
  `documentSeparation`, governs how consecutive Draft documents are
  separated in paged output — every style (standard, manuscript, book),
  every document boundary, uniformly. 'page' (the default): every document
  begins on a new page. 'divider': documents run on continuously, the
  project's scene-break marker between consecutive documents instead of a
  page break. Purely a formatting choice made at render time: it never
  changes what is a chapter, what the Contents lists, or any plan
  structure, and every document keeps its own opening (in compact run-on
  form mid-page under 'divider'). In the book renderer, 'divider' flows a
  stretch of consecutive chapters as one printToPDF segment (part-title
  pages always break a stretch), so the PDF outline can only carry an entry
  per stretch; the printed Contents still lists every chapter. Plain text
  and Markdown have no pages and ignore the setting. Legacy compile.json
  files holding `bookDocumentBoundary` migrate: 'page-break' → 'page',
  'scene-break' → 'divider'.
- **Chapter opening:** one shared 2-inch drop constant used by book mode,
  the manuscript PDF (`.chf-section-title`, `.chf-chapter-break + *`), and
  the manuscript DOCX spacer — all three currently hold literal `2`s; they
  move to the constant. Opening composes from `chapterNumber` metadata when
  set — "CHAPTER THREE" (words to twenty, numerals beyond, per the app's
  copy rule) above the binder name — falling back to the binder name alone.

## Defaults decided without review (stated for the record)

- Body text justified with real hyphenation. Discovered in the build:
  Electron ships without Chromium's hyphenation dictionaries (a downloaded
  browser component), so `hyphens: auto` is silently inert — verified
  against rendered pages. Since justification without hyphenation is the
  combination the project's own rules forbid, prose runs are preprocessed
  with soft hyphens (the pure-JS `hyphen` package, Liang patterns, no
  network) before rendering; CSS honors them under the default
  `hyphens: manual`. Headings, scene-break markers, and display pages are
  left unhyphenated.
- Fixed typography, no knobs: the app serif stack, 11pt, line-height 1.45.
  First paragraph of a chapter and first after a scene break flush left;
  every subsequent paragraph `text-indent: 1.4em`; `p { margin: 0 }`.
  Implemented as `p + p { text-indent: 1.4em }` plus
  `.chf-scene-break + p { text-indent: 0 }` — indentation follows structure,
  never per-paragraph writer effort.
- Widow/orphan control, heading keep-with-next, and scene-break rendering
  (project `sceneBreakMark` setting) carried over from the shared CSS.
- Continuous separation ('divider') inserts one scene-break paragraph
  between consecutive documents. A document that already ends with a typed
  divider will show a doubled break — accepted edge, caught by eye, not
  code.
- Inline `data-chapter-break` nodes inside a book-mode document act as plain
  page breaks (chapters come from binder structure); a validation warning
  suggests splitting into binder chapters instead.
- Footnotes remain endnotes, one section after the last chapter, before back
  matter — same engine limit as the existing PDF path.
- PDF page labels (`/PageLabels`: roman then arabic) are written so PDF
  viewers display i–vii, 1, 2… matching the stamped folios.
- First physical page is always recto. No final-blank padding to an even
  page count (POD printers handle the last leaf).
- Book compile word count = chapter content only, same rule as today.

## Files and interfaces

### New: `src/shared/book.ts`
Pure types and pure logic, testable without Electron.

```ts
export type BookTrim = 'trim5x8' | 'trim5_25x8' | 'trim5_5x8_5' | 'trim6x9'
export const BOOK_TRIMS: Record<BookTrim, {
  label: string
  widthIn: number; heightIn: number
  topIn: number; bottomIn: number; outerIn: number; innerIn: number
}>
export const CHAPTER_DROP_INCHES = 2  // consumed by toPdf.ts, toDocx.ts, book CSS

/** "CHAPTER THREE" for 3, "CHAPTER 21" beyond twenty, null when unset. */
export function chapterNumberLine(chapterNumber: number | null): string | null

export interface BookChapterPlan {
  title: string
  chapterNumber: number | null
  /** Exactly one document per chapter — the plan is purely structural. */
  documentId: string
  opensRecto: boolean  // true for chapter 1 of the book, wherever it sits —
                       // per review answer 7; part titles are also backed by
                       // a blank verso, so chapter 1 after a part lands on 3
}
export interface BookPartPlan { title: string; chapters: BookChapterPlan[] }
export interface BookPlan {
  frontDisplayIds: string[]   // docs 1–4 of front matter, blind
  frontTextIds: string[]      // docs 5+, roman-folioed, after Contents
  body: (BookPartPlan | BookChapterPlan)[]
  backIds: string[]
  warnings: string[]          // structure findings, folded into validation
}

/** Pure classification of the scoped forests per the chapter rules above. */
export function planBook(
  draftForest: BinderNode[],
  matterFront: BinderNode[],
  matterBack: BinderNode[]
): BookPlan
```

### New: `src/main/export/bookPdf.ts`
The segment renderer and assembler.

```ts
export interface BookRenderOptions {
  trim: BookTrim
  title: string
  authorName: string | null
  sceneBreakMark: string
  includeContents: boolean
}

/** One entry per physical page of the assembled PDF — the assembler's own
 *  record, returned for tests and never re-derived from the bytes. */
export interface BookPageMapEntry {
  physicalIndex: number            // 0-based
  kind: 'front-display' | 'contents' | 'front-text' | 'part-title'
      | 'chapter-opening' | 'body' | 'back' | 'blank'
  folio: { sequence: 'roman' | 'arabic'; number: number; visible: boolean }
  recto: boolean
}

export interface BookRender { output: Buffer; viewHtml: string; pageMap: BookPageMapEntry[] }

export async function renderBookPdf(
  plan: BookPlan,
  loadBlocks: (id: string) => Promise<Block[]>,   // injected; documentStore in prod
  options: BookRenderOptions
): Promise<BookRender>
```

Internals, in order:
1. **Segment HTML.** One `BOOK_CSS` (new, in this file): trim-size page via
   `printToPDF` explicit inches; symmetric horizontal margins of
   `(outer+inner)/2`; drop, indent, justification, hyphenation, widow/orphan
   rules; chapter opening = optional `chapterNumberLine` + title, then body.
   Wrapper emits `<html lang="en">`. No Chromium header/footer, no tagged
   PDF (the outline is written by the assembler).
2. **Render** each segment through one reused offscreen `BrowserWindow`
   (create once, `loadURL` per segment — not one window per segment).
3. **Assemble** with `pdf-lib`: copy pages in order; before any
   `opensRecto` segment and before each front-matter display page that
   convention seats on a recto (half title, title, dedication, Contents),
   insert a blank if the next physical page would be verso. Copyright takes
   the title's verso directly, never a blank between.
4. **Gutter shift.** Implemented by shifting each copied page's MediaBox
   (and CropBox) origin by `±(inner−outer)/2` rather than rewriting content
   streams: moving the visible window is deterministic against whatever
   operators Chromium emits, where `translateContent` (the originally
   planned mechanism) wraps content streams whose behavior against
   Chromium's output was the spec's named risk. Stamps compensate for the
   origin when drawn; verification step 4 asserts mirrored origins instead
   of translation operators.
5. **Stamp** folios and running headers per the page map (Times-Roman
   standard font, ~9.5pt; the slight face difference from the body serif is
   accepted for v1 — embedding the body font means shipping font bytes).
6. **Outline + page labels**: `/Outlines` entries for each part and chapter
   (pdf-lib low-level dicts, same as any outline writer); `/PageLabels` for
   the roman→arabic split.

### Changed: `src/shared/export.ts`
`ExportPreset` gains `'book'`. `CHAPTER_DROP_INCHES` imported where the
literal 2s live today ([toPdf.ts](src/main/export/toPdf.ts) manuscript CSS ×2,
[toDocx.ts](src/main/export/toDocx.ts) spacer).

### Changed: `src/shared/compile.ts` + `src/main/compileSettingsStore.ts`
`CompileSettings` gains `bookTrim: BookTrim` (default `'trim6x9'`) and
`bookIncludeContents: boolean` (default `true`); seeded and sanitized like
the existing fields. `CompilePreset` sanitizer accepts `stylePreset: 'book'`.

### Changed: `src/shared/binder.ts`, `src/main/binderStore.ts`, preload, `src/renderer/src/BinderContextMenu.tsx`
`FolderNode` gains `isPart?: boolean`. New `binderStore.setFolderIsPart(id,
value)` + IPC `binder:setFolderIsPart` + preload typing. Context menu shows
"Mark as Part" / "Unmark as Part" on folders that are direct children of
Draft only. Designation deeper in the tree is ignored by `planBook` and
produces a warning. (Folder metadata in binder.json is consistent with the
existing decision that node metadata lives there.)

### Changed: `src/shared/compileValidation.ts` + `src/main/compile/validate.ts`
New warning kinds (never blocks): `book-structure` (inline chapter breaks;
`isPart` off level 1), `book-front-matter` (book style with no designated front-matter
folder — the output would open on Chapter 1 with no title page; also fires
when front matter predates the half-title seeding). Both only produced when
validating with `stylePreset === 'book'`.

### Changed: `src/main/export/index.ts` and `src/main/index.ts`
`renderProjectCompile` routes `preset === 'book' && format === 'pdf'` to
`planBook` + `renderBookPdf` (loader = `documentStore.loadDocument` →
`htmlToBlocks`); any other format with `book` throws. `compile:run` passes
trim/contents settings through; `CompiledDraftMeta` gains optional
`bookTrim?: BookTrim` (old records unaffected; `pageSize`/`marginMm` keep
their existing meaning for the other presets). The export/print IPC handlers
reject `book`.

### Changed: `src/renderer/src/CompileView.tsx`
Style picker gains Book with a hint ("A print-ready interior: mirrored
margins, running headers, roman-numeral front matter."). When selected:
non-PDF format buttons disabled and format forced to `pdf`; the Page step
swaps the page-size/margin controls for a trim select plus a fixed-margins
hint; a Contents on/off row appears; the proof column may keep its current
approximation (not a rendering of the new layout — the caption already says
the proof approximates).

### Changed: `src/main/templates.ts`
`createFrontMatter` seeds a **Half Title** document (centered title only)
before Title Page, so new front matter matches the expected order. Existing
front matter is left alone.

### Changed: `package.json`
`pdf-lib` added as a dependency (pure JS; no network calls).

## Personal details (added 2026-09-05; not part of the original review —
this section is the record of that later decision)

A per-project store of the writer's name, contact number, and address for
the compiled output's matter pages, edited from a slim sticky bar at the
top of the Compile panel (the Continuity Board's toolbar treatment).

- Stored as `personalDetails` on the compile settings (compile.json), never
  baked into document prose. Matter documents place the values with literal
  `{{name}}`, `{{contact}}` and `{{address}}` markers; compile substitutes
  the current stored values at render time (escaped, multi-line addresses
  breaking onto their own lines, unset fields substituting as nothing,
  unknown markers left alone). Editing the details therefore updates every
  future compile without re-editing the matter documents.
- Substitution applies to matter documents only — front and back, all
  presets including book — never to Draft content.
- The front-matter template seeds the marker block on the copyright page,
  where a book conventionally carries contact details; the markers work in
  any matter document, so writers move them freely.

## Explicitly out of scope for v1

- Book-mode DOCX, EPUB, or any non-PDF format; EPUB remains nonexistent.
- Page numbers or dot leaders on the printed Contents (needs a measure →
  re-render pass); clickable in-PDF Contents lines (navigation is the
  outline).
- Configurable typography, margins, or header text; drop caps or small-caps
  openings; per-chapter recto forcing beyond the fixed policy.
- Auto-restructuring existing front matter; roman folios on front-matter
  documents seated before the Contents.
- True page-bottom footnotes (engine limit; endnotes stand).
- Even-page-count padding; crop/bleed marks; the editor page view and
  `pagePreview.ts` (untouched); the compile viewer showing folios/blanks.

## Verification

Per CLAUDE.md: a passing suite has repeatedly not meant the page rendered
correctly — Chromium print-fragmentation behavior (margins at forced breaks,
`break-before` interactions) and everything the assembler stamps must be
confirmed against real output, not inferred from code.

**Code-verifiable (new `tests/book.test.ts`, node-only, plus an Electron
suite extension):**
1. `planBook` — every chapter-rule case: level-1 doc, folders as transparent
   grouping (never merged), Part with docs and grouped folders, matter never
   chapters, `isPart` ignored off level 1, the plan identical regardless of
   the separation setting. Pure, no Electron.
2. `chapterNumberLine` words/numerals boundary; `CHAPTER_DROP_INCHES`
   actually referenced by manuscript PDF CSS and DOCX spacer (grep-level
   pin so the constant can't silently fork again).
3. Electron suite (extends the `run-electron-test.mjs` pattern): compile a
   fixture project (front matter, Part I with a chapter and a grouping
   folder of two scenes, a level-1 chapter, back matter) and assert on the
   returned
   **pageMap**, not the bytes: roman/arabic split at the part page, blanks
   only before recto-forced pages, parity of every `opensRecto` entry,
   blind pages marked invisible, back matter continuing the Arabic count.
   Then against the bytes: page count matches the map, `/PageLabels`
   present, outline titles match parts + chapters, stamped header strings
   reachable through the existing `pdfText` CMap decoder on a body page and
   absent on opener/blind pages.
4. Gutter checkpoint: a dedicated assertion that a known verso/recto body
   pair carries mirrored MediaBox origins of exactly ±(inner−outer)/2, and
   that blank pages are unshifted.

**Visual confirmation required (mupdf rasterization in the scratchpad, per
the project memory note; sample harness as used for the 2026-09 compile
fixes):**
5. Chapter drop is optically identical on a part-followed chapter, a
   mid-book chapter, and after an inline page break — the known Chromium
   forced-break margin risk.
6. Justification quality: no rivers, hyphenation actually active (inspect a
   narrow 5×8 render, where its absence is obvious).
7. Gutter: body text visibly biased toward the outer edge on both a verso
   and a recto page; folios in the outer corner on both hands; chapter
   openings folio-at-bottom-center; blind and blank pages empty of any
   stamp.
8. Front matter sequence page-by-page: half title (i, blind, recto), blank,
   title (blind, recto), copyright (blind, verso), dedication (blind,
   recto), Contents (roman, visible, recto), then Arabic 1 at the first
   body page.

**Print confirmation (one physical pass before calling v1 done):**
9. Duplex-print a sample on Letter (scaled) or the actual trim if available:
   verify recto/verso land on the correct physical hands, the gutter sits at
   the spine on both, and blank versos are where the file says they are —
   the one property no rasterized single-page inspection can prove.
