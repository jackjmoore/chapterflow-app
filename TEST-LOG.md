# Test log

Append only. Never edited, never reordered, never summarised in place. Newest entries at the
bottom.

Not read in full by any shift. A shift reads this file only when `TEST-STATE.md` points at a
specific entry, or when the weekly review deliberately covers the last seven days. If something
matters to the next shift, the shift that found it writes a pointer into `TEST-STATE.md` —
nothing is found by searching this file.

Two entry types per shift. A shift-open marker is written and committed before any work begins,
so that a run which dies mid-shift leaves evidence of what was in flight. A shift-close entry is
written unconditionally at the end, including when nothing was found.

---

## 2026-09-09 — setup, by hand

Not a shift. Blind spot pass run in a chat session to establish what can and cannot run in a
cloud routine; findings written to `FINDINGS/2026-09-09-headless-viability.md`. Strategy written
to `TESTING-PLAN.md`, week one to `TEST-WORKBOOK.md`, and `TEST-STATE.md` created by hand to
establish its format.

Headline result: Electron runs in the cloud under a virtual framebuffer, so the constraint is
fonts, system libraries and timing rather than displays. Three blockers identified before
anything can be scheduled — the runner chains suites with `&&` and rebuilds the app about ten
times, four CDP suites bind fixed ports, and 84 files are uncommitted against a commit dated
2026-08-22.

One existing check found to be unable to fail: the hidden-window suite verifies the resolved
font by reading computed style, which reports the requested family rather than the one in use,
so it passes when Times New Roman is absent and a fallback is substituted.

Runner rework started. No routine has run.

---

## 2026-09-10 — shift 1A open

Baseline shift. The working tree is committed as it stands (last commit before this was
2026-08-22), `TEST-WORKBOOK.md` is written from the agreed seven-day plan, and every suite is
run once through `scripts/run-tests.mjs` to record per-suite status and duration. Nothing is
fixed this shift beyond what stops the runner completing. In flight: the full suite run.

## 2026-09-10 — shift 1A close

Baseline established. The working tree was committed as `3e416c5` (everything since
2026-08-22, about 115 files), then `TEST-WORKBOOK.md` was written from the agreed seven-day plan
and `TEST-STATE.md` rewritten. The runner ran all twenty-one suites to completion in just under
eighteen minutes: seventeen passed, 867 assertions in total. Per-suite table and the
text of every failure in `FINDINGS/2026-09-10-baseline-run.md`.

Four suites did not pass. freshness and lexicon fail as they did on 2026-09-09 and for the
same reasons, so neither is new. searchui failed three assertions of the kind the 2026-09-09
note already called intermittent. polish failed eight, all in the Story Bible hover card and the
Lexicon alphabet strip; the hover card was the subject of the two commits before the baseline,
so these may be real and are the first thing shift 1B should rerun.

Two things noted on the way. The folder `UsersjackmOneDriveDocumentsChapterFlow Demo` in the
repo root is an empty binder created on 2026-08-20; its name is a Windows path with the
backslashes eaten by a JavaScript string literal, and the surviving `C:` prefix made it
drive-relative, so it landed in the current directory. Current suites pass paths through
JSON.stringify and cannot reproduce it; it is safe to delete. And bookrender took 420 seconds,
which has no earlier number to compare against.

The `FINDINGS/2026-09-09-headless-viability.md` file the earlier entries point at does not exist
on disk and was never committed. Nothing in this shift depended on it.

## 2026-09-10 — setup, by hand

Not a shift. `TEST-SHIFT.md` written as the single entry point for an automated shift: what to
read at the start and in what order, the rules during, what to write at the close and in what
order, and which workbook rows can run on a cloud runner. `TESTING-PLAN.md` gained one sentence
pointing at it. Nothing else changed.

## 2026-09-11 — shift 2A open

Cloud shift. `TEST-STATE.md` names 1B, which `TEST-SHIFT.md` lists as local-only, so the
substitute rule applies and this shift takes row 2A, the earliest cloud-capable row not yet
done: filesystem integration part one — write ordering under contention, observer failure never
failing a save, the unreadable-binder guard, and the same guard on every other store that has
one. A data bug found gets a failing test before anything else; renderer changes are out of
scope. In flight: a clean `npm install --legacy-peer-deps`, then the new tests through
`scripts/run-tests.mjs` with results in `test-results/2026-09-11-shift-2A`.

## 2026-09-11 — shift 2A close

Row 2A done on a cloud runner in place of 1B, which is local-only. New suite
`tests/filesystem.test.ts`, registered in `scripts/run-tests.mjs` and `test:build` as
`filesystem`: 24 assertions, all passing, 0.4 seconds, Electron-hosted with no window and no
timing assertion. It covers write ordering under contention, what a failed write does to the
queue, the observer never being able to fail a save, and the `loadFailed` guard on both
`binder.json` and `storybible/index.json`. Per-section table, the mutation checks and the
cloud-runner notes are in `FINDINGS/2026-09-11-filesystem-part-one.md`.

The suite was checked against deliberate breakage twice rather than trusted because it was
green. Removing the per-path queue in `atomicWrite` and the `loadFailed` return in
`binderStore` failed five assertions; removing only the guard in both stores failed five. The
first run also exposed a defect in the test, not the app: a missing guard made a mutation
reject and threw out of the suite, abandoning three sections, so `pokeBinder` now swallows
each rejection.

Two things recorded rather than asserted, both decisions rather than defects. Only
binderStore and storyBibleStore carry the guard; the other fifteen project stores read, fall
back to an empty file when the read throws, and write the whole file back, which was
demonstrated on `mentions.json` — two records seeded, file truncated, one mutation later the
file held one record and no trace of the other two. And a write whose rename fails leaves its
temp file beside the target, so the deferred `.tmp-*` sweep is about live failures too, not
only crashes.

