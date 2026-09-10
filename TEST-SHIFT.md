# ChapterFlow — shift brief

The one document a test shift reads first. It says what to read, in what order, what to do
with it, and what to write before stopping. Everything a shift needs that is not in the code
is either here or in a file this brief names. It changes rarely; when it changes, the change
is committed on its own with a reason.

A shift is one three-hour session doing one phase of work. Two a day, A then B. The phase for
each shift is a row in `TEST-WORKBOOK.md`; which row is next is in `TEST-STATE.md`.

## Read at the start, in this order

1. **`TEST-STATE.md`**, in full. The only document that says where things stand and what this
   shift does. Take the shift id from "What's in progress" or "What's next". If the two
   disagree, "What's in progress" wins.
2. **`TEST-WORKBOOK.md`**, the row for this shift and the two paragraphs above the table. Do
   not re-plan the week; do the row.
3. **`FINDINGS/`**, only the files `TEST-STATE.md` names. Read each in full.
4. **`TEST-LOG.md`**, only the entry `TEST-STATE.md` points at, if it points at one. Never in
   full; it is append-only history and grows without bound.
5. **`TESTING-PLAN.md`**, only "What the suite is for", "Layers" and "How the suite grows",
   and only when deciding whether something earns a test. It is the stable layer and does not
   change week to week.
6. **`SPEC.md`, `DESIGN.md`, `SPEC-scrivener-import.md`**: only the section for a feature the
   shift's row touches. Not otherwise.

`CLAUDE.md` loads on its own. Do not read `TEST-LOG.md` end to end, and do not read old
`FINDINGS/` files that the state file does not name.

## Before any work

Append a shift-open entry to `TEST-LOG.md` under a heading of the form
`## <date> — shift <id> open`: two to four sentences on what the shift will do and what will
be in flight. Commit it alone, message `Test shift <id> open: <one line>`. A shift that dies
mid-way leaves this as evidence of what was running.

## During the shift

- Do the row. Slack goes to the plan's own rule: a data or compile bug found gets a failing
  test before anything else. Store-level fixes in `src/main` may follow with the test beside
  them. Renderer fixes are reported, not made; they need visual confirmation on the running
  app, which a shift cannot give.
- Run suites only through `scripts/run-tests.mjs`. Name the results directory
  `test-results/<date>-shift-<id>`; it is git-ignored, so any number worth keeping is copied
  into a `FINDINGS/` file before the shift closes.
- One build and one bundle per checkout, then `--no-prepare` for every further run. Two runs
  on one checkout must both use `--no-prepare`, or the rebuild pulls the floor out from under
  the running one.
- Strip `ELECTRON_RUN_AS_NODE` from the environment before anything that launches Electron
  by hand. The runner does this itself; nothing else does.
- Before touching `node_modules/` or `out/`, check nothing Electron-shaped is running.
- Never assert a page count or a layout measurement. The only unbundled font is Times New
  Roman in the manuscript preset, so structure is asserted and layout is recorded.
- Never put real manuscript content in a fixture, and never commit anything under
  `tools/scriv-import/corpus/` beyond its README. Both are already git-ignored; keep them so.
- Never delete or write inside a project folder the shift did not create. Fixtures and test
  projects go under a temporary directory or a `test-results/` path.
- Emptying Trash and backup restore are destructive by design. Tests of them run against
  fixtures only.
- Known non-regressions on the development machine, as of 2026-09-10: `freshness` fails
  because the installed app in AppData is stale; `lexicon` fails on one spellcheck assertion
  in a fresh profile; `searchui` fails intermittently on timing. A shift does not spend time
  on these unless its row says so. Anything else that fails is news.
- On Windows an uncaught exception at Electron startup opens a dialog and never exits. Only the
  runner's per-suite timeout rescues that, and the crash record's stderr will be empty.

## Which shifts can run where

Anything Node-only, or Electron without a visible window and without timing assertions, can
run on a cloud runner from a clean checkout. In the current workbook that is 2A, 2B, 3A, 4A,
6B and the review half of 7A. Shifts that drive the built app over CDP, measure anything, or
need a quiet machine run locally: 1B, 3B, 4B, 5A, 5B, 6A, 7B and the flake half of 7A. A cloud
runner needs `ELECTRON_DISABLE_SANDBOX`, the GTK, NSS, ALSA and libgbm libraries, network
egress to GitHub and npmjs during install, and `npm install --legacy-peer-deps`.

## Running in the cloud

A cloud shift runs from a clean checkout of `main` on a Linux runner with no display, no
installed app and no memory directory. These rules override anything above that assumes the
development machine.

- Install with `npm install --legacy-peer-deps`. Export `ELECTRON_DISABLE_SANDBOX=1`. Run
  Electron-hosted suites under `xvfb-run -a` when it is available; when it is not, say so in
  the findings file and run the Node-hosted suites only.
- `freshness` always fails on a cloud runner because there is no installed app. Never spend
  time on it.
- Shift selection: take the shift `TEST-STATE.md` names. If "Which shifts can run where" lists
  it as local, do not run it; take the earliest workbook row that is cloud-capable and not yet
  marked done. If there is none, append a log entry under `## <date> — cloud shift, skipped`
  naming the local shift that is blocking, commit, push, and stop.
- When a substitute row is run, "What's in progress" in the state file keeps naming the local
  shift, and gains one sentence saying which cloud row was done and when.
- Commits go to `main`. Before each commit, `git pull --rebase origin main`; after each commit,
  `git push origin HEAD:main`. That includes the shift-open commit, so a run that dies leaves
  its evidence on the remote. If a push is rejected twice, push to `test-shift/<id>`, open a
  pull request, and say so in the log entry. Never force-push.
- Step 6 of the close list does not apply. Anything a later shift needs goes in a findings
  file or the state file.
- One shift per run. Do not start the next row.

## Write at the end, in this order

1. **`FINDINGS/<date>-<topic>.md`** for any result that needs more than two sentences: a
   per-suite table, the text of a failure, a measurement, a mechanism traced through the code.
   One file per topic, never appended to later; a follow-up is a new file that names the old
   one. Plain and factual; numbers in tables or on their own line; hedged wording for anything
   computed or estimated.
2. **`TEST-LOG.md`**: append a shift-close entry under `## <date> — shift <id> close`.
   Written unconditionally, including when nothing was found. What was done, what did not
   pass, what was noticed on the way, each with a number, a filename or a date. Point at the
   findings file rather than repeating it. Never edit, reorder or summarise earlier entries.
3. **`TEST-STATE.md`**: rewrite in full, keeping its six headings in order and its sentence
   limits. Name the next shift id in "What's in progress". Anything the next shift must know
   goes here as a pointer; nothing is found by searching the log.
4. **`TEST-WORKBOOK.md`**: replace the row's "Work" cell with `Done <date>.` and a one-line
   result pointing at the findings file. Add a row only for slack work actually done. Do not
   edit rows for shifts not yet run.
5. Commit everything from steps 1 to 4 together, message `Test shift <id> close: <one line>`.
   Tests, fixtures and store fixes written during the shift go in the same commit unless they
   are large enough to want their own, in which case they are committed first.
6. Local shifts only: a fact about this machine or this project that the repo cannot record,
   and that a later shift would otherwise rediscover, goes in the assistant's memory
   directory with a one-line index entry. Nothing that the code, the log or a findings file
   already says.

The close entry, the state rewrite and the close commit are the three things a shift must
never skip, in that order, even if the shift ran out of time with its row half done. A
half-done row is recorded as half done.
