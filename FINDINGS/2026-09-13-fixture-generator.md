# The fixture generator, Small and Realistic — 2026-09-13, cloud shift 3A

Workbook row 3A, run on a cloud runner from a clean checkout of `main` at `5ec38b7`.
`TEST-STATE.md` named shift 1B, which `TEST-SHIFT.md` lists as local-only, so the substitute
rule was taken for the third shift running and 3A was run instead. Linux, no display, no
installed app, Node v22.22.2, Electron 43.4.1, `ELECTRON_DISABLE_SANDBOX=1`, everything
Electron-hosted under `xvfb-run -a`. Raw records are in `test-results/2026-09-13-shift-3A-final/`
and `test-results/2026-09-13-shift-3A-neighbours/`, both git-ignored, so this file is the
durable copy.

## What was built

`scripts/make-fixture-project.mjs`, with `scripts/make-fixture-project.d.mts` beside it so the
suite can import it under the same typecheck as everything else.

    node scripts/make-fixture-project.mjs <small|realistic> "<target>" [--seed n] [--truth path] [--force] [--quiet]

Two shapes, both written in the file shapes the stores write: `binder.json`,
`documents/<id>.html`, `storybible/index.json`, `storybible/sheets/<id>.json` and
`spanTags.json`. The ground truth goes to `<target>.truth.json`, beside the project rather than
inside it, so the project root holds nothing the app has never heard of.

| Shape | Documents | Words | Draft words | Files | Story Bible items | Tagged spans | Seconds |
|---|---|---|---|---|---|---|---|
| small | 6 | 1,370 | 1,240 | 12 | 3 | 2 | 0.1 |
| realistic | 58 | 123,274 | 120,000 | 73 | 12 | 23 | 0.2 |

Realistic is 4 parts of 12 chapters in Draft, three research documents and a nested Interviews
folder in Notes, three documents in Matter, one folder of the writer's own beside Draft
(`Planning`, `isTopLevel`, with a nested folder inside it), and one cut chapter in Archive.
Trash is empty. The Draft total is exactly 120,000 words; the other 3,274 are Notes, Matter,
Planning and Archive, which are outside the manuscript by design.

The generator is 1.1 MB of project for the realistic shape and takes under a fifth of a second,
so a suite can afford to build one per section rather than share one.

### What "planted" means here

Per document, the truth file carries the word count, the character count, the paragraph count,
the tagged-span ids, and two mention tables — by Story Bible item id and by surface form. Per
entity it carries the project-wide total and the per-document counts. Everything is measured
off the finished text rather than off the generator's own bookkeeping, and the two are compared
before anything is written: a mismatch throws instead of producing a fixture that quietly
disagrees with its own truth file.

Exactness rests on one decision: every word pool is filtered against every name and alias in
the cast before a sentence is built, so an occurrence of `Ottiline` in chapter 12 can only be
one this generator put there.

## Determinism

Every choice comes from a named stream off one seed; every id is a v4-shaped string drawn from
that seed rather than from `randomUUID`; every date is a whole number of days from a fixed
epoch of 2026-01-05. Nothing reads the clock, the locale or the environment.

Streams are named rather than shared so a later change stays local: adding a sentence to the
Notes folder would otherwise shift every id, status and entity placement in the manuscript.

Checked, for both shapes: two runs of the same shape and seed write the same file names, the
same bytes in every file, and the same ground-truth file. A different seed writes different
prose, keeps the same structure — the same documents, in the same order, under the same names —
and moves every id.

That is the first half of row 3B's self-test, done here because a generator that is not
byte-identical cannot be handed on. What 3B still has to do is the part a cloud runner cannot:
open Realistic in the built app over CDP and confirm no migration or repair fires, and re-run
day 2 against it at scale.

## The new suite

`tests/generator.test.ts`, registered in `scripts/run-tests.mjs` as `generator` and in
`test:build`, placed immediately after `binder`. Electron-hosted, opens no window, asserts no
timing, and works inside a temp directory it removes afterwards, so it is cloud-capable.

| Suite | Host | Status | Passed / total | Seconds |
|---|---|---|---|---|
| generator | electron | passed | 76 / 76 | 0.7 |