Noticed on the way. The Electron binary failed to download on the first
`npm install --legacy-peer-deps` with a 502 from `release-assets.githubusercontent.com` and
needed `node node_modules/electron/install.js` run once more. `npm install` on this runner
rewrote `package-lock.json`, dropping `libc` from thirty optional dependency entries; that was
reverted and is not in this commit. And `compilestore` took 0.5 seconds here against 17.0 on
2026-09-10, which bears on whether the development machine was busy during the baseline; five
other suites were run beside it to confirm the runner change disturbed nothing, 242 assertions
across the six, all passing.

## 2026-09-12 — shift 2B open

`TEST-STATE.md` still names 1B, which `TEST-SHIFT.md` lists as local-only, so the substitute
rule applies again and this shift takes row 2B, the earliest cloud-capable row not yet done:
binder integration part two — delete cascade leaving nothing in `documents/`, snapshots or span
tags; duplicate yielding fresh ids with copied content; random valid moves preserving node
count and every id; bulk insert refusing duplicates and protected ids; and four legacy binder
shapes opening and round-tripping. A data bug found gets a failing test before anything else;
renderer changes are reported, not made. In flight: a clean `npm install --legacy-peer-deps`
checked with `node -e "require('electron')"`, then the new suite through
`scripts/run-tests.mjs` with results in `test-results/2026-09-12-shift-2B`.

## 2026-09-12 — shift 2B close

Row 2B done on a cloud runner in place of 1B, which is local-only and has now been deferred
twice. New suite `tests/binder.test.ts`, registered in `scripts/run-tests.mjs` and `test:build`
as `binder`: 68 assertions, all passing, 0.4 seconds, Electron-hosted with no window and no
timing assertion. It covers the delete cascade into `documents/`, snapshots and span tags;
duplicate minting fresh ids with copied content; sixty seeded moves over a 26-node tree;
bulk insert refusing six kinds of invalid batch; and four legacy binder shapes opening and
holding still. The per-section table, the mutation checks and the neighbour run are in
`FINDINGS/2026-09-12-binder-part-two.md`.

The suite was checked against deliberate breakage three times rather than trusted because it
was green — the delete and duplicate paths, the insert validation and the move guards, and the
two legacy migrations — failing 6, 7 and 5 assertions in turn. Two defects in the test came out
of it, both fixed. The control assertion for the sixty moves compared the tree with itself,
because `getState()` returns the live `state.tree` and a snapshot held as a reference mutates
with it. And the third mutation reproduced 2A's finding exactly: a lost node threw and
abandoned the sections after it, 51 assertions instead of 68, so every walk that can meet a
missing node now returns an empty list instead.

One thing traced through the source and recorded rather than asserted, because a crash cannot
be provoked from inside a suite. `insertSubtree`'s own comment states the rule — documents
written before the binder, so a crash leaves discoverable orphan files rather than chapters
that exist and are empty. `duplicateNode` persists the binder before copying content, and
`deleteNode` deletes content before persisting the binder; both land on the side that comment
calls indistinguishable from data loss. Neither loses anything that existed before the
operation, and reordering either is a behaviour decision, so nothing was changed.

Eight neighbouring suites were run beside it to confirm the runner change disturbed nothing —
export, compile, book, filesystem, compilestore, structure, scrivmeta, scrivrtf — 325
assertions, all passing, 393 with the new suite. Noticed on the way: both cloud-runner problems
of 2026-09-11 recurred in the same form, the Electron binary failing to download on install and
`npm install` dropping `libc` from thirty lockfile entries, so both are reliable rather than
incidental. And `structure` took 0.4 seconds here against 10.1 on the development machine on
2026-09-10, with `compilestore` at 0.4 against 17.0.

## 2026-09-13 — shift 3A open

`TEST-STATE.md` still names 1B, which `TEST-SHIFT.md` lists as local-only and which has now
been deferred twice, so the substitute rule applies again and this shift takes row 3A, the
earliest cloud-capable row not yet done: a deterministic project generator for the Small and
Realistic shapes. Fixed seed all the way down and no fresh UUIDs, so two runs of the same seed
produce byte-identical trees; planted per-document word counts and named entity placements
carried in a ground-truth file beside the project; and the same file shapes the stores
themselves write, checked by opening a generated project through the binder store rather than
by eye. A data bug found gets a failing test before anything else; renderer changes are
reported, not made. In flight: a clean `npm install --legacy-peer-deps` checked with
`node -e "require('electron')"`, the generator under `scripts/`, a `generator` suite through
`scripts/run-tests.mjs`, and results in `test-results/2026-09-13-shift-3A`.

## 2026-09-13 — shift 3A close

Row 3A done on a cloud runner in place of 1B, which is local-only and has now been deferred
three times. New generator `scripts/make-fixture-project.mjs` with a type declaration beside it,
and a new suite `tests/generator.test.ts`, registered in `scripts/run-tests.mjs` and
`test:build` as `generator`: 76 assertions, all passing, 0.7 seconds, Electron-hosted with no
window and no timing assertion. Small is 6 documents and 1,370 words; Realistic is 58 documents
and 123,274 words, of which exactly 120,000 are in Draft across 48 chapters in four parts, and
takes 0.2 seconds to write 73 files. The per-section table, the mutation checks and the
neighbour run are in `FINDINGS/2026-09-13-fixture-generator.md`.

Determinism holds for both shapes: two runs of one shape and seed write the same file names,
the same bytes and the same ground-truth file, and a different seed changes the prose and every
id while keeping the structure. Ground truth is measured off the finished text rather than off
the generator's bookkeeping and the two are compared before anything is written. The app's own
`countWords`, `prepareMentionMatching` and `findMentionsInText` are what the suite checks the
planted numbers with — 508 planted entity occurrences across 56 documents in Realistic, each
document detecting exactly what it was given and nothing else. `binder.json` is byte-identical
after `binderStore` loads it and writes it back, with no `.pre-structure` sidecar, so a
generated project fires no migration and no repair.

