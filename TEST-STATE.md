# Test suite — current state

Rewritten in full at the end of every shift. Keep the six headings below, in this order,
even when a section is empty. Every statement carries a number, a filename or a date.
Four sentences per section, six for What's in progress. Anything needing more technical
detail than two sentences goes in a `FINDINGS/` file and gets one plain sentence here
pointing at it.

Last updated: 2026-11-08, by the fifty-third cloud shift running to take no row and run no suite.

## Where it stands

Twenty-six suites and 1,201 assertions, of which 1,197 passed in 4 minutes 19 seconds on a cloud
runner on 2026-09-16 — still the most recent full run, with the per-suite table beside the baseline
of 2026-09-10 in `FINDINGS/2026-09-16-week-one-review.md`. The four failures are `lexicon`'s
spellcheck assertion and three page-count or layout assertions, one in `pagination` and two in
`live`, which fail wherever Liberation Serif substitutes for Times New Roman. The baseline of
2026-09-10, 17 of 21 suites and 867 assertions, is still the only development-machine number and is
what 1B reruns against. Nothing under `src/` or `tests/` has changed since `da85a6b` of 2026-09-16,
confirmed on 2026-11-08 by an empty `git diff --stat da85a6b HEAD -- src tests` run after
`git fetch --unshallow origin main`, which is the form every later firing should use for the reason
in `FINDINGS/2026-11-08-shallow-clone-history.md`, and `FINDINGS/` now holds eleven files: the
seven of 2026-09-16, `FINDINGS/2026-11-06-mangled-path-folder.md`, two of 2026-11-07 and one of
2026-11-08.

## What happened last shift

The cloud firing of 2026-11-08 took no row, the fifty-third firing running to skip: this file named
1B, which `TEST-SHIFT.md` lists as local, and `TEST-WORKBOOK.md` still marks all six cloud-capable
rows done — 2A, 2B, 3A, 4A, 6B and 7A's review half, 2026-09-11 through 2026-09-16 — its table
unchanged, confirmed by an empty `git diff --stat da85a6b HEAD -- TEST-WORKBOOK.md`. It appended
`## 2026-11-08 — cloud shift, skipped` to `TEST-LOG.md` naming 1B as the blocking row, rewrote this
file, committed and pushed, per the cloud section; the checkout was otherwise read only, with no
install, no build and no suite run. It wrote one findings file,
`FINDINGS/2026-11-08-shallow-clone-history.md`, which corrects
`FINDINGS/2026-11-07-unreachable-baseline.md`: the checkout arrives as a shallow clone of fixed
depth 50, `git rev-parse --is-shallow-repository` returns true, and what yesterday read as a root
import is the shallow boundary, which advances one commit per firing — depth 50 from yesterday's
`6dcdd75` lands on `a983d96` and depth 50 from today's `57dcd3f` lands on `4ad60b3`, both of which
were duly reported as root commits. After `git fetch --unshallow origin main`, which changes nothing
on the remote, the history is 86 commits from the root `9d1ccdc` of 2026-08-20, 59 by `Claude` and
27 by `Jack Moore`, with `3e416c5`, `da85a6b` and `a983d96` all reachable ancestors of `HEAD`, so
nothing is lost, both halves of 7A are in the pushed history, and yesterday's seven unreachable
commits were an artifact of the graft. The checkout arrived in the first of the three recorded
shapes, a clean tree on branch `main` at the remote tip `57dcd3f` with `origin/main` at the same
commit, so no fetch, checkout or fast-forward was needed before committing, and the pack is dated
with the clone rather than 2026-10-31, so the image was rebuilt since 2026-11-07. It sent no
notification, 2026-11-08 falling between the eighth of 2026-11-03 and the ninth due on 2026-11-10,
and it repeated the 2026-10-12 check that the repository holds zero issues and zero pull requests,
the twenty-eighth date that check has been made and still no answer arriving through the repository
by any route.

## What's in progress

Shift 1B is still next and still local, deferred fifty-nine times over 2026-09-11 to 2026-11-08 —
six firings that took a substitute cloud row and fifty-three that skipped. Its brief is three parts
of work for the machine: rerun `polish` and `searchui` to sort timing from regression, two
concurrent `--no-prepare` runs to prove the dynamic port fix, and record a second `bookrender`
duration against the 420.3 seconds of 2026-09-10 — part 3, the structure suite's stale header,
reduces to three clauses named in `FINDINGS/2026-11-07-structure-header.md`, and part 5, the
mangled-path folder, to deleting the folder and quoting the target per
`FINDINGS/2026-11-06-mangled-path-folder.md`. It answers three questions rather than one, because
2026-09-16 returned `polish` 114 of 114, `searchui` 96 of 96 and `bookrender` at 4.0 seconds on a
different machine. Seven rows are outstanding and all seven are local — 1B, 3B, 4B, 5A, 5B, 6A, 7B
— along with the flake half of 7A, so nothing in this workbook is cloud-capable any more and every
firing after 2026-11-08 skips the same way until the local rows are run or week two is planned with
cloud-capable rows in it. Week two is unplanned fifty-three days past the end of week one, and three
of the four groups of questions below would change what a test asserts, so they are worth answering
before it is planned. The timing gap held for the fifty-seventh shift running: `structure` 0.3
seconds against 10.1, `compilestore` 0.4 against 17.0, and `bookrender` 4.0 against 420.3.

## What's waiting on Jack

