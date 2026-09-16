# Test suite — current state

Rewritten in full at the end of every shift. Keep the six headings below, in this order,
even when a section is empty. Every statement carries a number, a filename or a date.
Four sentences per section, six for What's in progress. Anything needing more technical
detail than two sentences goes in a `FINDINGS/` file and gets one plain sentence here
pointing at it.

Last updated: 2026-09-16 at the close of the review half of cloud shift 7A.

## Where it stands

Twenty-six suites and 1,201 assertions, of which 1,197 passed in 4 minutes 19 seconds on a cloud
runner on 2026-09-16 — the first full run since the baseline of 2026-09-10 and the first cloud
number for ten of the suites, with the per-suite table beside the baseline in
`FINDINGS/2026-09-16-week-one-review.md`. Four assertions fail: `lexicon`'s spellcheck one, the
same text on both machines for the fourth time, and one in `pagination` and two in `live`, all
three page counts or layout measurements that fail wherever Liberation Serif substitutes for
Times New Roman. The baseline of 2026-09-10, 17 of 21 suites and 867 assertions, is still the
only development-machine number and is what 1B reruns against. `TEST-ROUTINE.md` is new and
carries the cloud-capable list as a runner invocation: 20 suites and 858 assertions, every one of
which passed on 2026-09-16.

## What happened last shift

The review half of row 7A ran on a cloud runner in place of 1B: the weekly review is the
`TEST-LOG.md` entry of 2026-09-16, the numbers behind it are in
`FINDINGS/2026-09-16-week-one-review.md`, and `TEST-ROUTINE.md` is the routine definition the row
asked for, committed in `91a081f`. No test was written, changed or deleted and nothing in `src/`
was touched. `polish` passed 114 of 114 and `searchui` 96 of 96 against 106 and 93 on
2026-09-10, with `git diff 3e416c5..HEAD -- src/` showing two main-process files and nothing
under `src/renderer`, so the eight polish failures look more like the development machine than
like the two hover-card commits — one cloud run cannot settle it, and 1B still can.
`TEST-SHIFT.md` was corrected on its own in `9ba3ca3`, because `freshness` passes on a cloud
runner once `npm run build` has run, which also answers without Jack the freshness question that
had been standing against his name.

## What's in progress

Shift 1B is still next and still local, deferred six times: rerun polish and searchui to sort
timing from regression, two concurrent `--no-prepare` runs to prove the dynamic port fix, correct
the structure suite's stale header, delete the mangled-path folder in the repo root, and record a
second bookrender duration against the 420.3 seconds of 2026-09-10. It now answers three
questions rather than one, because 2026-09-16 returned `polish` 114 of 114, `searchui` 96 of 96
and `bookrender` at 4.0 seconds on a different machine. There is no cloud-capable row left in
this workbook: 2A, 2B, 3A, 4A and 6B were done on 2026-09-11 through 2026-09-15 in 1B's place,
and 7A's review half on 2026-09-16, leaving 1B, 3B, 4B, 5A, 5B, 6A, 7B and 7A's flake half, all
local. A cloud shift firing after this one therefore has nothing to take and should append a skip
entry naming 1B, commit, push and stop, per `TEST-SHIFT.md`. Week two is unplanned, and three of
the four questions below would change what a test asserts, so they are worth answering before it
is planned. The timing gap held for the sixth shift running: `structure` 0.3 seconds against
10.1, `compilestore` 0.4 against 17.0, and now `bookrender` 4.0 against 420.3.

## What's waiting on Jack

Whether `documentImageStore.deleteImage` should ever be called, since it is exported with no
caller anywhere in `src/` and a manuscript image outlives both its removal from the text and its
document's deletion, while the Story Bible side cleans up on all three paths — traced in
`FINDINGS/2026-09-15-reference-rot.md`. Whether front matter should sit before or after the table
of contents in compiled plain text and Markdown, since PDF and docx put it before and those two
put it after, traced in `FINDINGS/2026-09-14-compile-structure.md`, and whether `mentionStore`
should extract a document's text the way `searchIndex` does, since the difference makes a
character named just after a chapter heading invisible to detection, demonstrated in
`FINDINGS/2026-09-13-fixture-generator.md`. Whether `duplicateNode` and `deleteNode` should write
the binder on the other side of the document content they copy or remove, traced in
`FINDINGS/2026-09-12-binder-part-two.md` and compounded by 6B's finding that `binder:delete`
cascades into comments and mentions after the binder is already written, and whether the fifteen
stores without the `loadFailed` guard should refuse to write when their file cannot be read,
listed store by store in `FINDINGS/2026-09-11-filesystem-part-one.md`. Whether the eight polish
failures of 2026-09-10 should be fixed if 1B confirms them, which is a renderer change and needs
visual confirmation, and whether `pagination` and `live` should hold page-count and layout
assertions at all, since three of them fail on any machine without Times New Roman and
`TESTING-PLAN.md`'s font constraint says nothing may assert them.

## What's been ruled out

Windows Task Scheduler and headless `claude -p` as the scheduling mechanism, replaced by
Claude Code Routines, whose definition is now `TEST-ROUTINE.md`. Pixel-diff comparison for
compile output and any page-count or layout assertion outside Times New Roman on the development
machine, since that is the one unbundled font; relaxing or retuning the three assertions that
fail for that reason is ruled out with it. Committing the Scrivener corpus, which is git-ignored
apart from its README, and storing generated fixture projects, which the generator replaces. The
`FINDINGS/2026-09-09-headless-viability.md` file earlier entries cite was never written and is
not being reconstructed.

## What's next

Shift 4B on the development machine: PDF under Electron with the same assertions via outline
entries, compile index written last, and the font-resolution check made able to fail — 2026-09-16
is the demonstration that check needs, since it reported `Times New Roman` as resolved on a
machine where `fc-match` returns `LiberationSerif-Regular.ttf`. Row 4A's section-count, scope,
last-paragraph and matter-order sections are format-agnostic and 4B needs only a different reader
for them; the front-matter ordering question is already settled for PDF, which puts matter first,
so 4B should assert that rather than re-open it. Shifts 1B and 3B are both still outstanding and
both still local, as are 5A, 5B, 6A, 7B and 7A's flake half, so a cloud shift arriving next has
no row to take and should log the skip rather than improvise one. Any cloud shift should follow
`TEST-ROUTINE.md`'s five pre-flight steps, of which `git checkout package-lock.json` after
install and `node -e "require('electron')"` were both needed again on 2026-09-16, and
`npm run build`, which takes about a second, is what unlocks `search`, `rank` and `lexicon`.
