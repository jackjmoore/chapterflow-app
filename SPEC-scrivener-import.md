# Scrivener Import — Metadata, Snapshots and Classification — Specification

Companion to `SPEC.md` (the Book-Interior Compile Preset), which is a different
feature and is left untouched. Written after the surveys in
`tools/scriv-import/reports/`, against a real 150-item Scrivener 3 project on
Windows.

---

## Summary

Five additions to the Scrivener importer, scoped together because they compete
for the same two fields on `DocumentNode` and deciding them separately risks
incompatible schema choices:

1. **Status** → the existing `statusId`, adopting Scrivener's palette.
2. **Label** → a tag, because `statusId` is already taken by Status.
3. **Keywords** → tags.
4. **Custom metadata** → **not imported**; counted and reported.
5. **Section types** → Heading-typed folders directly under Draft become Parts;
   nothing else.
6. **Snapshots** → imported, keeping their original dates and titles.

Plus the previously-open **notes field**, which this spec confirms stays as
built rather than becoming one entry in a generic system.

### The one decision "yes to all" could not resolve

Question 1 offered three options, not a yes/no. This spec assumes **(a) map onto
existing fields**. The reasoning is that it best serves the stated reason for
scoping these together — avoiding incompatible schema choices — because under
(a) the unvalidated parts (custom metadata) commit to **no schema at all**. They
are reported as dropped. Nothing is written that a later design could contradict.

If you meant (b) or (c), the differences are localised and listed under
"What changes if the answer was (b) or (c)" below. Correct it before
implementation begins, not after.

---

## Why the architecture looks like this

**Scrivener has four per-document metadata kinds; ChapterFlow has two.** Label
(one, coloured), Status (one, named), Keywords (many) and Custom Metadata
(typed) map onto `statusId` (one) and `tagIds` (many). Label and Status both
want `statusId`. Status wins it because Scrivener's Status *is* a workflow state
in the same sense ChapterFlow's is — To Do / In Progress / First Draft — whereas
Label is an arbitrary colour the writer assigns whatever meaning they like,
which is what a tag is.

**The evidence says most of this is unexercised.** In the surveyed project:

| | defined | used |
|---|---|---|
| Status | 6 | 18 documents |
| Label | 6 | **0 documents** |
| Keywords | — | **0** |
| Custom metadata | — | **0** |
| Snapshots | — | **2**, added later so this could be built against evidence |
| Section type | 3 | **5 of 150 items** |

Only Status is exercised. Everything else would be built against nothing, which
is why the spec maps what exists, reports what it cannot carry, and commits no
schema to the rest.

**Keywords are not Lexicon entries.** The Lexicon is
`{ word, meaning, pronunciation }` and every entry registers its word with the
spellchecker (`lexiconStore.addEntry` → `suppressedWordStore.addPhrase`).
Importing keywords there would silently suppress them as misspellings. They are
per-document filter labels, which is `tagIds`.

**Section types are 3% explicit.** 145 of 150 items inherit from Scrivener's
structural defaults (`<LevelTypes>` / `<Folders>` / `<Containers>` / `<Files>`),
so honouring the explicit value alone achieves almost nothing, and honouring
inheritance means reimplementing Scrivener's resolution rules. ChapterFlow also
has no chapter/scene concept to receive it: `flattenBinderOutline` already
derives heading levels 1–3 from binder depth. The one mapping worth its cost is
`isPart`, which is a real flag the book compile preset reads.

---

## Fixed decisions

1. **Status → `statusId`.** The import replaces the new project's status palette
   with Scrivener's, via `binderStore.setStatuses`. Safe because imports create a
   new project, so there is nothing to merge with. ID `-1` ("No Status") maps to
   `statusId: null`, never to a status named "No Status".

2. **Label → a tag.** Each Scrivener label becomes a `TagDef`. Its floating-point
   RGB triple (`0.993500 0.701213 0.732586`) converts to hex by
   `round(component * 255)`. ID `-1` ("No Label") produces no tag.

3. **Keywords → tags**, merged into the same `TagDef` palette as labels, deduped
   case-insensitively by name. A document's keywords and its label all land in
   `tagIds` together.

4. **Custom metadata is not imported.** No generic field system is built. Every
   custom field encountered is counted and surfaced in the import report under a
   new warning kind. It is never silently discarded.