Whether the daily cloud routine should keep firing, now that 2026-09-17 through 2026-11-08 have
each appended a skip entry and, on three dates out of fifty-three, four findings files, which is the
only outcome available to it until week two is planned or the local rows are run; eight
notifications have carried this question, on 2026-09-21, 2026-09-22, 2026-09-29, 2026-10-06,
2026-10-13, 2026-10-20, 2026-10-27 and 2026-11-03, all eight went unanswered, no issue or pull
request carries an answer either, and the ninth falls due on 2026-11-10. Whether
`documentImageStore.deleteImage` should ever be called, since it is exported with no caller anywhere
in `src/` and a manuscript image outlives both its removal from the text and its document's deletion
while the Story Bible side cleans up on all three paths, traced in
`FINDINGS/2026-09-15-reference-rot.md`; whether front matter should sit before or after the table of
contents in compiled plain text and Markdown, since PDF and docx put it before, traced in
`FINDINGS/2026-09-14-compile-structure.md`; whether `mentionStore` should extract a document's text
the way `searchIndex` does, since the difference makes a character named just after a chapter
heading invisible to detection, demonstrated in `FINDINGS/2026-09-13-fixture-generator.md`; and
whether `duplicateNode` and `deleteNode` should write the binder on the other side of the document
content they copy or remove, traced in `FINDINGS/2026-09-12-binder-part-two.md` and compounded by
6B's finding that `binder:delete` cascades into comments and mentions after the binder is already
written. Whether the fifteen stores without the `loadFailed` guard should refuse to write when their
file cannot be read, listed store by store in `FINDINGS/2026-09-11-filesystem-part-one.md`, whether
the eight polish failures of 2026-09-10 should be fixed if 1B confirms them, which is a renderer
change and needs visual confirmation, whether `pagination` and `live` should hold page-count and
layout assertions at all, since three of them fail on any machine without Times New Roman and
`TESTING-PLAN.md`'s font constraint says nothing may assert them, and whether
`scripts/make-demo-project.mjs` should reject a relative target outright, a one-line main-process
change that could carry a test beside it, raised in `FINDINGS/2026-11-06-mangled-path-folder.md`.
The question of how the history came to begin on 2026-09-18, which the 2026-11-07 rewrite put here
and queued for the ninth notification, is answered and off this list: it did not, there is no
pre-history to look for in a clone on the development machine, and
`FINDINGS/2026-11-08-shallow-clone-history.md` has the evidence.

## What's been ruled out

Windows Task Scheduler and headless `claude -p` as the scheduling mechanism, replaced by
Claude Code Routines, whose definition is now `TEST-ROUTINE.md`. Pixel-diff comparison for
compile output and any page-count or layout assertion outside Times New Roman on the development
machine, since that is the one unbundled font; relaxing or retuning the three assertions that
fail for that reason is ruled out with it. Committing the Scrivener corpus, which is git-ignored
apart from its README, and storing generated fixture projects, which the generator replaces; and,
in place of the 2026-11-07 entry about reconstructing or preserving the seven commits of 2026-09-15
to 2026-09-17, which is moot because they are reachable from `main`, substituting any older commit
for `da85a6b` in the `src`/`tests` diff, since the shallow boundary advances past every such commit
in turn and the fix is `git fetch --unshallow origin main` instead. The
`FINDINGS/2026-09-09-headless-viability.md` file earlier entries cite was never written and is
not being reconstructed.

## What's next

A cloud shift firing next has no row to take: it should confirm from `TEST-WORKBOOK.md` that 2A, 2B,
3A, 4A, 6B and 7A's review half are still the only cloud-capable rows and still done, append a skip
entry naming 1B, commit, push and stop, rather than improvise a row — that is the fifty-fourth such
firing, and the fifty-three before it are in `TEST-LOG.md` under 2026-09-17 through 2026-11-08. It
sends no notification unless something changes in the repository from outside the routine, since the
eighth went on 2026-11-03 and the ninth falls due on 2026-11-10 under the weekly condition the
2026-09-23 entry set, which makes 2026-11-09 silent and gives the ninth the routine question alone,
the unreachable-history question having been answered on 2026-11-08; a findings file the firing
writes itself is its own output and does not meet that condition, which is the reasoning 2026-11-06,
2026-11-07 and 2026-11-08 all recorded. On the development machine the queue is 1B first, then 3B,
4B, 5A, 5B, 6A, 7B and 7A's flake half, and row 4B's brief is unchanged — PDF under Electron with
the same assertions via outline entries, compile index written last, and the font-resolution check
made able to fail, for which 2026-09-16 is the demonstration, having reported `Times New Roman` as
resolved on a machine where `fc-match` returns `LiberationSerif-Regular.ttf` — while row 4A's
section-count, scope, last-paragraph and matter-order sections are format-agnostic, with
front-matter ordering already settled for PDF, which puts matter first. Any cloud shift that does
get a row should follow `TEST-ROUTINE.md`'s five pre-flight steps, of which
`git checkout package-lock.json` after install and `node -e "require('electron')"` were both needed
again on 2026-09-16, and `npm run build`, which takes about a second, is what unlocks `search`,
`rank` and `lexicon`; it should expect any of the three recorded checkout shapes, most recently a
clean tree on `main` at the remote tip on 2026-11-08, run `git fetch origin main` before comparing
to the remote and check it is on `main` before committing without extrapolating the gap, which seven
rebuilds have reset to zero on dates no firing predicted, and — before any comparison to a commit
older than fifty back, `da85a6b` and `3e416c5` included — run `git rev-parse
--is-shallow-repository` and, if it returns true, `git fetch --unshallow origin main`, which touches
nothing on the remote and is the only thing that makes those commits resolvable, per
`FINDINGS/2026-11-08-shallow-clone-history.md`; it will find `xvfb-run` at `/usr/bin/xvfb-run` and
Node v22.23.4.