The suite was checked against deliberate breakage five times rather than trusted because it was
green — non-deterministic ids, an extra field backfilled by `normalizeTree`, a changed snippet
limit in `spanTagStore`, a changed `countWords`, and `prepareMentionMatching` sorting
shortest-first — failing 6, 2, 2, 4 and 4 assertions in turn. One defect in the test came out of
it, the same shape as the ones 2A and 2B each found: the byte-comparison loop threw ENOENT on a
file the second run had not written and abandoned the sections after it, 5 assertions instead of
76. A missing file now counts as a difference, and each shape's sections are wrapped so one
cannot carry off the other.

One thing confirmed directly and recorded rather than asserted. The main process extracts a
document's text two different ways: `searchIndex.stripHtml` turns a tag into a space, and
`mentionStore` uses `parse(html).textContent`, which turns it into nothing. A name in the first
words after a heading is therefore glued to the heading and cannot be detected as a mention,
while the search index finds it — demonstrated on 2026-09-13 with `Ottiline` after `<h1>Low
Water</h1>`. Changing it would move detection counts in every existing project, so nothing was
changed; the generator works around it by never planting a name in a document's first sentence.

Nine neighbouring suites were run beside it to confirm the runner change disturbed nothing —
export, compile, book, filesystem, binder, compilestore, structure, scrivmeta, scrivrtf — 393
assertions, all passing, 469 with the new suite. Noticed on the way: the Electron binary
downloaded cleanly on `npm install --legacy-peer-deps` this time, unlike 2026-09-11 and
2026-09-12, so that problem is not reliable; `npm install` again dropped `libc` from the same
thirty lockfile entries, which was reverted; and `structure` took 0.3 seconds here against 10.1
on the development machine on 2026-09-10, with `compilestore` at 0.4 against 17.0.

## 2026-09-14 — shift 4A open

`TEST-STATE.md` still names 1B, which `TEST-SHIFT.md` lists as local-only and which has now
been deferred three times, so the substitute rule applies again and this shift takes row 4A,
the earliest cloud-capable row not yet done: compile structure in Node for TXT, Markdown and
DOCX. Section count against the compile scope, word parity against the generator's truth file
with a stated tolerance, the last paragraph of the last document present in the output, an
empty document giving an empty section rather than being dropped, and front and back matter in
the order the binder holds them. A data or compile bug found gets a failing test before
anything else; renderer changes are reported, not made. In flight: a clean
`npm install --legacy-peer-deps` checked with `node -e "require('electron')"`, a `compilestruct`
suite through `scripts/run-tests.mjs`, and results in `test-results/2026-09-14-shift-4A`.

## 2026-09-14 — shift 4A close

Row 4A done on a cloud runner in place of 1B, which is local-only and has now been deferred
four times. New suite `tests/compileStructure.test.ts`, registered in `scripts/run-tests.mjs`
and `test:build` as `compilestruct`: 66 assertions, all passing, 2.5 seconds, Node-hosted with
no window and no timing assertion. It compiles the generator's Realistic shape — 4 parts, 48
chapters, 120,000 planted Draft words, a Matter folder of three — to txt, Markdown and docx and
reads each result back, 840,639 bytes of plain text and 3,362 docx paragraphs per full compile.
The per-section table, the tolerances, the mutation checks and the neighbour run are in
`FINDINGS/2026-09-14-compile-structure.md`.

The five properties the row asked for all hold. One section per binder node and no more, in all
three formats, with every heading accounted for: 52 structural plus one `<h1>` per document in
the docx, and the title, the Contents caption, 52 sections and 48 documents in the Markdown. A
partial scope of 26 nodes compiles 26 sections, and an excluded chapter is gone in its prose as
well as its heading. Word parity is exact rather than tolerant where it can be — the recorded
body count is 120,000 against 120,000 planted, and 28,554 against 28,554 for a one-part scope —
with 2% allowed for the artifacts themselves, whose scaffolding costs +402, +451 and +150 words
on 120,000. The last paragraph of chapter 48 is the last thing in the `.txt` file and the last
docx paragraph with text in it. An empty document keeps its section, its heading and its
Contents entry in all three formats and contributes no words.

One compile bug found, recorded rather than fixed because it is a decision about output rather
than a defect with an obvious fix. Front matter sits on opposite sides of the table of contents
depending on the format: `projectToPdfHtml` and `projectToDocxBuffer` both split the leading
matter off and emit it before the Contents — the comment at the PDF one says a title page after
a Contents page reads backwards — while `projectToPlainText` and `projectToMarkdown` build the
Contents first and then emit every section in order, matter included. Nothing is lost or
duplicated; back matter is consistent in all four. Both orders are now asserted as they stand,
the txt and md one labelled as the disagreement it is, so a change to either arrives as a
failure. It is in "What's waiting on Jack".

The suite was checked against deliberate breakage five times rather than trusted because it was
green — a document with no blocks dropped from the walk, matter given a Markdown section
heading, the last section lost from the plain-text render, matter allowed into the recorded
word count, and heading text dropped from `blocksToPlainText` — failing 6, 1, 11, 1 and 3
assertions in turn, with all 66 reached every time. The fifth is why the body count is asserted
exactly: dropping every document's own `<h1>` loses 91 words out of 120,000, which is 0.08% and
inside any percentage tolerance anyone would write down. No defect in the test came out of the
mutation runs, the first time in four shifts; three came out of the first green run and were
fixed before the recorded one, all of them the suite mismeasuring rather than the app
misbehaving.

Noticed on the way, and the reason this suite could be Node-hosted at all: nothing on the txt,
Markdown or docx path opens a BrowserWindow, and the only thing keeping the project-level
renderers out of a Node host was `projectRoot` computing its default from `app.getPath` at
module load. `tests/electronForNode.ts` stands in for the `electron` module for this one suite
through an aliased second `esbuild` step in `test:build`; every other suite still bundles with
`--external:electron`, and `compilestore` is unchanged and still Electron-hosted.

