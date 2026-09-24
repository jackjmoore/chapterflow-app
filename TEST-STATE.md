# Test suite — current state

Rewritten in full at the end of every shift. Keep the six headings below, in this order,
even when a section is empty. Every statement carries a number, a filename or a date.
Four sentences per section, six for What's in progress. Anything needing more technical
detail than two sentences goes in a `FINDINGS/` file and gets one plain sentence here
pointing at it.

Last updated: 2026-09-24, by the eighth cloud shift running to take no row and run no suite.

## Where it stands

Twenty-six suites and 1,201 assertions, of which 1,197 passed in 4 minutes 19 seconds on a cloud
runner on 2026-09-16 — still the most recent full run, with the per-suite table beside the
baseline of 2026-09-10 in `FINDINGS/2026-09-16-week-one-review.md`. Four assertions fail:
`lexicon`'s spellcheck one, the same text on both machines for the fourth time, and one in
`pagination` and two in `live`, all three page counts or layout measurements that fail wherever
Liberation Serif substitutes for Times New Roman. The baseline of 2026-09-10, 17 of 21 suites and
867 assertions, is still the only development-machine number and is what 1B reruns against.
`TEST-ROUTINE.md` carries the cloud-capable list as a runner invocation, 20 suites and 858
assertions all passing on 2026-09-16, and nothing under `src/`, `tests/` or `FINDINGS/` has changed
since, because none of 2026-09-17 through 2026-09-24 ran anything.

## What happened last shift

The cloud firing of 2026-09-24 took no row, the eighth firing running to skip: this file named 1B,
which `TEST-SHIFT.md` lists as local, and `TEST-WORKBOOK.md` still marks all six cloud-capable rows
done — 2A, 2B, 3A, 4A, 6B and 7A's review half, 2026-09-11 through 2026-09-16 — its table unchanged
since `da85a6b`, confirmed by an empty `git diff --stat da85a6b HEAD -- TEST-WORKBOOK.md`. It
appended `## 2026-09-24 — cloud shift, skipped` to `TEST-LOG.md` naming 1B as the blocking row,
rewrote this file, committed and pushed, per the cloud section; the checkout was read only, with no
install, no build and no suite run, and `origin/main` was unmoved at `e6b7200` from the day before.
It sent Jack no notification, for the second day running: the condition the 2026-09-23 entry set —
something changes, or a further week of skips passes unanswered — is not met, and falls due on
2026-09-29 if the silence holds. No number in this file has moved since 2026-09-16 and none will
while the firings skip.

## What's in progress

Shift 1B is still next and still local, deferred thirteen times over 2026-09-11 to 2026-09-24: rerun
polish and searchui to sort timing from regression, two concurrent `--no-prepare` runs to prove the
dynamic port fix, correct the structure suite's stale header, delete the mangled-path folder in the
repo root, and record a second bookrender duration against the 420.3 seconds of 2026-09-10. It
answers three questions rather than one, because 2026-09-16 returned `polish` 114 of 114, `searchui`
96 of 96 and `bookrender` at 4.0 seconds on a different machine. Nothing in this workbook is
cloud-capable any more, and no cloud shift can change that, so 2026-09-17 through 2026-09-24 all
skipped and every firing after them skips the same way, until the local rows are run or week two is
planned with cloud-capable rows in it. Seven rows are outstanding and all seven are local: 1B, 3B,
4B, 5A, 5B, 6A, 7B and the flake half of 7A. Week two is unplanned eight days past the end of week
one, so the skips now outlast the week they follow, and three of the four testing questions below
would change what a test asserts, so they are worth answering before it is planned. The timing gap
held for the twelfth shift running: `structure` 0.3 seconds against 10.1, `compilestore` 0.4 against
17.0, and `bookrender` 4.0 against 420.3.

## What's waiting on Jack

Whether the daily cloud routine should keep firing, now that 2026-09-17 through 2026-09-24 have
each appended a skip entry and nothing else, which is the only outcome available to it until week
two is planned or the local rows are run; the 2026-09-21 and 2026-09-22 firings each sent this
question as a notification, the 2026-09-23 and 2026-09-24 firings deliberately sent none rather than
repeat it daily, and a firing should send one again when something changes or on 2026-09-29, a
further week on, if the silence holds. Whether `documentImageStore.deleteImage` should ever be
called, since it is exported with no caller anywhere in `src/` and a manuscript image outlives both
its removal from the text and its document's deletion while the Story Bible side cleans up on all
three paths, traced in `FINDINGS/2026-09-15-reference-rot.md`, and whether front matter should sit
before or after the table of contents in compiled plain text and Markdown, since PDF and docx put it
before, traced in `FINDINGS/2026-09-14-compile-structure.md`. Whether `mentionStore` should extract
a document's text the way `searchIndex` does, since the difference makes a character named just
after a chapter heading invisible to detection, demonstrated in
`FINDINGS/2026-09-13-fixture-generator.md`, and whether `duplicateNode` and `deleteNode` should
write the binder on the other side of the document content they copy or remove, traced in
`FINDINGS/2026-09-12-binder-part-two.md` and compounded by 6B's finding that `binder:delete`
cascades into comments and mentions after the binder is already written. Whether the fifteen stores
without the `loadFailed` guard should refuse to write when their file cannot be read, listed store
by store in `FINDINGS/2026-09-11-filesystem-part-one.md`, whether the eight polish failures of
2026-09-10 should be fixed if 1B confirms them, which is a renderer change and needs visual
confirmation, and whether `pagination` and `live` should hold page-count and layout assertions at
all, since three of them fail on any machine without Times New Roman and `TESTING-PLAN.md`'s font
constraint says nothing may assert them.

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

A cloud shift firing next has no row to take: it should confirm from `TEST-WORKBOOK.md` that 2A,
2B, 3A, 4A, 6B and 7A's review half are still the only cloud-capable rows and still done, append a
skip entry naming 1B, commit, push and stop, rather than improvise a row — that is the ninth such
firing, and the eight before it are in `TEST-LOG.md` under 2026-09-17 through 2026-09-24; it should
also send no notification before 2026-09-29 unless something has changed, for the reason the
2026-09-23 entry gives. On the development machine the queue is 1B first, then 3B, 4B, 5A, 5B,
6A, 7B and 7A's flake half. Row 4B's brief is unchanged: PDF under Electron with the same assertions
via outline entries, compile index written last, and the font-resolution check made able to fail —
2026-09-16 is the demonstration that check needs, since it reported `Times New Roman` as resolved on
a machine where `fc-match` returns `LiberationSerif-Regular.ttf` — and row 4A's section-count,
scope, last-paragraph and matter-order sections are format-agnostic, with front-matter ordering
already settled for PDF, which puts matter first. Any cloud shift that does get a row should follow
`TEST-ROUTINE.md`'s five pre-flight steps, of which `git checkout package-lock.json` after install
and `node -e "require('electron')"` were both needed again on 2026-09-16, and `npm run build`,
which takes about a second, is what unlocks `search`, `rank` and `lexicon`.
