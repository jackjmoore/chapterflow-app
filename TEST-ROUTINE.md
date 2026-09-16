# ChapterFlow — the test routine

The definition of the scheduled cloud shift: what it runs on, what it runs, what it may and may
not do, and the prompt it fires. Drafted by row 7A on 2026-09-16 from six cloud shifts of
evidence. Scheduling it is billed and is Jack's, so this file defines the routine and does not
start it.

`TEST-SHIFT.md` still governs what a shift does once it is awake. This file is about the
machine, the schedule and the prompt, and it repeats nothing the brief already says.

## What it is

One Claude Code Routine, firing into a fresh cloud session, running one shift and stopping.
Not two shifts, not a queue, not a watcher. The session ends with a commit on `main` and the
next firing starts from a clean checkout knowing nothing except what is in the repository.

Everything that has to survive from one firing to the next is written down: `TEST-STATE.md` for
position, `TEST-LOG.md` for history, `FINDINGS/` for anything longer than two sentences. There
is no memory directory on a cloud runner and nothing may depend on one.

## Schedule

One firing a day is the shape the evidence supports. Six cloud shifts have each taken well under
the three hours a shift is allotted, and the binding constraint is not time but rows: as of
2026-09-16 there is no cloud-capable row left in the week-one workbook, so a second daily firing
would have nothing to take.

A firing that finds no cloud-capable row must stop rather than improvise. `TEST-SHIFT.md`
already says so — append a skip entry naming the local row that blocks it, commit, push, stop —
and that is the behaviour to keep. A routine that quietly invents work when the workbook is
exhausted is worse than one that stops.

Suggested: 06:00 UTC daily, which lands before the working day on the development machine, so a
red result is waiting rather than arriving mid-session. Weekly planning stays manual; the
routine does not write a workbook.

## The runner

| Requirement | Why |
|---|---|
| Linux, no display, `xvfb-run -a` present | Electron-hosted suites need a framebuffer |
| `ELECTRON_DISABLE_SANDBOX=1` | Electron will not start as root without it |
| GTK, NSS, ALSA and libgbm | Electron's shared-library dependencies |
| Network egress to GitHub and npmjs during install | `npm install` and the Electron binary download |
| `npm install --legacy-peer-deps` | The dependency tree does not resolve without it |
| Writable checkout of `main`, push rights | The close commit goes to `main` |

Timings on the runner of 2026-09-16, for sizing rather than as thresholds: `npm run build` took
1.0 seconds, `npm run test:build` 0.6, and all twenty-six suites 4 minutes 19 seconds end to end.
`npm install` was not timed. Nothing here is asserted anywhere and none of it should become a
threshold.

## Pre-flight, in this order

1. `npm install --legacy-peer-deps`.
2. `git checkout package-lock.json`. Every cloud shift since 2026-09-11 has had `npm install`
   drop `libc` from the same thirty optional-dependency entries; 2026-09-16 was the sixth. The
   churn is the runner's platform, not a dependency change, and it is never committed.
3. `node -e "require('electron')"`. `node_modules/electron` has arrived without a `dist/` on
   2026-09-14, 2026-09-15 and 2026-09-16, and this check repairs it by downloading the binary.
   On 2026-09-11 and 2026-09-12 the download failed outright with a 502 and needed
   `node node_modules/electron/install.js` run again.
4. `npm run build`. Not optional. It takes about a second, it is what `freshness` checks, and
   without it the five `needsBuild` suites cannot run — which is why four cloud shifts skipped
   `search`, `rank` and `lexicon` entirely.
5. `npm run test:build`, then every run with `--no-prepare`.

## Suites by machine

From the run of 2026-09-16, recorded per suite in `FINDINGS/2026-09-16-week-one-review.md`.

**Cloud, Node-hosted.** `export`, `compile`, `book`, `scrivmeta`, `scrivrtf`, and through
`tests/electronForNode.ts`, `compilestruct` and `references`. Nothing here opens a window or
reads a font. Total 366 assertions in about 2.3 seconds.

**Cloud, Electron-hosted, no window.** `filesystem`, `binder`, `generator`, `compilestore`,
`structure`, `bookrender`, `pdf`, `pageview`, `revision`, `editorfeatures`, and with the build,
`search` and `rank`. Total 486 assertions in about 10 seconds.