Ten neighbouring suites were run in the same invocation to confirm the runner registration and
the `test:build` change disturbed nothing — export, compile, book, filesystem, binder,
generator, compilestore, structure, scrivmeta, scrivrtf — 469 assertions, all passing, 535 with
the new suite. `npm install` again dropped `libc` from the same thirty lockfile entries, which
was reverted; `node_modules/electron` again arrived without a `dist/`, and the
`node -e "require('electron')"` check repaired it by itself this time. `structure` took 0.4
seconds here against 10.1 on the development machine on 2026-09-10 and `compilestore` 0.5
against 17.0; `filesystem` took 4.9 against 0.3 on the last three cloud shifts, which is a cold
Electron start rather than a regression.

## 2026-09-15 — shift 6B open

`TEST-STATE.md` names shift 1B, which `TEST-SHIFT.md` lists as local-only, so the cloud
substitute rule is taken for the fifth shift running and row 6B is run instead: reference rot at
store level. In flight will be a new suite over three cascades — a Story Bible item delete taking
its sheet, its images and its mentions; a document delete clearing comments, mentions and
submission links; and timeline pruning dropping links to deleted items and nothing else — written
against the generator's fixtures in a temporary directory, Node-hosted through
`tests/electronForNode.ts` if the stores involved reach no `app` call at load time and
Electron-hosted otherwise. Anything found is recorded in a findings file and gets a failing test
before a fix; a fix only if it is store-level in `src/main`.

## 2026-09-15 — shift 6B close

Row 6B done on a cloud runner in place of 1B, which is local-only and has now been deferred five
times. New suite `tests/references.test.ts`, registered in `scripts/run-tests.mjs` and
`test:build` as `references`: 102 assertions, all passing, 0.1 seconds, Node-hosted through the
`electronForNode.ts` shim with no window and no timing assertion. The per-section table, the
mutation checks and the neighbour run are in `FINDINGS/2026-09-15-reference-rot.md`.

All three cascades the row asked for hold. A Story Bible item delete takes its sheet file, both
images its sheet referenced, and every mention record naming it including the manual one, while
the neighbouring item keeps its record, sheet, image and mentions byte for byte and its name
stays claimed in the suppression list. A document delete returns both documents under a folder
and clears their comments and mentions, and nulls `documentId` and `snapshotId` on the
submission sent from one of them while keeping its `documentNameAtSend` tombstone, its recipient,
its notes and its creation time; the submission sent from the surviving document is byte-identical
afterwards, `updatedAt` included. Emptying Trash was asserted separately rather than trusted to
be the same code. Timeline pruning removed seven dead references — five links and two
relationships — across five entries, kept every entry and their order, restamped only the entries
that actually lost something, and left `binder.json` and `storybible/index.json` untouched; a
second prune returned 0 and rewrote neither file.

One bug found and fixed, with the failing assertion written first. A deleted Story Bible item's
sheet text stayed searchable for the rest of the session: the search index is maintained by an
observer on `atomicWrite`, which never sees a delete, and `documentStore.deleteDocument` was the
only place compensating for that. `storyBibleSheetStore.deleteSheet` unlinked
`storybible/sheets/<id>.json` silently, so the sheet's block entries stayed in the index with no
file behind them, returning hits that pointed at an item no longer in the Story Bible. The item's
own name, aliases and summary dropped out on their own, because those live in
`storybible/index.json`, which is rewritten rather than unlinked. The fix is
`searchIndex.onSheetDeleted`, three lines mirroring `onDocumentDeleted`, called from `deleteSheet`
— store-level in `src/main` with no renderer side. `search` (41 assertions) and `rank` (72) were
run afterwards and both pass. The staleness was never permanent: `searchIndex.open()` drops
sources whose files have vanished, and the suite asserts the post-reopen case separately, which
passed before the fix as well as after.

The suite was checked against six deliberate mutations rather than trusted because it was green —
a dropped `commentStore` line in the real `binder:delete` handler, manual mentions spared by an
item delete, only the first of a sheet's images taken, the prune removing entries left with no
links, `documentNameAtSend` cleared with the document link, and a comment delete dropping every
comment rather than one document's — failing 1, 3, 1, 7, 1 and 2 assertions in turn, with all 102
reached every time. The first of those is why the suite reads the four handler bodies out of
`src/main/index.ts` and compares the store calls in them: the suite's own cascades are
restatements of index.ts, so a line dropped from the real handler is invisible to every other
section. No defect in the test came out of the mutation runs, the second shift running; two came
out of writing it and were fixed before the first recorded run, both the suite mismeasuring.

Noticed on the way and recorded rather than fixed: `documentImageStore.deleteImage` is exported
and has no caller anywhere in `src/`, so a manuscript image file outlives both the image being
removed from the text and the document being deleted, while the Story Bible side of the same
feature cleans up on all three paths. That is an orphan rather than a loss and belongs with the
deferred sweep item, so it is not asserted — an assertion that the orphan survives would pin it.
Also recorded: `binder:delete` cascades after `deleteNode` has already written `binder.json`, so a
crash in that window leaves comment bodies naming a document the binder no longer lists, which
compounds the write-ordering finding of 2026-09-12 rather than being a new one.

Fourteen neighbouring suites were run in the same invocation — export, compile, compilestruct,
book, filesystem, binder, generator, compilestore, structure, lexicon, search, rank, scrivmeta,
scrivrtf — 655 assertions with one failure, 757 with the new suite. The failure is `lexicon` on
the one spellcheck assertion `TEST-SHIFT.md` already records as a fresh-profile failure; the
assertion that failed is that one and it was not spent time on. This is the first cloud shift to
run `search`, `rank` and `lexicon` at all: they are marked `needsBuild`, and `npm run build` —
never invoked by the four cloud shifts before this one — took 948 milliseconds on this runner, so
a cloud shift touching `src/main` should run it rather than skip those suites. `npm install`
again dropped `libc` from the same thirty lockfile entries, which was reverted;
`node_modules/electron` again arrived without a `dist/`, and the `node -e "require('electron')"`
check repaired it by itself. `structure` took 0.4 seconds here against 10.1 on the development
machine on 2026-09-10 and `compilestore` 0.4 against 17.0; `filesystem` took 8.0 as the first
Electron-hosted suite in the run, which is a cold start rather than a regression.

