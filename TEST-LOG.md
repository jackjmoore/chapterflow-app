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