What it covers, by section:

| Section | Assertions | What it holds |
|---|---|---|
| the constants the generator copies | 3 | The generator's status list is still `DEFAULT_STATUSES`, its item types are still `DEFAULT_STORY_BIBLE_TYPES`, and its five structural folders are the app's, with the same ids, names and order. A `.mjs` script cannot import the TypeScript sources, so drift arrives as a failing assertion instead of as a fixture that has stopped resembling a real project. |
| the same shape and seed, twice | 11 | For both shapes: same file names, every file byte-identical, ground truth byte-identical, and a content control so none of that can pass on an empty project. Then a different seed: different prose, same structure, different ids. |
| planted word counts (×2) | 9 | The app's own `countWords` agrees with the planted number for every document, the project total is the stated one, the binder's word-count baseline is the Draft total, the realistic shape is exactly 120,000 Draft words, and the HTML carries no character entities for the two counters to disagree about. |
| planted entity placements (×2) | 14 | Built with the app's own `prepareMentionMatching` and `findMentionsInText`, over `parse(html).textContent` — the extraction the main process uses for mentions. Every document detects exactly what was planted in it and nothing else; every entity's project-wide total matches. Three controls: the placements are not zero (15 in small, 508 in realistic), they are spread over documents (4 and 56), and no entity is listed against a document with a count of zero. |
| the shapes the stores write (×2) | 18 | Opening the project writes no `.pre-structure` sidecar; `binder.json` is byte-identical after `binderStore` loads it and writes it back; Draft/Notes/Matter lead and Archive/Trash trail; the writer's own folder sits between Matter and Archive and keeps its name; the tree holds exactly the documents the truth file names, with no id twice; every document node carries all six metadata fields already, so `normalizeTree` has nothing to backfill; `documents/` holds one file per node and nothing else. |
| the span-tag index (×2) | 9 | `listSpans` reads back the same records in the same order as the truth file; rebuilding every document from its own HTML through `spanTagStore.rebuildForDocument` writes the same index byte for byte; at least one snippet is long enough to be truncated at 120 characters, so that rule is exercised rather than assumed. |
| the story bible (×2) | 12 | The index loads through `storyBibleStore` with the ids, names and aliases the truth file promises, in order, and the app-default item types unaltered; a sheet loads through `storyBibleSheetStore` with its three blocks; a sheet file has `saveSheet`'s own shape, version and itemId included; there is one sheet per item. |

The byte-identity assertion for `binder.json` is the one that does most of the work. It is
performed by loading the generated project and then writing the same `lastOpenDocumentId` back,
which makes the store re-serialize what it loaded: key order, a backfilled field, a dropped
field, or a migration would all show up as a difference in those bytes.

## The suite was checked against deliberate breakage

Five times, with the source restored afterwards and the final run green. All five mutations
were made on this checkout only and are not committed.

| Mutation | Assertions that failed |
|---|---|
| The generator's `idFrom` draws from `Math.random` instead of the seeded stream | 6 — determinism (6), both shapes |
| `normalizeTree` backfills one more field (`colorLabel`) onto every document node | 2 — the store shapes (1 per shape) |
| `spanTagStore`'s `SNIPPET_MAX_LENGTH` drops from 120 to 60 | 2 — the span-tag index (1 per shape) |
| `countWords` splits on hyphens as well as whitespace | 4 — planted word counts (2 per shape) |
| `prepareMentionMatching` sorts candidates shortest-first instead of longest-first | 4 — planted entity placements (2 per shape) |

One defect in the test rather than the app came out of this, and it is the third time in three
shifts that the same shape of defect has appeared. Under the first mutation the byte-comparison
loop read a file from the second run by the first run's name, threw ENOENT, and abandoned every
section after it: 5 assertions reached instead of 76. A missing file is now counted as a
difference, and the determinism section as a whole is wrapped so it cannot carry off the
sections after it. Re-checked under the same mutation: 70 passed, 6 failed, all sections
reached. Each shape's sections are wrapped the same way, so a generator that cannot build one
shape still gets the other checked.

## Recorded, not asserted: two text extractions that disagree

Found while deciding where the generator could safely plant a name, and confirmed directly on
2026-09-13 rather than inferred.