## 2026-09-16 — shift 7A open (review half)

`TEST-STATE.md` names shift 1B, which `TEST-SHIFT.md` lists as local-only, so the cloud
substitute rule is taken for the sixth shift running. The earliest cloud-capable row not yet
marked done is 7A, and only its review half can run here: the weekly review in this log and the
routine definition listing the cloud-capable suites. Its other half — the Wide ceiling shape in
the generator and the full suite twice back to back for flake and duration — needs a quiet
machine and stays for a local shift. In flight will be one full run through
`scripts/run-tests.mjs` into `test-results/2026-09-16-shift-7A` to put a current number against
the 2026-09-10 baseline, with `npm run build` first so `search`, `rank` and `lexicon` are
included, then a findings file for the week and the routine definition.

## 2026-09-16 — weekly review, week of 2026-09-10

The one deliberate read of the last seven days, written by the review half of shift 7A. Numbers
and the per-suite table are in `FINDINGS/2026-09-16-week-one-review.md`; this entry is the
account.

Six of the fourteen planned rows ran — 1A, 2A, 2B, 3A, 4A and 6B — plus this half of 7A. Five
suites were written, all in the cloud, all still green: `filesystem` on 2026-09-11, `binder` on
2026-09-12, `generator` on 2026-09-13, `compilestruct` on 2026-09-14 and `references` on
2026-09-15, 336 assertions between them. The suite went from 21 suites and 867 assertions to 26
and 1,201, a rise of 39%. One bug was found and fixed, `searchIndex.onSheetDeleted` on
2026-09-15. Twenty-one deliberate mutations were run across the five suites and every one failed
at least one assertion; six defects in the tests came out of writing them and none out of the
mutation runs in the last two shifts.

Against that, no B row ran except 6B, and every outstanding row — 1B, 3B, 4B, 5A, 5B, 6A, 7B and
the flake half of 7A — is marked local. The substitute rule worked exactly as written and kept
six shifts productive; the price is that everything needing a display or a quiet machine is
untouched and 1B has been deferred six times. That is the week's one structural problem and it
is not something another cloud shift can fix.

A full run of all twenty-six suites was made today to put a number beside the baseline: 23 of 26
passed, 1,197 assertions of 1,201, 4 minutes 19 seconds against just under eighteen minutes for
twenty-one suites on 2026-09-10. Four assertions did not pass. `lexicon` failed the same
spellcheck assertion as 2026-09-10, character for character, now on a second operating system.
`pagination` failed one and `live` two, all three of them page counts or layout measurements, and
all three because `fc-match "Times New Roman"` on this runner returns Liberation Serif; the
arithmetic reproducing both pagination figures exactly from the line height is in the findings
file. That is the font constraint in `TESTING-PLAN.md` arriving as a red suite rather than as a
rule, and nothing was tuned to make it green.

Three results bear directly on 1B and all three point away from the code. `polish` passed 114 of
114 here against 106 of 114 on 2026-09-10, with all eight of the baseline's failing areas green,
including the hover card's fourteen dismissal assertions and the Lexicon alphabet strip.
`searchui` passed 96 of 96 against 93, its three baseline failures passing by their exact labels.
And `bookrender` took 4.0 seconds against 420.3. The renderer under test is the baseline's
renderer: `git diff --stat 3e416c5..HEAD -- src/` is two main-process files and 18 added lines,
nothing under `src/renderer` all week. None of this proves the development machine passes — it is
one run, on Linux, under Xvfb — but the two commits before the baseline are no longer the leading
explanation for the eight polish failures, and a busy machine is.

`freshness` passed here, 6 of 6, which `TEST-SHIFT.md` said was impossible. Its packaged-build
section already skips itself when no installed copy exists; what failed the four cloud shifts
before 2026-09-15 was a missing `out/`, because none of them ran `npm run build`. The same
omission is why they skipped `search`, `rank` and `lexicon`. The rule is corrected in `9ba3ca3`.
That also settles one of the questions standing against Jack's name without needing him.

Four questions are still waiting on Jack and none has moved: `documentImageStore.deleteImage`
with no caller, front-matter ordering in TXT and Markdown, `mentionStore` extracting text
differently from `searchIndex`, and the fifteen stores without the `loadFailed` guard. Two are
compounded by later findings rather than answered. Week two should not start until they are
looked at, because three of the four are decisions that would change what a test asserts.

## 2026-09-16 — shift 7A close (review half)

The review half of row 7A done on a cloud runner in place of 1B, which is local-only and has now
been deferred six times. Two deliverables, both new files: `FINDINGS/2026-09-16-week-one-review.md`
and `TEST-ROUTINE.md`, committed in `91a081f`. The weekly review is the entry above. No test was
written, changed or deleted this shift, and nothing in `src/` was touched.

`TEST-ROUTINE.md` is row 7A's routine definition: one firing a day into a fresh session running
one shift and stopping, the runner's six requirements, the five pre-flight steps in order, the
suite-by-suite cloud split with its evidence, what a firing may and may not change, the prompt
text, and three things worth settling before it is scheduled. The cloud-capable list it carries
is 20 suites and 858 assertions, every one of which passed today, named explicitly as a runner
invocation so a cloud run does not have to produce reds and then explain them. `lexicon`,
`pagination` and `live` are off that list and hold all four of today's failing assertions.

