# Test suite — current state

Rewritten in full at the end of every shift. Keep the six headings below, in this order,
even when a section is empty. Every statement carries a number, a filename or a date.
Four sentences per section, six for What's in progress. Anything needing more technical
detail than two sentences goes in a `FINDINGS/` file and gets one plain sentence here
pointing at it.

Last updated: 2026-09-11 at the close of cloud shift 2A.

## Where it stands

Twenty-two suites now, the new one being `filesystem`: 24 assertions on `atomicWrite` ordering,
the write observer, and the `loadFailed` guard in `binderStore` and `storyBibleStore`. It runs
on a cloud runner in 0.4 seconds, Electron-hosted with no window and no timing assertion, and
was checked twice against deliberate breakage rather than trusted for being green. The last
full run is still the baseline of 2026-09-10, 17 of 21 suites, recorded in
`FINDINGS/2026-09-10-baseline-run.md`.

## What happened last shift

Cloud shift 2A wrote `tests/filesystem.test.ts` and registered it in `scripts/run-tests.mjs`
and `test:build`; all 24 assertions pass. Five other suites were run beside it to confirm the
runner change disturbed nothing — export, compile, book, scrivmeta, scrivrtf, compilestore, 242
assertions, all passing. Two behaviours were recorded rather than asserted: fifteen project
stores have no unreadable-file guard, and a write whose rename fails leaves its temp file
behind. Detail, including the mutation checks and three cloud-runner notes, is in
`FINDINGS/2026-09-11-filesystem-part-one.md`.

## What's in progress

Shift 1B is still next and still local: rerun polish and searchui to sort timing from
regression, two concurrent `--no-prepare` runs to prove the dynamic port fix, correct the
structure suite's stale header, delete the mangled-path folder in the repo root, and record a
second bookrender duration against the 420 seconds of 2026-09-10. Cloud row 2A was done on
2026-09-11 in its place, because 1B cannot run without a display and a quiet machine. One
number from this shift bears on 1B directly: compilestore took 0.5 seconds on the cloud runner
against 17.0 on the development machine on 2026-09-10, so the baseline's timing-sensitive
failures are more suspect than they were. Day 2 is now half done; 2B is the next cloud-capable
row.

## What's waiting on Jack

Whether the fifteen stores without the `loadFailed` guard should refuse to write when their
file cannot be read, as `binderStore` and `storyBibleStore` do — a behaviour decision, listed
store by store in `FINDINGS/2026-09-11-filesystem-part-one.md`. Whether the eight polish
failures of 2026-09-10 should be fixed if 1B confirms them, which is a renderer change and
needs visual confirmation. Whether the freshness assertion should skip when no installed app
exists, as it does on a cloud runner. The deferred `.tmp-*` sweep now also covers orphans left
by a live rename failure, not only by a crash.

## What's been ruled out

Windows Task Scheduler and headless `claude -p` as the scheduling mechanism, replaced by
Claude Code Routines. Pixel-diff comparison for compile output and any page-count or layout
assertion outside Times New Roman on the development machine, since that is the one unbundled
font. Committing the Scrivener corpus, which is git-ignored apart from its README. The
`FINDINGS/2026-09-09-headless-viability.md` file earlier entries cite was never written and is
not being reconstructed.

## What's next

Shift 1B as above, on the development machine. Row 2B is the next cloud-capable row: delete
cascade, duplicate ids, random valid moves, bulk insert, and four legacy binder shapes. Day 3
replaces the demo generator's fresh UUIDs with a fully seeded fixture so days 4 and 5 have
known word counts to assert against. A cloud shift should verify `node -e "require('electron')"`
after install and check `package-lock.json` for churn before committing, both for the reasons
in `FINDINGS/2026-09-11-filesystem-part-one.md`.
