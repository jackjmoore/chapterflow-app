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
