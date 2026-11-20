# Test suite — current state

Rewritten in full at the end of every shift. Keep the six headings below, in this order,
even when a section is empty. Every statement carries a number, a filename or a date.
Four sentences per section, six for What's in progress. Anything needing more technical
detail than two sentences goes in a `FINDINGS/` file and gets one plain sentence here
pointing at it.

Last updated: 2026-11-20, by the sixty-fifth cloud shift running to take no row and run no suite.

## Where it stands

Twenty-six suites and 1,201 assertions, of which 1,197 passed in 4 minutes 19 seconds on a cloud
runner on 2026-09-16 — still the most recent full run, with the per-suite table beside the baseline
of 2026-09-10 in `FINDINGS/2026-09-16-week-one-review.md`. The four failures are `lexicon`'s
spellcheck assertion and three page-count or layout assertions, one in `pagination` and two in
`live`, which fail wherever Liberation Serif substitutes for Times New Roman, and the baseline of
2026-09-10, 17 of 21 suites and 867 assertions, is still the only development-machine number and is
what 1B reruns against. Nothing under `src/` or `tests/` has changed since `da85a6b` of 2026-09-16,
confirmed on 2026-11-20 by an empty `git diff --stat da85a6b HEAD -- src tests` run after
`git fetch --unshallow origin main`, which is still the form every later firing should use for the
reason in `FINDINGS/2026-11-08-shallow-clone-history.md`; after unshallowing the history is 99
commits from the root, with `da85a6b` 65 back and `3e416c5` 84. `FINDINGS/` still holds twenty
files, none added on 2026-11-20: the seven of 2026-09-10 to 2026-09-16, one of 2026-11-06, two of
2026-11-07, and one each of 2026-11-08, 2026-11-09, 2026-11-10, 2026-11-12, 2026-11-13, 2026-11-14,
2026-11-15, 2026-11-17, 2026-11-18 and 2026-11-19.

## What happened last shift

The cloud firing of 2026-11-20 took no row, the sixty-fifth firing running to skip: this file named
1B, which `TEST-SHIFT.md` lists as local, and `TEST-WORKBOOK.md` still marks all six cloud-capable
rows done — 2A, 2B, 3A, 4A, 6B and 7A's review half, 2026-09-11 through 2026-09-16 — its table
unchanged, confirmed by an empty `git diff --stat da85a6b HEAD -- TEST-WORKBOOK.md`. It appended
`## 2026-11-20 — cloud shift, skipped` to `TEST-LOG.md` naming 1B as the blocking row, rewrote this
file, committed and pushed, per the cloud section; the checkout was otherwise read only, with no
install, no build and no suite run. It wrote no findings file, the first firing since 2026-11-16 not
to, because the one thing it learned about its container fits in two sentences: the image did not
move, the pack read before unshallowing being `pack-d8aeb08a…` at 20,576,948 bytes dated 2026-11-19
02:08:22, byte for byte and second for second what 2026-11-19 recorded, so the fourth image has
served two firings and the third image's one-firing life did not repeat, leaving the four image
dates at 2026-11-08, 2026-11-13, 2026-11-18 and 2026-11-19. The arrival shape was the detached one
for the tenth time of thirteen readings since 2026-11-08 and the second at a gap of 1 after
2026-11-14 — working tree at the remote tip `6883ee6`, `HEAD` detached, `main` and `origin/main`
both stale at the image's `a2f1d46`, clean `git status --short`, six loose objects consistent with
the closure of that one commit, and three lines in `.git/logs/HEAD` of which the third, stamped
1795140558 for 2026-11-20 02:09:18, is this firing's own provisioning rather than the last firing's
work. Here the sequence `git fetch origin main`, `git checkout main`, `git merge --ff-only
origin/main` was a rescue and not a no-op, the checkout reverting the tree to `a2f1d46` and the
merge carrying it back to `6883ee6`, and the firing also confirmed that the image's pack must be
read before unshallowing, since the unshallow wrote a second pack of its own, `pack-523af819…` at
793,799 bytes dated 2026-11-20 02:10:04. It sent no notification, the eleventh being due on
2026-11-24, and it repeated the 2026-10-12 check that the repository holds zero issues and zero pull
requests, the fortieth date that check has been made and still no answer arriving through the
repository by any route.

