# ChapterFlow — test workbook

Week-to-week work. Rewritten when a week is planned; ticked as shifts close. Strategy lives
in `TESTING-PLAN.md`, current position in `TEST-STATE.md`, history in `TEST-LOG.md`.

## Week of 2026-09-10 — seven days, two three-hour shifts a day

Ordering principle: cheap, deterministic, cloud-capable work first so a red day late in the
week does not stall the days after it. The one timing-dependent test goes last, once the
fixture and the runner it needs exist. The two days added over the original five go to
data-loss paths that were deferred only for want of a harness.

Decisions settled before the week began: the only unbundled font is Times New Roman in the
manuscript preset; the Scrivener importer ships on launch; recorded numbers live in the
runner's results JSON under `test-results/` plus one summary line per run in `TEST-LOG.md`.

| Day | Shift | Work | Needs Jack |
|---|---|---|---|
| 1 | A | Done 2026-09-10. Baseline `3e416c5`; 17 of 21 suites passed; see `FINDINGS/2026-09-10-baseline-run.md`. | No |
| 1 | B | Fix only what stops the runner completing. Two concurrent `--no-prepare` runs to prove the port fix. Correct the structure suite's stale header. Find what wrote the mangled-path folder in the repo root. | No |
| 2 | A | Done 2026-09-11, on a cloud runner in place of 1B. New `filesystem` suite, 24 assertions passing; fifteen stores have no guard, recorded in `FINDINGS/2026-09-11-filesystem-part-one.md`. | No |
| 2 | B | Done 2026-09-12, on a cloud runner in place of 1B. New `binder` suite, 68 assertions passing; duplicate and delete write the binder on the wrong side of the content, recorded in `FINDINGS/2026-09-12-binder-part-two.md`. | No |
| 3 | A | Done 2026-09-13, on a cloud runner in place of 1B. `scripts/make-fixture-project.mjs` writes Small and Realistic; new `generator` suite, 76 assertions passing; mention detection misses a name straight after a heading, recorded in `FINDINGS/2026-09-13-fixture-generator.md`. | No |
| 3 | B | Generator self-test: two runs byte-identical. Open Realistic in the built app over CDP and confirm no migration or repair fires. Re-run day 2 against it at scale. | Machine free of a dev build. |
| 4 | A | Done 2026-09-14, on a cloud runner in place of 1B. New `compilestruct` suite, 66 assertions passing, Node-hosted; front matter sits before the Contents in PDF and docx and after it in TXT and Markdown, recorded in `FINDINGS/2026-09-14-compile-structure.md`. | No |
| 4 | B | PDF under Electron with the same assertions via outline entries. Compile index written last. Make the font-resolution check able to fail. | No |
| 5 | A | Build the smoke: open Realistic, type in A, switch to B inside the debounce, type, quit inside the max-wait, relaunch, both intact, binder byte-identical. | No |
| 5 | B | Run it on a quiet machine. Forced-kill variant as recorded, not asserted. Flush time on Realistic against the 2.5 s quit timeout, recorded. | Quiet machine. |
| 6 | A | Backup restore under Electron with a temporary user-data directory: pre-restore backup precedes the wipe, a failure between wipe and copy leaves that backup complete, restoring a backup lacking a document leaves no orphan. | No |
| 6 | B | Reference rot at store level: Story Bible item delete takes sheet, images and mentions. Document delete clears comments, mentions and submission links. Timeline pruning drops links to deleted items and nothing else. | No |
| 7 | A | Wide ceiling shape in the generator. Full suite twice back to back for flake and duration. Weekly review in the log. Draft the routine definition, listing cloud-capable suites. | No |
| 7 | B | First ceiling measurement: open, full search, entity detection, compile wall clock, peak renderer heap on Wide, recorded with no threshold. Fallback if the machine is not quiet: provoke the Windows rename retry from a second process holding a lock. | Quiet machine, or the fallback runs. |

Slack in any shift goes to the plan's own rule: a data or compile bug found gets a failing
test before anything else. Store-level fixes in the main process may follow with the test
beside them; renderer fixes are reported and wait for visual confirmation.

## Deferred beyond this week

- Per-release compatibility fixtures. Unlocked by a release.
- Visual contact sheets. Unlocked by a reference set and a reviewer.
- Scheduling the routine. Day 7 produces the definition; launching is billed and Jack's.
- Forward compatibility: unknown top-level fields in `binder.json` are dropped on persist. A design decision before it is a test.
- Sweeping orphaned `.tmp-*` files on open. Needs a yes on the behaviour first.
- A `.scriv` fixture for the importer that is not a real manuscript. Now that the importer ships, this is the first item for week two.