**Cloud, with a known failure.** `freshness` passes once `npm run build` has run; the claim that
it cannot pass in the cloud was wrong and has been corrected in `TEST-SHIFT.md`. `lexicon` fails
one spellcheck assertion in a fresh profile, on both machines, and a shift does not spend time on
it.

**Cloud, runs but not trusted.** `searchui`, `polish`, `dashboard`. All three drive the built app
over CDP on roughly 140 fixed sleeps. All three passed on 2026-09-16 and `TESTING-PLAN.md` puts
layer 4 under local-only because flake on a shared runner presents as regression. A routine may
run them; a routine may not report their failures as regressions without a local rerun. This
stands until the flake half of row 7A has run two full suites back to back on a quiet machine.

**Local only.** `pagination` and `live`. Each asserts a page count or a layout measurement, both
fail on a machine that substitutes Liberation Serif for Times New Roman, and neither failure is
about the app. Excluding them from a cloud run is a suite-selection decision, not a change to
the assertions; the assertions themselves are Jack's to keep or drop, with the font constraint in
`TESTING-PLAN.md`.

A cloud invocation that wants only the trustworthy set names it explicitly rather than running
everything and explaining the reds afterwards:

```
node scripts/run-tests.mjs --no-prepare --results-dir test-results/<date>-shift-<id> \
  freshness export compile compilestruct references book \
  filesystem binder generator compilestore bookrender structure pdf \
  pageview revision editorfeatures search rank scrivmeta scrivrtf
```

That is twenty suites and 858 assertions, every one of which passed on 2026-09-16, in about
12 seconds of suite time on that runner. It leaves out `lexicon`, `pagination` and `live`, which
between them hold the four assertions that did not pass.

## What a firing may change

It may write tests, fixtures and generator scripts. It may fix a store-level bug in `src/main`
with a failing test written first. It may not change anything in `src/renderer`, because a
renderer change needs visual confirmation against the running app and a cloud shift cannot give
one — `CLAUDE.md` is explicit and six shifts have held to it. It may not relax, retune or delete
an assertion to make a run green. It may not commit the Scrivener corpus, generated fixture
projects, `test-results/`, or a `package-lock.json` the runner rewrote.

## The prompt

Stored on the Routine, fired into a fresh session in the ChapterFlow environment:

> You are running one ChapterFlow test shift, unattended, in the cloud.
>
> Read TEST-SHIFT.md at the repository root first and follow it literally, including its
> "Running in the cloud" section, which overrides anything in it that assumes a local machine.
> Then read TEST-STATE.md and do the shift it points at, or the substitute row the cloud section
> tells you to take.
>
> Do one shift only. Before stopping, always, in this order: append the shift-close entry to
> TEST-LOG.md, rewrite TEST-STATE.md in full, commit, and push to main. A half-done row is
> recorded as half done.
>
> If TEST-SHIFT.md does not exist in the checkout, the repository has not been pushed yet: write
> nothing, and end with a one-line report saying so.

Short on purpose. Everything else the shift needs is in the repository, which means it can be
changed by a commit rather than by editing a stored prompt nobody reads. The prompt names the
close order explicitly because that is the one part a shift that runs out of time must still do.

## What Jack sees

A notification when a firing finds something he would want to know: a red suite that is not one
of the known failures, a bug found, a question that blocks the next row, or a shift that could
not run at all. Silence otherwise. A firing that took a substitute row and found nothing new has
nothing to say that the log entry does not already record, and saying it anyway trains the
notification to be ignored.

## Before it is scheduled

Three things are worth settling first, none of them blocking:

1. The flake half of row 7A. Two full runs back to back on a quiet machine is what decides
   whether `searchui`, `polish` and `dashboard` belong on the cloud list or off it. Until then
   the routine runs them and discounts their failures, which is the weaker position.
2. Row 1B. Three results from 2026-09-16 point at the development machine rather than at the
   code — `polish` 114 of 114 here against 106 of 114, `searchui` 96 of 96 against 93 of 96, and
   `bookrender` 4.0 seconds against 420.3 — and a routine reporting against a baseline that may
   have been measured on a busy machine will keep producing differences that mean nothing.
3. What happens when the workbook runs out. Week one is exhausted of cloud rows as of
   2026-09-16. Either week two is planned before the routine starts, or its first firing writes
   a skip entry and stops, which is correct behaviour and still a wasted firing.