One full run of all twenty-six suites, results in `test-results/2026-09-16-shift-7A`: 23 of 26
passed, 1,197 of 1,201 assertions, 4 minutes 19 seconds. It is the first cloud run of
`pagination`, `pageview`, `revision`, `editorfeatures`, `pdf`, `bookrender`, `searchui`, `polish`,
`dashboard` and `live`, so ten suites have a cloud number for the first time. The four failures
and what they mean are in the review entry above and in the findings file. The flake half of this
row — two full runs back to back — was not attempted: it is local, and one run says nothing about
flake.

`TEST-SHIFT.md` was changed in `9ba3ca3`, on its own and with the reason in the commit message,
which is the first change to the brief since it was written on 2026-09-10. Its cloud section now
tells a shift to run `npm run build`, states that `freshness` passes once it has, and names
`pagination` and `live` as cloud-excluded for the font. The old rule cost four shifts three
suites each.

Noticed on the way. `npm install` again dropped `libc` from the same thirty lockfile entries, the
sixth time in six cloud shifts, and was reverted. `node_modules/electron` again arrived without a
`dist/` and the `node -e "require('electron')"` check repaired it, the third time in three.
`npm run build` took 1.0 seconds and `npm run test:build` 0.6. Every Electron-hosted suite on the
development machine sat between 10.1 and 32.8 seconds on 2026-09-10 whatever work it did, against
0.3 to 0.9 here, which would be explained by a fixed per-suite startup cost of ten to sixteen
seconds on that machine; that is inferred from the shape of the numbers and a local shift should
confirm it. `bookrender` is not explained by it and stays the number to watch.

There is now no cloud-capable row left in the week-one workbook. A cloud shift firing after this
one has nothing to take and should append a skip entry naming the local row that blocks it, per
`TEST-SHIFT.md`, until week two is planned.

## 2026-09-17 — cloud shift, skipped

No row was taken and no suite was run. `TEST-STATE.md` names shift 1B in "What's in progress";
`TEST-SHIFT.md`'s "Which shifts can run where" lists 1B as local, so the substitute rule applies,
and `TEST-WORKBOOK.md` marks all six cloud-capable rows — 2A on 2026-09-11, 2B on 2026-09-12,
3A on 2026-09-13, 4A on 2026-09-14, 6B on 2026-09-15 and 7A's review half on 2026-09-16 — as
done. There is no earliest cloud-capable row left to take, so this entry is the skip entry the
cloud section calls for, naming 1B as the local row that blocks.

The checkout was read only. `npm install` was not run, `npm run build` was not run, no suite ran,
and nothing under `src/`, `tests/`, `FINDINGS/` or `test-results/` was created or changed. The
only files this shift writes are `TEST-LOG.md` and `TEST-STATE.md`. No shift-open entry was
written, because no shift was opened; a skip that logged an open would read as a run that died.

This is the first firing to skip, and it repeats until something changes off the runner. Seven
rows are outstanding and all seven are local: 1B, 3B, 4B, 5A, 5B, 6A, 7B and the flake half of
7A. A firing a day that can only append a skip entry is worth pausing or repointing rather than
leaving to run, which is a decision for Jack and is recorded in `TEST-STATE.md` under "What's
waiting on Jack". Week two is unplanned, and the four questions standing in that section since
2026-09-11 would change what a test asserts, so they are the work that unblocks the runner.

## 2026-09-18 — cloud shift, skipped

No row was taken and no suite was run, for the second firing running. `TEST-STATE.md` still names
shift 1B in "What's in progress"; `TEST-SHIFT.md`'s "Which shifts can run where" lists 1B as local,
so the substitute rule applies, and `TEST-WORKBOOK.md` still marks all six cloud-capable rows —
2A on 2026-09-11, 2B on 2026-09-12, 3A on 2026-09-13, 4A on 2026-09-14, 6B on 2026-09-15 and 7A's
review half on 2026-09-16 — as done. The workbook was re-read rather than assumed: its table is
unchanged since `da85a6b`, and the two paragraphs above it still name the same cloud-capable set.
There is no earliest cloud-capable row left to take, so this entry is the skip entry the cloud
section calls for, naming 1B as the local row that blocks.

The checkout was read only, as on 2026-09-17. `npm install` was not run, `npm run build` was not
run, no suite ran, and nothing under `src/`, `tests/`, `FINDINGS/` or `test-results/` was created
or changed. `origin/main` was at `59d296e`, the 2026-09-17 skip commit, so nothing in the
repository has changed since that shift and no number in `TEST-STATE.md` has moved. The only files
this shift writes are `TEST-LOG.md` and `TEST-STATE.md`. No shift-open entry was written, because
no shift was opened.

Two firings have now produced two skip entries and no test run, on 2026-09-17 and 2026-09-18.
Seven rows are outstanding and all seven are local: 1B, 3B, 4B, 5A, 5B, 6A, 7B and the flake half
of 7A. The routine cannot recover on its own: nothing a cloud runner can do adds a cloud-capable
row, so every firing from here repeats this entry until the local rows are run, week two is
planned with cloud-capable rows in it, or the routine is paused. That is the first item under
"What's waiting on Jack" in `TEST-STATE.md` and has been since 2026-09-17; the four testing
questions standing there since 2026-09-11 are the work that would unblock the runner, and three
of them would change what a test asserts.

## 2026-09-19 — cloud shift, skipped

No row was taken and no suite was run, for the third firing running. `TEST-STATE.md` still names
shift 1B in "What's in progress", and `TEST-SHIFT.md`'s "Which shifts can run where" still lists 1B
as local, so the substitute rule applies. `TEST-WORKBOOK.md` was re-read rather than assumed: its
table is unchanged since `da85a6b` on 2026-09-16, and it still marks all six cloud-capable rows —
2A on 2026-09-11, 2B on 2026-09-12, 3A on 2026-09-13, 4A on 2026-09-14, 6B on 2026-09-15 and 7A's
review half on 2026-09-16 — as done. There is no earliest cloud-capable row left to take, so this
entry is the skip entry the cloud section calls for, naming 1B as the local row that blocks.