5. **Section types: only `isPart`.** A folder whose resolved section type is
   named `Heading` (case-insensitive), sitting as a direct child of Draft, gets
   `isPart: true`. Resolution reads the explicit `<SectionType>` only —
   structural-default inheritance is **out of scope**. Everything else about
   section type is ignored without a warning, because binder depth already
   carries it.

6. **Snapshots are imported, keeping their original dates.** Both blockers
   named in the first draft of this spec are now resolved.

   **The layout, confirmed against a real project rather than guessed:**

   ```
   Snapshots/
     <documentUUID>.snapshots/          a directory, despite the extension
       index.xml                        <Title>, <Date>, <StyleIDs> per snapshot
       2026-09-06-19-44-13+0100.rtf     the content, named by its own date
   ```

   Two details neither guess would have reached. The RTF filename encodes the
   same timestamp `index.xml` records, so an entry is matched to its content by
   deriving the filename from the date rather than by trusting document order —
   a snapshot attached to the wrong text is worse than one skipped. And
   `<StyleIDs>` is the same comma-separated list as a document's
   `content.styles`, so snapshot RTF carries the same `<$Scr_Ps::N>` markers and
   needs the same style resolution; without it every snapshot of a chapter would
   open with `<$Scr_Ps::0>`.

   **Titles are real.** The first draft assumed snapshots would be named from
   their date. They carry a `<Title>`, so a named snapshot keeps its name, and
   Scrivener's placeholder `Untitled Snapshot` becomes no name rather than being
   imported as a literal title.

   `snapshotStore.importSnapshot` preserves the original timestamp and refuses
   an unreadable one rather than substituting now. Import-time dates were
   rejected: a history claiming every revision happened at the moment of import
   misrepresents itself, and a diff between two such snapshots would show both
   as today.

7. **`DocumentNode.notes` stays as built** — a dedicated `notes: string`, with
   its outliner column and corkboard card back. It is not folded into a generic
   field system, because no generic field system is being built.

---

## Defaults decided without review (stated for the record)

- Imported snapshots would be `auto: false`, named from their Scrivener date.
- A Scrivener status or label name that already exists in the palette is reused
  rather than duplicated, matched case-insensitively.
- `IncludeInCompile` is read and reported but **not** honoured: ChapterFlow's
  compile scope is the Draft folder, and a per-document opt-out has no
  representation. Documents excluded in Scrivener still import into Draft.
- Tag colours for keywords, which Scrivener gives no colour, are assigned from
  the existing preset rotation rather than invented per import.
- Label and keyword tags are distinguishable only by name; no provenance is
  recorded on `TagDef`.

---

## Files and interfaces

### Changed — shared

**`src/shared/import.ts`** — two new members on `ImportWarningKind`, with their
`IMPORT_WARNING_LABELS` entries (the labels are a `Record` over the union, so
TypeScript forces both together):

```ts
| 'customMetadataDropped'      // "custom metadata fields dropped"
| 'compileFlagsIgnored'        // "Include in Compile settings ignored"
```

Plus the two the RTF reader already needs, currently local to the lab as
`LabWarningKind` in `tools/scriv-import/src/rtfToBlocks.ts`:

```ts
| 'annotationsDropped'
| 'textEncodingFallback'
```

### Changed — main

**`src/main/snapshotStore.ts`** — one new function, the only ChapterFlow-side
change snapshots need:

```ts
/**
 * Writes a snapshot with content and a timestamp supplied by the caller,
 * for importing history that happened elsewhere. createSnapshot cannot do
 * this: it reads the current document and stamps the current time, which is
 * right for taking a snapshot and wrong for recording one.
 */
export function importSnapshot(
  documentId: string,
  html: string,
  timestamp: string,   // ISO 8601, from the source
  name: string | null
): Promise<SnapshotMeta>
```

Invariants: appends to the existing `snapshots/<documentId>/index.json` rather
than replacing it; keeps the index sorted newest-first as `listSnapshots`
expects; refuses a timestamp that does not parse rather than substituting now.

**`src/main/binderStore.ts`** — `insertSubtree(parentId, nodes)` from the import
plan, unchanged from that specification. Required, not an optimisation: a
150-item binder through `createDocument` is several hundred whole-file writes.

**`src/main/searchIndex.ts`** — `suspend()` / `resume()`, also from the import
plan. `onProjectWrite` re-serialises the entire index on every project write, so
a 129-document import is quadratic without it.