The main process reads a document's text in two different ways.

| Path | Extraction | A tag boundary becomes |
|---|---|---|
| `searchIndex.stripHtml` | `replace(/<[^>]*>/g, ' ')` | a space |
| `mentionStore.autoRecordsFor` | `parse(html).textContent` | nothing |

`countWords` in `src/shared/wordCount.ts` takes the first form, so the search index and the word
count agree with each other and the mention scan does not. The consequence is a whole-word
match that cannot fire:

    <h1>Low Water</h1><p>Ottiline waited. The tide returned.</p><p>Marrowgate opened.</p>

    textContent   "Low WaterOttiline waited. The tide returned.Marrowgate opened."
    mentions      Marrowgate
    stripHtml     "Low Water Ottiline waited. The tide returned. Marrowgate opened."
    search        Ottiline, Marrowgate

`Ottiline` is glued to the end of the heading and is invisible to detection; `Marrowgate`
survives because the previous element ends in a full stop, which is itself a word boundary. So
the case that goes missing is an element whose text ends in a letter or a digit followed
immediately by a name — a chapter heading, a list item, a table cell — and the commonest
instance of it in a real manuscript is a character named in the first words after a heading.

Two further consequences worth stating, neither measured: the same text is what
`findMentionsInText` reports `firstOffset` and `lastOffset` against, so those offsets index a
string no other feature builds; and the word count a mention scan sees is not the word count
the rest of the app sees.

Whether `mentionStore` should extract text the way `searchIndex` does is a behaviour decision —
it would change detection counts in every existing project — so nothing was changed, and it is
listed in "What's waiting on Jack". The generator works around it rather than depending on it:
no planted name is ever the first sentence of a document, and the reason is in a comment at the
place that enforces it.

## The neighbouring suites

Run with `--no-prepare` after the one bundle, to confirm the runner registration and the
`test:build` change disturbed nothing.

| Suite | Host | Status | Passed / total | Seconds |
|---|---|---|---|---|
| export | node | passed | 37 / 37 | 0.2 |
| compile | node | passed | 31 / 31 | 0.0 |
| book | node | passed | 37 / 37 | 0.0 |
| filesystem | electron | passed | 24 / 24 | 0.3 |
| binder | electron | passed | 68 / 68 | 0.4 |
| compilestore | electron | passed | 44 / 44 | 0.4 |
| structure | electron | passed | 59 / 59 | 0.3 |
| scrivmeta | node | passed | 26 / 26 | 0.1 |
| scrivrtf | node | passed | 67 / 67 | 0.2 |

Nine of nine passed, 393 assertions, and 469 with the new suite's 76. The suites needing the app
build were not run; `npm run build` was never invoked this shift.

`structure` took 0.3 seconds here against 10.1 on the development machine on 2026-09-10, and
`compilestore` 0.4 against 17.0 — the same two orders of magnitude the last two cloud shifts
recorded, and the same caveat: it is a comparison across two different machines and says
nothing on its own about why.

## Notes on running this in the cloud

One of the two cloud-runner problems recorded on 2026-09-11 and 2026-09-12 did not recur.
`npm install --legacy-peer-deps` left a working Electron: `node -e "require('electron')"`
resolved and `node_modules/electron/dist/electron` was present, so `node
node_modules/electron/install.js` was not needed this time. The check is still worth keeping —
it costs nothing and the failure is silent until a suite crashes.

The other recurred exactly: `npm install` rewrote `package-lock.json`, dropping the `libc` field
from the same thirty optional dependency entries. Reverted with `git checkout package-lock.json`
and not in this shift's commits.

`xvfb-run` was present on this runner, so every Electron-hosted suite ran under it.

## What the next row gets from this

Row 3B: the byte-identical self-test is done for both shapes; what remains is opening Realistic
in the built app over CDP with no migration or repair, and re-running day 2's suites against it
at scale. Row 4A: Realistic compiles from 48 chapters in four parts with a Matter folder of
three documents, and the truth file carries the per-document word counts a compile's word parity
can be asserted against. Row 7A: the wide ceiling shape goes in the same generator, and the
`placementsPerDocument` and chapter-length functions are where its distribution would be stated.