## What's in progress

Shift 1B is still next and still local, deferred seventy-one times over 2026-09-11 to 2026-11-20 —
six firings that took a substitute cloud row and sixty-five that skipped. Its brief is three parts
of work for the machine: rerun `polish` and `searchui` to sort timing from regression, two
concurrent `--no-prepare` runs to prove the dynamic port fix, and record a second `bookrender`
duration against the 420.3 seconds of 2026-09-10 — part 3, the structure suite's stale header,
reduces to three clauses named in `FINDINGS/2026-11-07-structure-header.md`, and part 5, the
mangled-path folder, to deleting the folder and quoting the target per
`FINDINGS/2026-11-06-mangled-path-folder.md`. It answers three questions rather than one, because
2026-09-16 returned `polish` 114 of 114, `searchui` 96 of 96 and `bookrender` at 4.0 seconds on a
different machine. Seven rows are outstanding and all seven are local — 1B, 3B, 4B, 5A, 5B, 6A, 7B
— along with the flake half of 7A, so nothing in this workbook is cloud-capable any more and every
firing after 2026-11-20 skips the same way until the local rows are run or week two is planned with
cloud-capable rows in it. Week two is unplanned sixty-five days past the end of week one, and three
of the four groups of questions below would change what a test asserts, so they are worth answering
before it is planned. The timing gap held for the sixty-ninth shift running: `structure` 0.3 seconds
against 10.1, `compilestore` 0.4 against 17.0, and `bookrender` 4.0 against 420.3.

## What's waiting on Jack

Whether the daily cloud routine should keep firing, now that 2026-09-17 through 2026-11-20 have
each appended a skip entry and, on twelve dates out of sixty-five, thirteen findings files, which is
the only outcome available to it until week two is planned or the local rows are run; ten
notifications have carried this question, on 2026-09-21, 2026-09-22, 2026-09-29, 2026-10-06,
2026-10-13, 2026-10-20, 2026-10-27, 2026-11-03, 2026-11-10 and 2026-11-17, all ten went
unanswered, no issue or pull request carries an answer either, and the eleventh falls due on
2026-11-24. Whether `documentImageStore.deleteImage` should ever be called, since it is exported
with no caller anywhere in `src/` and a manuscript image outlives both its removal from the text and
its document's deletion while the Story Bible side cleans up on all three paths, traced in
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
Nothing new was added to this list on 2026-11-20, which is the fifteenth date running that nothing
was: the only things the firing learned were that the container image it is provisioned from had
held rather than moved and that the image's pack must be read before unshallowing, neither of which
changes a test or needs a decision.

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
without notice — it was 0 on 2026-11-13, 1 on 2026-11-14, 2 on 2026-11-15, 3 on 2026-11-16, 4 on
2026-11-17, 0 on both 2026-11-18 and 2026-11-19 when the image moved each time, and 1 again on
2026-11-20 when it held, read with `git rev-list --count main..origin/main` after a fetch, per
`FINDINGS/2026-11-15-image-held.md` and `FINDINGS/2026-11-19-image-moved-after-one-firing.md`;
predicting when the image next moves is ruled out with it, now not merely for want of evidence but
because the four dates 2026-11-08, 2026-11-13, 2026-11-18 and 2026-11-19 are intervals of five,
five and one day, no schedule fits them, and 2026-11-20 then held; and expecting a firing's own
writes inside `.git` to reach the next one stays ruled out, every entry in all three files under
`.git/logs` on every date from 2026-11-08 to 2026-11-20 having come from either the image's build or
that firing's own provisioning. Also ruled out is reading six objects per commit as the top-up rule:
it is the closure of the commits pushed since the image was taken, and a commit's share is whatever
that commit touched, which is four for a commit that writes no findings file and none at all at a
gap of 0, demonstrated in `FINDINGS/2026-11-17-image-fifth-firing.md` and consistent with the six
objects read on 2026-11-20 for one commit that wrote a findings file, a log entry and this file.