The checkout was read only, as on 2026-09-17 and 2026-09-18. `npm install` was not run, `npm run
build` was not run, no suite ran, and nothing under `src/`, `tests/`, `FINDINGS/` or
`test-results/` was created or changed. `origin/main` was at `a983d96`, the 2026-09-18 skip commit,
and a `git pull --rebase origin main` reported the checkout already up to date, so nothing in the
repository has changed since that shift and no number in `TEST-STATE.md` has moved. The only files
this shift writes are `TEST-LOG.md` and `TEST-STATE.md`. No shift-open entry was written, because
no shift was opened.

Three firings have now produced three skip entries and no test run, on 2026-09-17, 2026-09-18 and
2026-09-19. The last shift to run a suite was 7A on 2026-09-16, three days ago; the last commit to
touch `src/`, `tests/` or `FINDINGS/` was `da85a6b`, the same day. Seven rows are outstanding and
all seven are local: 1B, 3B, 4B, 5A, 5B, 6A, 7B and the flake half of 7A. The routine still cannot
recover on its own, and the three skips are evidence enough that it will not: nothing a cloud
runner can do adds a cloud-capable row, so every firing from here repeats this entry until the
local rows are run, week two is planned with cloud-capable rows in it, or the routine is paused.
That is the first item under "What's waiting on Jack" in `TEST-STATE.md` and has been since
2026-09-17; the four testing questions standing there since 2026-09-11 are the work that would
unblock the runner, and three of them would change what a test asserts.

## 2026-09-20 — cloud shift, skipped

No row was taken and no suite was run, for the fourth firing running. `TEST-STATE.md` still names
shift 1B in "What's in progress", and `TEST-SHIFT.md`'s "Which shifts can run where" still lists 1B
as local, so the substitute rule applies. `TEST-WORKBOOK.md` was re-read rather than assumed: its
table is unchanged since `da85a6b` on 2026-09-16, and it still marks all six cloud-capable rows —
2A on 2026-09-11, 2B on 2026-09-12, 3A on 2026-09-13, 4A on 2026-09-14, 6B on 2026-09-15 and 7A's
review half on 2026-09-16 — as done. There is no earliest cloud-capable row left to take, so this
entry is the skip entry the cloud section calls for, naming 1B as the local row that blocks.

The checkout was read only, as on 2026-09-17, 2026-09-18 and 2026-09-19. `npm install` was not run,
`npm run build` was not run, no suite ran, and nothing under `src/`, `tests/`, `FINDINGS/` or
`test-results/` was created or changed. `origin/main` was at `4ad60b3`, the 2026-09-19 skip commit,
and a `git pull --rebase origin main` reported the checkout already up to date; `git diff
--name-only da85a6b HEAD` lists `TEST-LOG.md` and `TEST-STATE.md` and nothing else, so the four
skips are the entire history since 7A closed. The only files this shift writes are `TEST-LOG.md`
and `TEST-STATE.md`. No shift-open entry was written, because no shift was opened.

Four firings have now produced four skip entries and no test run, on 2026-09-17, 2026-09-18,
2026-09-19 and 2026-09-20. The last shift to run a suite was 7A on 2026-09-16, four days ago;
`FINDINGS/` still holds seven files, the newest dated 2026-09-16. Seven rows are outstanding and
all seven are local: 1B, 3B, 4B, 5A, 5B, 6A, 7B and the flake half of 7A. The routine cannot
recover on its own, and four skips are evidence enough that it will not: nothing a cloud runner can
do adds a cloud-capable row, so every firing from here repeats this entry until the local rows are
run, week two is planned with cloud-capable rows in it, or the routine is paused. That is the first
item under "What's waiting on Jack" in `TEST-STATE.md` and has been since 2026-09-17; the four
testing questions standing there since 2026-09-11 are the work that would unblock the runner, and
three of them would change what a test asserts.

## 2026-09-21 — cloud shift, skipped

No row was taken and no suite was run, for the fifth firing running. `TEST-STATE.md` still names
shift 1B in "What's in progress", and `TEST-SHIFT.md`'s "Which shifts can run where" still lists 1B
as local, so the substitute rule applies. `TEST-WORKBOOK.md` was re-read rather than assumed: its
table is unchanged since `da85a6b` on 2026-09-16, and it still marks all six cloud-capable rows —
2A on 2026-09-11, 2B on 2026-09-12, 3A on 2026-09-13, 4A on 2026-09-14, 6B on 2026-09-15 and 7A's
review half on 2026-09-16 — as done. There is no earliest cloud-capable row left to take, so this
entry is the skip entry the cloud section calls for, naming 1B as the local row that blocks.

The checkout was read only, as on 2026-09-17 through 2026-09-20. `npm install` was not run, `npm
run build` was not run, no suite ran, and nothing under `src/`, `tests/`, `FINDINGS/` or
`test-results/` was created or changed. `origin/main` was at `7dd08e2`, the 2026-09-20 skip commit,
and a `git pull --rebase origin main` reported the checkout already up to date; `git diff
--name-only da85a6b HEAD` lists `TEST-LOG.md` and `TEST-STATE.md` and nothing else, so the five
skips are the entire history since 7A closed. `FINDINGS/` still holds seven files, the newest dated
2026-09-16. The only files this shift writes are `TEST-LOG.md` and `TEST-STATE.md`. No shift-open
entry was written, because no shift was opened.

