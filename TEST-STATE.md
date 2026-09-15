# Test suite — current state

Rewritten in full at the end of every shift. Keep the six headings below, in this order,
even when a section is empty. Every statement carries a number, a filename or a date.
Four sentences per section, six for What's in progress. Anything needing more technical
detail than two sentences goes in a `FINDINGS/` file and gets one plain sentence here
pointing at it.

Last updated: 2026-09-15 at the close of cloud shift 6B.

## Where it stands

Twenty-six suites now, the new one being `references`: 102 assertions over the three deletes that
leave other records pointing at nothing — a Story Bible item taking its sheet, images and
mentions, a document taking its comments, mentions and submission links, and timeline pruning
dropping dead references and nothing else. It runs on a cloud runner in 0.1 seconds, Node-hosted
through the `electronForNode.ts` shim, and it is the first suite to read `src/main/index.ts` as
source so a cascade losing a limb in the handler shows up as a failure. The last full run is
still the baseline of 2026-09-10, 17 of 21 suites, recorded in
`FINDINGS/2026-09-10-baseline-run.md`.

## What happened last shift

Cloud shift 6B wrote `tests/references.test.ts` and registered it in `scripts/run-tests.mjs` and
`test:build`; all 102 assertions pass, and the mutation checks, per-section table and neighbour
run are in `FINDINGS/2026-09-15-reference-rot.md`. One bug was found with a failing assertion and
then fixed, because it was store-level in `src/main` with no renderer side: a deleted item's sheet
text stayed searchable for the rest of the session, since the search index is fed by an observer
on `atomicWrite` that never sees a delete and only `documentStore` compensated — the fix is
`searchIndex.onSheetDeleted`, three lines mirroring `onDocumentDeleted`, called from
`storyBibleSheetStore.deleteSheet`. The suite was checked against six deliberate breakages,
failing 1, 3, 1, 7, 1 and 2 assertions, with no defect in the test itself coming out of them for
the second shift running. Fourteen neighbouring suites were run beside it — 655 assertions, one
failure, 757 with the new suite — and the one failure is the known `lexicon` spellcheck assertion
in a fresh profile.

## What's in progress

Shift 1B is still next and still local: rerun polish and searchui to sort timing from
regression, two concurrent `--no-prepare` runs to prove the dynamic port fix, correct the
structure suite's stale header, delete the mangled-path folder in the repo root, and record a
second bookrender duration against the 420 seconds of 2026-09-10. Cloud rows 2A, 2B, 3A, 4A and
6B were done on 2026-09-11, 2026-09-12, 2026-09-13, 2026-09-14 and 2026-09-15 in its place,
because 1B cannot run without a display and a quiet machine, so it has now been deferred five
times. The timing case against the baseline has not moved: `structure` took 0.4 seconds on the
cloud runner against 10.1 on the development machine on 2026-09-10, and `compilestore` 0.4
against 17.0, for the fifth shift running. Row 3B is the next row in order but is local, and
there is now no cloud-capable row left undone in this workbook apart from the review half of 7A,
so the next cloud shift takes that or stops and says so.

## What's waiting on Jack

Whether `documentImageStore.deleteImage` should ever be called, since it is exported with no
caller anywhere in `src/` and a manuscript image outlives both its removal from the text and its
document's deletion, while the Story Bible side cleans up on all three paths — traced in
`FINDINGS/2026-09-15-reference-rot.md`. Whether front matter should sit before or after the table
of contents in compiled plain text and Markdown, since PDF and docx put it before and those two
put it after, traced in `FINDINGS/2026-09-14-compile-structure.md`, and whether `mentionStore`
should extract a document's text the way `searchIndex` does, since the difference makes a
character named just after a chapter heading invisible to detection, demonstrated in
`FINDINGS/2026-09-13-fixture-generator.md`. Whether `duplicateNode` and `deleteNode` should write
the binder on the other side of the document content they copy or remove, traced in
`FINDINGS/2026-09-12-binder-part-two.md` and compounded by 6B's finding that `binder:delete`
cascades into comments and mentions after the binder is already written, and whether the fifteen
stores without the `loadFailed` guard should refuse to write when their file cannot be read,
listed store by store in `FINDINGS/2026-09-11-filesystem-part-one.md`. Whether the eight polish
failures of 2026-09-10 should be fixed if 1B confirms them, which is a renderer change and needs
visual confirmation, and whether the freshness assertion should skip when no installed app exists.

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
both still outstanding and both still local, and 6A, 5A, 5B and 7B are local too, so a cloud
shift arriving next should take the review half of 7A — the weekly review and the routine
definition, listing `references` and `compilestruct` among the Node-hosted cloud-capable suites —
and otherwise follow `TEST-SHIFT.md`'s rule of logging a skip naming the local row that blocks it.
Row 6A gets the most from 6B: a restore has to put back exactly the cascades `references` now
pins, and its byte-identity comparisons are the shape to reuse. A cloud shift should still run
`git checkout package-lock.json` before committing — `npm install` dropped `libc` from the same
thirty entries for the fifth time on 2026-09-15 — should still run `node -e "require('electron')"`
after installing, which on 2026-09-15 again both detected a missing `dist/` and repaired it, and
should now also run `npm run build`, which takes under a second on a cloud runner and is what
unlocks the `search`, `rank` and `lexicon` suites that four earlier cloud shifts skipped.
