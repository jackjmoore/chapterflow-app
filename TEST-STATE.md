# Test suite — current state

Rewritten in full at the end of every shift. Keep the six headings below, in this order,
even when a section is empty. Every statement carries a number, a filename or a date.
Four sentences per section, six for What's in progress. Anything needing more technical
detail than two sentences goes in a `FINDINGS/` file and gets one plain sentence here
pointing at it.

Last updated: 2026-09-12 at the close of cloud shift 2B.

## Where it stands

Twenty-three suites now, the new one being `binder`: 68 assertions on the delete cascade,
duplicate, sixty seeded moves, bulk insert and four legacy binder shapes. It runs on a cloud
runner in 0.4 seconds, Electron-hosted with no window and no timing assertion, and was checked
three times against deliberate breakage rather than trusted for being green. The last full run
is still the baseline of 2026-09-10, 17 of 21 suites, recorded in
`FINDINGS/2026-09-10-baseline-run.md`.

## What happened last shift

Cloud shift 2B wrote `tests/binder.test.ts` and registered it in `scripts/run-tests.mjs` and
`test:build`; all 68 assertions pass. Eight other suites were run beside it to confirm the
runner change disturbed nothing — export, compile, book, filesystem, compilestore, structure,
scrivmeta, scrivrtf, 325 assertions, all passing. One behaviour was traced through the source
and recorded rather than asserted: `duplicateNode` writes the binder before the content it
copies, and `deleteNode` deletes content before writing the binder, both against the ordering
rule `insertSubtree`'s own comment states. Detail, including the three mutation checks and the
two test defects they exposed, is in `FINDINGS/2026-09-12-binder-part-two.md`.

## What's in progress

Shift 1B is still next and still local: rerun polish and searchui to sort timing from
regression, two concurrent `--no-prepare` runs to prove the dynamic port fix, correct the
structure suite's stale header, delete the mangled-path folder in the repo root, and record a
second bookrender duration against the 420 seconds of 2026-09-10. Cloud rows 2A and 2B were
done on 2026-09-11 and 2026-09-12 in its place, because 1B cannot run without a display and a
quiet machine, so it has now been deferred twice. Two more numbers bear on it directly:
`structure` took 0.4 seconds on the cloud runner against 10.1 on the development machine on
2026-09-10, and `compilestore` 0.4 against 17.0, so the baseline's timing-sensitive failures
are more suspect again. Day 2 is done; 3A is the next cloud-capable row.

## What's waiting on Jack

Whether `duplicateNode` and `deleteNode` should write the binder on the other side of the
document content they copy or remove, so a crash leaves discoverable orphan files rather than
documents that open empty — traced in `FINDINGS/2026-09-12-binder-part-two.md`. Whether the
fifteen stores without the `loadFailed` guard should refuse to write when their file cannot be
read, listed store by store in `FINDINGS/2026-09-11-filesystem-part-one.md`. Whether the eight
polish failures of 2026-09-10 should be fixed if 1B confirms them, which is a renderer change
and needs visual confirmation, and whether the freshness assertion should skip when no
installed app exists. The deferred `.tmp-*` sweep also covers orphans left by a live rename
failure, not only by a crash.

## What's been ruled out

Windows Task Scheduler and headless `claude -p` as the scheduling mechanism, replaced by
Claude Code Routines. Pixel-diff comparison for compile output and any page-count or layout
assertion outside Times New Roman on the development machine, since that is the one unbundled
font. Committing the Scrivener corpus, which is git-ignored apart from its README. The
`FINDINGS/2026-09-09-headless-viability.md` file earlier entries cite was never written and is
not being reconstructed.

## What's next

Shift 1B as above, on the development machine. Row 3A is the next cloud-capable row: a
deterministic generator for Small and Realistic, fixed seed all the way down, no fresh UUIDs,
planted per-document word counts and named entity placements. The `binder` suite's fixtures are
built through the store rather than by hand, so 3A's generator does not block re-running day 2
at scale, and the seed for its sixty moves is 20260912, in the suite. A cloud shift should
expect both problems of 2026-09-11 to recur: run `node node_modules/electron/install.js` when
`node -e "require('electron')"` fails after install, and `git checkout package-lock.json`
before committing.