## What's next

A cloud shift firing next has no row to take: it should confirm from `TEST-WORKBOOK.md` that 2A, 2B,
3A, 4A, 6B and 7A's review half are still the only cloud-capable rows and still done, append a skip
entry naming 1B, commit, push and stop, rather than improvise a row — that is the sixty-sixth such
firing, and the sixty-five before it are in `TEST-LOG.md` under 2026-09-17 through 2026-11-20. The
eleventh notification falls due on 2026-11-24 under the weekly condition the 2026-09-23 entry set,
and it carries the routine question alone; a firing on any other date sends nothing unless something
changes in the repository from outside the routine, and a findings file, a confirmation or a reading
of its own container that the firing takes itself is its own output and does not meet that
condition, which is the reasoning 2026-11-06 through 2026-11-20 all recorded. On arrival it should
run `git rev-parse --abbrev-ref HEAD` and `git status --short` before anything else and expect a
clean tree, but it should read the arrival shape rather than assume one: two shapes recur and one
mechanism explains both, now tested at gaps of 0, 1, 2, 3 and 4 — provisioning tops the working tree
up to the remote tip and leaves the branch refs at the image's commit, so `HEAD` arrives detached at
the tip with `main` stale when the image is behind, as on 2026-11-08 through 2026-11-12 at `57dcd3f`,
on 2026-11-14 through 2026-11-17 at `4245f99` and on 2026-11-20 at `a2f1d46`, and attached with a
gap of 0, zero loose objects and two lines in `.git/logs/HEAD` when the image is already current, as
on 2026-11-13, 2026-11-18 and 2026-11-19. The sequence `git fetch origin main`, `git checkout main`,
`git merge --ff-only origin/main` is correct under both and was a rescue on 2026-11-20 where it had
been a no-op on 2026-11-18 and 2026-11-19, the fetch first being what makes the checkout's revert to
the image's commit harmless; the gap is read with `git rev-list --count main..origin/main` after the
fetch rather than predicted; and whether the image has moved is read from the pack's name, byte
count and date together and read before unshallowing, since the unshallow writes a pack of its own —
on 2026-11-20 `pack-523af819…` at 793,799 bytes — and the current image's signature is
`pack-d8aeb08a…` at 20,576,948 bytes dated 2026-11-19 02:08:22, unchanged for two firings, with the
caution that a pack dated within a minute of the firing cannot by itself tell a rebuild from a fresh
clone, per `FINDINGS/2026-11-19-image-moved-after-one-firing.md`. It should still expect the cloud
section's `git pull --rebase origin main` to refuse while its own writes are unstaged, the working
order being add, commit, rebase, push, as the 2026-11-11 through 2026-11-20 log entries all record,
and before any comparison to a commit older than fifty back, `da85a6b` and `3e416c5` included, it
should run `git rev-parse --is-shallow-repository` and, if true, `git fetch --unshallow origin main`,
which touches nothing on the remote and was needed again on 2026-11-20. On the development machine
the queue is 1B first, then 3B, 4B, 5A, 5B, 6A, 7B and 7A's flake half, and row 4B's brief is
unchanged — PDF under Electron with the same assertions via outline entries, compile index written
last, and the font-resolution check made able to fail, for which 2026-09-16 is the demonstration,
having reported `Times New Roman` as resolved on a machine where `fc-match` returns
`LiberationSerif-Regular.ttf` — while any cloud shift that does get a row should follow
`TEST-ROUTINE.md`'s five pre-flight steps, of which `git checkout package-lock.json` after install
and `node -e "require('electron')"` were both needed again on 2026-09-16, and `npm run build`, which
takes about a second, is what unlocks `search`, `rank` and `lexicon`; it will find `xvfb-run` at
`/usr/bin/xvfb-run`, Node v22.23.5 on the fourth image, and `node_modules/`, `out/` and
`test-results/` all absent, as on 2026-11-20.