### New — main

**`src/main/import/scrivener/`** — the lab modules moved, not rewritten:

| from `tools/scriv-import/src/` | responsibility |
|---|---|
| `rtfToBlocks.ts` | RTF → `Block[]`, over `rtf-stream-parser`'s `Tokenize` |
| `codepage.ts` | `\ansicpg` → an `iconv-lite` encoding |
| `scrivenerStyles.ts` | `content.styles` + `styles.xml` → heading recovery |
| `scrivxToTree.ts` | the binder manifest |
| `projectSource.ts` | folder or `.zip`, read-only |

Two dependencies move to the app's `package.json`: `rtf-stream-parser@4.0.0`
and `iconv-lite@0.7.3`, both MIT, the first with no dependencies of its own.

**`src/main/import/scrivener/metadata.ts`** — new, the subject of this spec:

```ts
export interface ScrivLabelDef { id: string; name: string; color: string }
export interface ScrivStatusDef { id: string; name: string }

export interface ScrivMetadataSettings {
  labels: ScrivLabelDef[]
  statuses: ScrivStatusDef[]
  /** Section type id -> name, from <TypeDefinitions>. */
  sectionTypes: Map<string, string>
  /** Field names only. Present so the count is honest; values are not read. */
  customFieldNames: string[]
}

/** Reads <LabelSettings>, <StatusSettings>, <TypeDefinitions> and any
 *  custom-metadata definitions from the .scrivx. */
export function readMetadataSettings(xml: string): ScrivMetadataSettings

/** Scrivener writes colours as three floats; ChapterFlow wants hex. */
export function scrivColorToHex(triple: string): string

export interface MappedPalettes {
  statuses: StatusDef[]
  tags: TagDef[]
  /** Scrivener StatusID -> ChapterFlow StatusDef.id, with -1 absent. */
  statusById: Map<string, string>
  /** Scrivener LabelID -> TagDef.id, with -1 absent. */
  tagByLabelId: Map<string, string>
  /** Keyword title -> TagDef.id, matched case-insensitively. */
  tagByKeyword: Map<string, string>
}

export function mapPalettes(
  settings: ScrivMetadataSettings,
  keywords: string[]
): MappedPalettes
```

`ScrivNode` in `scrivxToTree.ts` gains `keywords: string[]` and
`sectionTypeId: string | null` alongside the existing `labelId` / `statusId`.

### Changed — IPC and renderer

**`src/main/index.ts`** — one handler, modelled on `project:createNew`
(`~1425`):

```ts
ipcMain.handle('scrivener:importProject', async (event) => { … })
```

Sequence, with the ordering that matters: pick source → pick destination →
parse **everything** before writing anything → `setProjectRoot` →
invalidate binder/storyBible/wordCount caches → `setProjectName` →
`setStatuses` + `setTags` → `searchIndex.suspend()` → write every
`documents/<id>.html` → **then** one `insertSubtree` per root →
`searchIndex.resume()` in a `finally` → `lifetimeStore.recordProjectOpened`.

Documents before binder is deliberate: a crash after the binder lands leaves a
project full of chapters that exist and are empty, indistinguishable from data
loss. The reverse leaves orphan files, which are discoverable and deletable.

**`src/renderer/src/ScrivenerImportModal.tsx`** — the "Project structure and
manuscript" checkbox becomes enabled. The personal-dictionary half is already
built and unaffected.

---

## Binder and placement mapping

| Scrivener | ChapterFlow |
|---|---|
| `DraftFolder` | `DRAFT_FOLDER_ID` |
| `ResearchFolder` | `NOTES_FOLDER_ID` |
| `TrashFolder` | `TRASH_FOLDER_ID` |
| any other root `Folder` | a custom top-level folder |
| a root `Text` item | **wrapped** in a custom top-level folder of the same name |
| `Folder` with body text | a document with children, not a folder |

The root-`Text` wrap is not cosmetic: `moveNode` refuses a document at the root
and `ensureStructuralFolders` sweeps stray root nodes into Draft, which would
silently move a non-manuscript document into the manuscript.

A root folder whose name collides with one of ChapterFlow's five protected
names (the surveyed project has one called "Matter") is imported as a custom
folder under its own name, and the collision is named in the import report. It
is not merged into the protected folder, because name-matching is the kind of
magic that misfires on someone else's project.