Five firings have now produced five skip entries and no test run, on 2026-09-17, 2026-09-18,
2026-09-19, 2026-09-20 and 2026-09-21. The last shift to run a suite was 7A on 2026-09-16, five
days ago; the week-one workbook is seven days long and its last day was 2026-09-16, so every firing
since has been past the end of the plan rather than early in it. Seven rows are outstanding and all
seven are local: 1B, 3B, 4B, 5A, 5B, 6A, 7B and the flake half of 7A. The routine cannot recover on
its own, and five skips are evidence enough that it will not: nothing a cloud runner can do adds a
cloud-capable row, so every firing from here repeats this entry until the local rows are run, week
two is planned with cloud-capable rows in it, or the routine is paused. That is the first item
under "What's waiting on Jack" in `TEST-STATE.md` and has been since 2026-09-17; the four testing
questions standing there since 2026-09-11 are the work that would unblock the runner, and three of
them would change what a test asserts. This firing sent Jack a notification saying so, which the
four before it did not.

## 2026-09-22 — cloud shift, skipped

No row was taken and no suite was run, for the sixth firing running. `TEST-STATE.md` still names
shift 1B in "What's in progress", and `TEST-SHIFT.md`'s "Which shifts can run where" still lists 1B
as local, so the substitute rule applies. `TEST-WORKBOOK.md` was re-read rather than assumed: its
table is unchanged since `da85a6b` on 2026-09-16, and it still marks all six cloud-capable rows —
2A on 2026-09-11, 2B on 2026-09-12, 3A on 2026-09-13, 4A on 2026-09-14, 6B on 2026-09-15 and 7A's
review half on 2026-09-16 — as done. There is no earliest cloud-capable row left to take, so this
entry is the skip entry the cloud section calls for, naming 1B as the local row that blocks. It is
also what "What's next" in `TEST-STATE.md` instructed this firing to do, in place of improvising a
row.

The checkout was read only, as on 2026-09-17 through 2026-09-21. `npm install` was not run, `npm run
build` was not run, no suite ran, `test-results/` was never created, and nothing under `src/`,
`tests/` or `FINDINGS/` was created or changed. `origin/main` was at `844e6dd`, the 2026-09-21 skip
commit, and a `git pull --rebase origin main` reported the checkout already up to date; `git diff
--name-only da85a6b HEAD` lists `TEST-LOG.md` and `TEST-STATE.md` and nothing else, so the six skips
are the entire history since 7A closed. `FINDINGS/` still holds seven files, the newest dated
2026-09-16. The only files this shift writes are `TEST-LOG.md` and `TEST-STATE.md`. No shift-open
entry was written, because no shift was opened.

Six firings have now produced six skip entries and no test run, on 2026-09-17 through 2026-09-22.
The last shift to run a suite was 7A on 2026-09-16, six days ago, and the week-one workbook ended
that same day, so all six firings have been past the end of the plan rather than early in it. Seven
rows are outstanding and all seven are local: 1B, 3B, 4B, 5A, 5B, 6A, 7B and the flake half of 7A.
Nothing a cloud runner can do adds a cloud-capable row, so every firing from here repeats this entry
until the local rows are run, week two is planned with cloud-capable rows in it, or the routine is
paused. The 2026-09-21 firing sent Jack a notification saying exactly that; nothing in the
repository has changed in the day since, so this firing sent a second one rather than let the
silence read as health. The four testing questions standing under "What's waiting on Jack" since
2026-09-11 are the work that would unblock the runner, and three of them would change what a test
asserts.

## 2026-09-23 — cloud shift, skipped

No row was taken and no suite was run, for the seventh firing running. `TEST-STATE.md` still names
shift 1B in "What's in progress", and `TEST-SHIFT.md`'s "Which shifts can run where" still lists 1B
as local, so the substitute rule applies. `TEST-WORKBOOK.md` was re-read rather than assumed: its
table is unchanged since `da85a6b` on 2026-09-16, and it still marks all six cloud-capable rows —
2A on 2026-09-11, 2B on 2026-09-12, 3A on 2026-09-13, 4A on 2026-09-14, 6B on 2026-09-15 and 7A's
review half on 2026-09-16 — as done. There is no earliest cloud-capable row left to take, so this
entry is the skip entry the cloud section calls for, naming 1B as the local row that blocks. It is
also what "What's next" in `TEST-STATE.md` instructed this firing to do, in place of improvising a
row.

The checkout was read only, as on 2026-09-17 through 2026-09-22. `npm install` was not run, `npm run
build` was not run, no suite ran, `test-results/` was never created, and nothing under `src/`,
`tests/` or `FINDINGS/` was created or changed. `origin/main` was at `9ea2530`, the 2026-09-22 skip
commit, and a `git pull --rebase origin main` reported the checkout already up to date; `git diff
--name-only da85a6b HEAD` lists `TEST-LOG.md` and `TEST-STATE.md` and nothing else, so the seven
skips are the entire history since 7A closed. `FINDINGS/` still holds seven files, the newest dated
2026-09-16. The only files this shift writes are `TEST-LOG.md` and `TEST-STATE.md`. No shift-open
entry was written, because no shift was opened.

Seven firings have now produced seven skip entries and no test run, on 2026-09-17 through
2026-09-23, which is a full week of them. The last shift to run a suite was 7A on 2026-09-16, seven
days ago, and the week-one workbook ended that same day, so the skips now cover exactly as many days
as the week they follow. Seven rows are outstanding and all seven are local: 1B, 3B, 4B, 5A, 5B, 6A,
7B and the flake half of 7A. Nothing a cloud runner can do adds a cloud-capable row, so every firing
from here repeats this entry until the local rows are run, week two is planned with cloud-capable
rows in it, or the routine is paused.

This firing sent Jack no notification, which is a deliberate departure from the two before it. The
2026-09-21 and 2026-09-22 firings each sent one carrying the same question, and nothing in the
repository has changed since: `origin/main` moved only by their own skip commits, no findings file
was added, and no answer to any of the five questions under "What's waiting on Jack" arrived. A
third identical message on the third consecutive day adds no information and spends attention that
the first two already asked for, so the question is left standing in `TEST-STATE.md` where a shift
reading it will find it. A later firing should send one again when something changes, or when a
further week of skips has passed without an answer, rather than daily.
