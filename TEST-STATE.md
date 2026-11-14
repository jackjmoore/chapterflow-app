# Test suite — current state

Rewritten in full at the end of every shift. Keep the six headings below, in this order,
even when a section is empty. Every statement carries a number, a filename or a date.
Four sentences per section, six for What's in progress. Anything needing more technical
detail than two sentences goes in a `FINDINGS/` file and gets one plain sentence here
pointing at it.

Last updated: 2026-11-14, by the fifty-ninth cloud shift running to take no row and run no suite.

## Where it stands

Twenty-six suites and 1,201 assertions, of which 1,197 passed in 4 minutes 19 seconds on a cloud
runner on 2026-09-16 — still the most recent full run, with the per-suite table beside the baseline
of 2026-09-10 in `FINDINGS/2026-09-16-week-one-review.md`. The four failures are `lexicon`'s
spellcheck assertion and three page-count or layout assertions, one in `pagination` and two in
`live`, which fail wherever Liberation Serif substitutes for Times New Roman, and the baseline of
2026-09-10, 17 of 21 suites and 867 assertions, is still the only development-machine number and is
what 1B reruns against. Nothing under `src/` or `tests/` has changed since `da85a6b` of 2026-09-16,
confirmed on 2026-11-14 by an empty `git diff --stat da85a6b HEAD -- src tests` run after
`git fetch --unshallow origin main`, which is still the form every later firing should use for the
reason in `FINDINGS/2026-11-08-shallow-clone-history.md`; after unshallowing the history is 93
commits from the root, with `da85a6b` 59 back and `3e416c5` 78. `FINDINGS/` now holds sixteen
files: the seven of 2026-09-10 to 2026-09-16, one of 2026-11-06, two of 2026-11-07, and one each of
2026-11-08, 2026-11-09, 2026-11-10, 2026-11-12, 2026-11-13 and 2026-11-14.

## What happened last shift

The cloud firing of 2026-11-14 took no row, the fifty-ninth firing running to skip: this file
named 1B, which `TEST-SHIFT.md` lists as local, and `TEST-WORKBOOK.md` still marks all six
cloud-capable rows done — 2A, 2B, 3A, 4A, 6B and 7A's review half, 2026-09-11 through 2026-09-16 —
its table unchanged, confirmed by an empty `git diff --stat da85a6b HEAD -- TEST-WORKBOOK.md`. It
appended `## 2026-11-14 — cloud shift, skipped` to `TEST-LOG.md` naming 1B as the blocking row,
rewrote this file, committed and pushed, per the cloud section; the checkout was otherwise read
only, with no install, no build and no suite run. It wrote one findings file,
`FINDINGS/2026-11-14-provisioning-top-up.md`, which corrects the 2026-11-13 conclusion that the
frozen `.git` snapshot was gone: a third arrival shape appeared, `HEAD` detached at the remote tip
`e4d58ec` with `refs/heads/main` and `refs/remotes/origin/main` both at `4245f99` and the gap 1,
and the `.git` holding those refs is dated 2026-11-13 — pack `pack-4235e996…` at 20,557,875 bytes
and a bootstrap fetch at 2026-11-13 02:08:25, a day before the firing began — so the image is fixed
again and was re-snapshotted once between 2026-11-12 and 2026-11-13, with one mechanism covering
all three shapes: provisioning tops the working tree up to the current remote tip and leaves the
branch refs where the image has them, writing on this date six loose objects at 2026-11-14 02:08:26
that are the exact closure of `e4d58ec` against the packed `4245f99`. It sent no notification, the
ninth having gone on 2026-11-10 and the tenth falling due on 2026-11-17, and it repeated the
2026-10-12 check that the repository holds zero issues and zero pull requests, the thirty-fourth
date that check has been made and still no answer arriving through the repository by any route.

## What's in progress

Shift 1B is still next and still local, deferred sixty-five times over 2026-09-11 to 2026-11-14 —
six firings that took a substitute cloud row and fifty-nine that skipped. Its brief is three parts
of work for the machine: rerun `polish` and `searchui` to sort timing from regression, two
concurrent `--no-prepare` runs to prove the dynamic port fix, and record a second `bookrender`
duration against the 420.3 seconds of 2026-09-10 — part 3, the structure suite's stale header,
reduces to three clauses named in `FINDINGS/2026-11-07-structure-header.md`, and part 5, the
mangled-path folder, to deleting the folder and quoting the target per
`FINDINGS/2026-11-06-mangled-path-folder.md`. It answers three questions rather than one, because
2026-09-16 returned `polish` 114 of 114, `searchui` 96 of 96 and `bookrender` at 4.0 seconds on a
different machine. Seven rows are outstanding and all seven are local — 1B, 3B, 4B, 5A, 5B, 6A, 7B
— along with the flake half of 7A, so nothing in this workbook is cloud-capable any more and every
firing after 2026-11-14 skips the same way until the local rows are run or week two is planned with
cloud-capable rows in it. Week two is unplanned fifty-nine days past the end of week one, and
three of the four groups of questions below would change what a test asserts, so they are worth
answering before it is planned. The timing gap held for the sixty-third shift running: `structure`
0.3 seconds against 10.1, `compilestore` 0.4 against 17.0, and `bookrender` 4.0 against 420.3.

## What's waiting on Jack

