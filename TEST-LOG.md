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