---

## Explicitly out of scope

- **A generic typed-field system** on `DocumentNode`. Revisit when a project
  that actually uses custom metadata exists to validate it against.
- **Section-type inheritance** from `<LevelTypes>` / `<Folders>` /
  `<Containers>` / `<Files>`. Only explicit `<SectionType>` is read.
- **Honouring `IncludeInCompile`.** Read and reported, never applied.
- **Scrivener 2 projects** (`Files/Docs/<integer>.rtf`). Detected and refused
  with a clear message rather than half-imported.
- **Writing Scrivener projects.** Import only, and the source is opened
  read-only throughout.
- **Comments, footnotes and images.** Already counted as warnings by the RTF
  reader; no destination is specified here.
- **macOS-authored projects.** Untested, accepted gap. List markup is the most
  likely difference.
- **Collections, bookmarks, `search.indexes`, `writing.history`.** Read by
  nothing.

---

## Verification

**Unit, no corpus needed.** `tools/scriv-import/test/rtf.test.ts` moves to
`tests/scrivenerRtf.test.ts` with its 67 assertions intact, plus a new
`tests/scrivenerMetadata.test.ts` covering: the float-RGB conversion against the
six real label colours; `-1` mapping to no status and no tag; palette dedup by
name; and keyword-to-tag mapping.

**Store-level, in Electron.** `tests/structure.test.ts` gains `insertSubtree`
coverage (a subtree lands in one persist; a node carrying a structural id is
rejected; a duplicate id throws and mutates nothing; the tree survives
`invalidateCache()` + reload). `importSnapshot` gets its own: a snapshot written
with a 2024 timestamp lists with that timestamp, sorts newest-first against a
natively-taken one, and its content round-trips through `getSnapshotContent`.

**End-to-end, against the running app.** CLAUDE.md is explicit that a passing
suite has repeatedly not meant the UI updated, so the acceptance test is a real
import of `tools/scriv-import/corpus/for cf.scriv`, driven through the app,
asserting:

1. The binder shows Draft with 3 acts and 65 chapters, Research under Notes,
   "Old" and "Matter" as custom top-level folders, "Agent Matter" wrapped, and
   2 documents in Trash.
2. The Draft-scoped project word count reads **≈119,777** — the 65 chapters
   alone — while every imported document together totals **≈183,514**. These
   are different numbers on purpose: Research, Old, Matter and Trash are
   outside the manuscript, and the first draft of this spec wrongly asked for
   one figure to be both.
3. Opening Chapter 23 shows its title as an `h1` — recovered from the `Title`
   named style, since `\outlinelevel` appears nowhere in the project — with
   curly quotes and em dashes intact and **no `<$Scr_Ps::0>` anywhere**.
4. The outliner shows 18 documents carrying a status drawn from Scrivener's
   palette, and the status filter narrows to them.
5. The import report names: the custom-metadata fields dropped (0 here), the
   "Matter" name collision, the "Agent Matter" wrap, and the single flattened
   hyperlink.
6. Search finds a phrase from an imported chapter.
7. **Non-destructiveness:** every file inside the source `.scriv` is unchanged
   by checksum.
8. Screenshot the binder, the outliner and the import report.

**No longer blocked.** A project with snapshots was supplied, and the
acceptance test covers them end to end: both land on the right document, each
keeps its own Scrivener date, a named one keeps its title while the placeholder
becomes none, the content arrives with no style marker leaking, and its heading
is recovered from the snapshot own StyleIDs.

---

## What changes if the answer was (b) or (c)

Recorded so the decision is reversible cheaply.

- **(c) generic fields for custom metadata only:** adds
  `DocumentNode.fields: CustomField[]` with a `text | checkbox | list | date`
  union, a `normalizeTree` backfill to `[]`, `binderStore.setFields`, an IPC
  pair, and outliner display. Fixed decision 4 inverts. Nothing else moves —
  Status, Label and Keywords stay exactly as specified.
- **(b) everything generic:** as (c), plus Label and Keywords move out of
  `tagIds` into `fields`, and `DocumentNode.notes` is deleted in favour of a
  `text` field named "Notes" — which means unwinding the outliner column, the
  corkboard card back, the search indexing and the `notes` migration already
  shipped. This is the expensive one, and the reason the question was asked
  before more accreted onto `notes`.
