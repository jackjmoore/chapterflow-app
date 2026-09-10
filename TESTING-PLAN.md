# ChapterFlow — testing strategy

The stable layer. Changes rarely, and changes to it are worth the same care as changes to
the data model. Week-to-week work lives in `TEST-WORKBOOK.md`; current position lives in
`TEST-STATE.md`; history lives in `TEST-LOG.md`. A shift starts from `TEST-SHIFT.md`, which
says what to read and what to write.

## What the suite is for

Not to prove ChapterFlow works. Daily use does that. The suite exists to make the small set
of unrecoverable failures impossible to ship, and to stop any bug returning twice.

That gives a closed list of what earns automation:

- **Data loss** — a content file truncated, emptied, or overwritten by an autosave race
- **Binder corruption** — unparseable `binder.json`, duplicate IDs, orphaned documents,
  structural folders lost
- **Compile truncation** — chapters or trailing content silently dropped
- **Reference rot** — entity and backlink IDs pointing at deleted nodes
- **Backwards compatibility** — a project created in 1.0 opening correctly in 1.4

The last is the one most easily underweighted and the most consequential for a lifetime-licence
local-first app. Every release for the lifetime of the product must open every project format
that came before it.

Everything outside that list is verified by using the app.

## Layers

1. **Pure unit.** Tree normalisation, word count, pagination maths, entity detection, search
   tiering. No filesystem. Fast and broad.
2. **Filesystem integration.** Open, save, rename, move, delete, trash, restore against a real
   temporary directory. Node only, no Electron window. Where the invariants are actually tested.
3. **Compile structure.** Fixture manuscripts through PDF and DOCX, asserting chapter count,
   word-count parity against source, front matter order, recto/verso correctness. Structure
   only — never page counts or layout numbers, for the font reason below.
4. **End-to-end.** One smoke path. Open a project, type, save, quit, reopen, content is intact.
   Deliberately tiny; this layer rots fastest.
5. **Visual.** A screenshot contact sheet across editor, page view, themes and Book View,
   reviewed by eye rather than diffed.

## Where each layer runs

Routines execute on Anthropic's cloud from a clean checkout, so the split is not "does this
open a window" but "what differs under a virtual display on someone else's Linux box".

**Routine-capable.** Layers 1 and 2 with no adaptation. DOCX, markdown and plain text export.
Compile scope semantics. The Scrivener metadata and RTF readers. Fixture generation. Log
analysis and workbook drafting.

**Routine-capable with care.** Layer 3. Electron runs under a virtual framebuffer, but needs
`ELECTRON_DISABLE_SANDBOX`, GTK/NSS/ALSA/libgbm present, network egress to GitHub and npmjs
during install, and `--legacy-peer-deps`. PDF depends on Electron's `printToPDF` and inherits
every one of these.

**Local only.** Layer 5 always. Layer 4 in practice — the CDP suites carry roughly 140 fixed
sleeps and need a quiet machine, and shared cloud runners are neither quiet nor fast, so flake
there will present as regression. Windows path handling and file locking. Any performance
number, since cloud timings on unknown hardware say nothing about how the app feels on a
writer's laptop.

## The font constraint

The PDF and Book View stylesheets request serif families that are not bundled. A Linux box
substitutes Liberation or DejaVu, so line breaks and page counts differ from Windows. Until
the fonts are bundled, no test anywhere may assert a page count or a layout measurement, and
compile tests assert structure only.

This also affects the existing check that Times New Roman resolved correctly: it reads computed
style, which reports the requested family rather than the one in use, so it passes on a
fallback. Tracked separately as a bug.

## Fixtures

A generator script with a fixed seed, committed to the repo, producing projects on demand
rather than storing them. This keeps a large corpus out of git and gives something better than
stored files: planted ground truth. If the generator places a character name 1,847 times at
known positions, entity detection can be asserted for exactness rather than for not crashing.

Four shapes:

- **Small.** A handful of documents. For fast unit and integration runs.
- **Realistic.** A 120,000-word novel with ordinary structure.
- **Pathological.** Deep nesting, unicode filenames, empty documents, several hundred scenes.
- **Ceiling.** One million words, in two distributions — *wide* (roughly 1,200 documents
  averaging 800 words) and *deep* (roughly 40 documents averaging 25,000). Wide stresses binder
  parsing, tree render, aggregation, search indexing and compile assembly. Deep stresses the
  editor, pagination, snapshot diffing and undo history. Around 1,000 entities of each kind,
  including names that are substrings of other names, names that are common words, possessives,
  hyphenated and accented forms.

Plus one project saved from each shipped version, added at release, for the backwards
compatibility layer.

The ceiling fixture answers one architectural question above all others: does the app ever hold
the whole manuscript in memory at once. Instrument peak renderer heap on open, on full search,
on entity detection and on compile. Everything else about scale is downstream of that answer.

No real manuscript content in any committed fixture. Routines copy the repository to
infrastructure outside this machine, and an app whose entire pitch is that a writer's work stays
local should not ship a writer's work anywhere as test data.

## Failure classes

**Asserted.** Crash, out of memory, compile truncation, an index that never completes, binder
corruption under load. Red build.

**Recorded, not asserted.** Open time, search latency, keystroke-to-paint on the deep fixture,
compile wall clock, peak heap. Logged per release and reviewed as a trend. Thresholds here go
stale and produce red builds that get ignored.

## How the suite grows

By accretion, not by planning. After the foundations are in place, no test is written
speculatively. Every bug found in daily use that touches data or compile gets a failing test
before the fix. Bugs that are visual or cosmetic get a screenshot and no test.

That rule keeps the suite small, keeps every test earned by a real failure, and grows coverage
in exactly the places the product turns out to be fragile.