Whether the daily cloud routine should keep firing, now that 2026-09-17 through 2026-11-14 have
each appended a skip entry and, on eight dates out of fifty-nine, nine findings files, which is
the only outcome available to it until week two is planned or the local rows are run; nine
notifications have carried this question, on 2026-09-21, 2026-09-22, 2026-09-29, 2026-10-06,
2026-10-13, 2026-10-20, 2026-10-27, 2026-11-03 and 2026-11-10, all nine went unanswered, no
issue or pull request carries an answer either, and the tenth falls due on 2026-11-17. Whether
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
Nothing new was added to this list on 2026-11-14, which is the ninth date running that nothing
was: the only thing the firing learned was that its own container is provisioned by topping up a
fixed image rather than by cloning, which changes no test and needs no decision.

## What's been ruled out

Windows Task Scheduler and headless `claude -p` as the scheduling mechanism, replaced by
Claude Code Routines, whose definition is now `TEST-ROUTINE.md`. Pixel-diff comparison for
compile output and any page-count or layout assertion outside Times New Roman on the development
machine, since that is the one unbundled font; relaxing or retuning the three assertions that
fail for that reason is ruled out with it. Committing the Scrivener corpus, which is git-ignored
apart from its README, and storing generated fixture projects, which the generator replaces;
substituting any older commit for `da85a6b` in the `src`/`tests` diff, since the shallow boundary
advances past every such commit in turn and the fix is `git fetch --unshallow origin main`
instead; and reconstructing `FINDINGS/2026-09-09-headless-viability.md`, which earlier entries
cite but which was never written. Predicting the arrival gap at all, whether by adding one per day,
by adding the previous firing's push count or by counting from the previous firing at all, since
the gap is the commits pushed since the container image was taken and the image's date moves
without notice — it was 0 on 2026-11-13 against a prediction of 6 and 1 on 2026-11-14, read both
times with `git rev-list --count main..origin/main` after a fetch, per
`FINDINGS/2026-11-14-provisioning-top-up.md`; and expecting a firing's own writes inside `.git` to
reach the next one stays ruled out, both reflogs inside `.git` having held one bootstrap event each
on every date from 2026-11-08 to 2026-11-14.

## What's next

A cloud shift firing next has no row to take: it should confirm from `TEST-WORKBOOK.md` that 2A, 2B,
3A, 4A, 6B and 7A's review half are still the only cloud-capable rows and still done, append a skip
entry naming 1B, commit, push and stop, rather than improvise a row — that is the sixtieth such
firing, and the fifty-nine before it are in `TEST-LOG.md` under 2026-09-17 through 2026-11-14. The
tenth notification falls due on 2026-11-17 under the weekly condition the 2026-09-23 entry set, and
it carries the routine question alone; a firing on any other date sends nothing unless something
changes in the repository from outside the routine, and a findings file, a confirmation or a fact
about its own container that the firing produces itself is its own output and does not meet that
condition, which is the reasoning 2026-11-06 through 2026-11-14 all recorded. On arrival it should
run `git rev-parse --abbrev-ref HEAD` and `git status --short` before anything else and expect a
clean tree, but it should read the arrival shape rather than assume one, because three have now
been seen and one mechanism explains them all — provisioning tops the working tree up to the remote
tip and leaves the branch refs at the image's commit, so `HEAD` arrives detached at the tip with
`main` stale when the image is behind, as on 2026-11-08 through 2026-11-12 at `57dcd3f` and on
2026-11-14 at `4245f99`, and attached with a gap of 0 when the image is already current, as on
2026-11-13; the sequence `git fetch origin main`, `git checkout main`, `git merge --ff-only
origin/main` is correct under all three, the fetch first being what makes the checkout's revert
harmless, the gap is read with `git rev-list --count main..origin/main` after the fetch rather than
predicted, and `FINDINGS/2026-11-14-provisioning-top-up.md` names what would show the image has
been re-snapshotted again. It should still expect the cloud section's `git pull --rebase origin
main` to refuse while its own writes are unstaged, the working order being add, commit, rebase,
push, as the 2026-11-11 through 2026-11-14 log entries all record, and before any comparison to a
commit older than fifty back, `da85a6b` and `3e416c5` included, it should run `git rev-parse
--is-shallow-repository` and, if true, `git fetch --unshallow origin main`, which touches nothing
on the remote and was needed again on 2026-11-14. On the development machine the queue is 1B first,
then 3B, 4B, 5A, 5B, 6A, 7B and 7A's flake half, and row 4B's brief is unchanged — PDF under
Electron with the same assertions via outline entries, compile index written last, and the
font-resolution check made able to fail, for which 2026-09-16 is the demonstration, having reported
`Times New Roman` as resolved on a machine where `fc-match` returns `LiberationSerif-Regular.ttf` —
while any cloud shift that does get a row should follow `TEST-ROUTINE.md`'s five pre-flight steps,
of which `git checkout package-lock.json` after install and `node -e "require('electron')"` were
both needed again on 2026-09-16, and `npm run build`, which takes about a second, is what unlocks
`search`, `rank` and `lexicon`; it will find `xvfb-run` at `/usr/bin/xvfb-run`, Node v22.23.4, and
`node_modules/`, `out/` and `test-results/` all absent, as on 2026-11-14.
