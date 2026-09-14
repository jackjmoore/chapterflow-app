# Test suite — current state

Rewritten in full at the end of every shift. Keep the six headings below, in this order,
even when a section is empty. Every statement carries a number, a filename or a date.
Four sentences per section, six for What's in progress. Anything needing more technical
detail than two sentences goes in a `FINDINGS/` file and gets one plain sentence here
pointing at it.

Last updated: 2026-09-14 at the close of cloud shift 4A.

## Where it stands

Twenty-five suites now, the new one being `compilestruct`: 66 assertions over compile structure
in txt, Markdown and docx — one section per node in scope, word parity against the generator's
truth file, the last paragraph present, an empty document keeping its section, and matter order.
It runs on a cloud runner in 2.5 seconds, and it is the first suite to exercise `src/main` from
a plain Node host, through the `electron` shim described in
`FINDINGS/2026-09-14-compile-structure.md`. The last full run is still the baseline of
2026-09-10, 17 of 21 suites, recorded in `FINDINGS/2026-09-10-baseline-run.md`.

## What happened last shift

Cloud shift 4A wrote `tests/compileStructure.test.ts` and `tests/electronForNode.ts`, and
registered the suite in `scripts/run-tests.mjs` and `test:build`; all 66 assertions pass against
the generator's Realistic shape. Word parity is exact where it can be — 120,000 recorded body
words against 120,000 planted, and 28,554 against 28,554 for a one-part scope — with 2% allowed
for the artifacts, whose scaffolding costs +402, +451 and +150 words. One compile bug was found
and recorded rather than fixed: front matter is emitted before the Contents in PDF and docx and
after it in txt and Markdown, traced in `FINDINGS/2026-09-14-compile-structure.md`. Ten
neighbouring suites were run beside it — export, compile, book, filesystem, binder, generator,
compilestore, structure, scrivmeta, scrivrtf — 469 assertions, all passing, 535 with the new
suite. The suite was checked against five deliberate breakages, failing 6, 1, 11, 1 and 3
assertions, and no defect in the test itself came out of them, the first time in four shifts.

## What's in progress

Shift 1B is still next and still local: rerun polish and searchui to sort timing from
regression, two concurrent `--no-prepare` runs to prove the dynamic port fix, correct the
structure suite's stale header, delete the mangled-path folder in the repo root, and record a
second bookrender duration against the 420 seconds of 2026-09-10. Cloud rows 2A, 2B, 3A and 4A
were done on 2026-09-11, 2026-09-12, 2026-09-13 and 2026-09-14 in its place, because 1B cannot
run without a display and a quiet machine, so it has now been deferred four times. The timing
case against the baseline has not moved: `structure` took 0.4 seconds on the cloud runner
against 10.1 on the development machine on 2026-09-10, and `compilestore` 0.5 against 17.0, for
the fourth shift running. Row 3B is the next row in order but is local; 6B is now the earliest
cloud-capable row not yet done, since 4B needs Electron with a window and 5A and 5B need a quiet
machine.

## What's waiting on Jack

Whether front matter should sit before or after the table of contents in compiled plain text and
Markdown, since PDF and docx put it before and those two put it after — the disagreement is
pinned in the suite as it stands today and traced in
`FINDINGS/2026-09-14-compile-structure.md`. Whether `mentionStore` should extract a document's
text the way `searchIndex` does, since the difference makes a character named just after a
chapter heading invisible to detection, demonstrated in
`FINDINGS/2026-09-13-fixture-generator.md`. Whether `duplicateNode` and `deleteNode` should
write the binder on the other side of the document content they copy or remove, traced in
`FINDINGS/2026-09-12-binder-part-two.md`, and whether the fifteen stores without the
`loadFailed` guard should refuse to write when their file cannot be read, listed store by store
in `FINDINGS/2026-09-11-filesystem-part-one.md`. Whether the eight polish failures of
2026-09-10 should be fixed if 1B confirms them, which is a renderer change and needs visual
confirmation, and whether the freshness assertion should skip when no installed app exists.

## What's been ruled out

Windows Task Scheduler and headless `claude -p` as the scheduling mechanism, replaced by
Claude Code Routines. Pixel-diff comparison for compile output and any page-count or layout
assertion outside Times New Roman on the development machine, since that is the one unbundled
font. Committing the Scrivener corpus, which is git-ignored apart from its README, and storing
generated fixture projects, which the generator replaces. The
`FINDINGS/2026-09-09-headless-viability.md` file earlier entries cite was never written and is
not being reconstructed.

## What's next

Shift 4B on the development machine: PDF under Electron with the same assertions via outline
entries, compile index written last, and the font-resolution check made able to fail. Row 4A's
section-count, scope, last-paragraph and matter-order sections are format-agnostic and 4B needs
only a different reader for them; the front-matter ordering question is already settled for PDF,
which puts matter first, so 4B should assert that rather than re-open it. Shifts 1B and 3B are
both still outstanding and both still local. Row 6B is the next cloud-capable row: reference rot
at store level, and `tests/electronForNode.ts` plus the aliased `esbuild` step in `test:build`
are there to reuse for any `src/main` module that does not reach an `app` call at load time. A
cloud shift should still run `git checkout package-lock.json` before committing — `npm install`
dropped `libc` from the same thirty entries for the fourth time on 2026-09-14 — and should still
run `node -e "require('electron')"` after installing, which on 2026-09-14 both detected a
missing `dist/` and repaired it.
