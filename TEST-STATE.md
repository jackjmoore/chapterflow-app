# Test suite — current state

Rewritten in full at the end of every shift. Keep the six headings below, in this order,
even when a section is empty. Every statement carries a number, a filename or a date.
Four sentences per section, six for What's in progress. Anything needing more technical
detail than two sentences goes in a `FINDINGS/` file and gets one plain sentence here
pointing at it.

Last updated: 2026-09-13 at the close of cloud shift 3A.

## Where it stands

Twenty-four suites now, the new one being `generator`: 76 assertions over the fixture
generator's determinism, its planted word counts and entity placements, and the file shapes it
writes. It runs on a cloud runner in 0.7 seconds, Electron-hosted with no window and no timing
assertion, and was checked five times against deliberate breakage rather than trusted for being
green. The last full run is still the baseline of 2026-09-10, 17 of 21 suites, recorded in
`FINDINGS/2026-09-10-baseline-run.md`.

## What happened last shift

Cloud shift 3A wrote `scripts/make-fixture-project.mjs` and `tests/generator.test.ts`, and
registered the suite in `scripts/run-tests.mjs` and `test:build`; all 76 assertions pass. Small
is 6 documents and 1,370 words, Realistic 58 documents and 123,274 words with exactly 120,000 of
them in Draft across 48 chapters, written in 0.2 seconds. Nine other suites were run beside it to
confirm the runner change disturbed nothing — export, compile, book, filesystem, binder,
compilestore, structure, scrivmeta, scrivrtf, 393 assertions, all passing. One behaviour was
confirmed directly and recorded rather than asserted: `mentionStore` reads a document as
`parse(html).textContent` while `searchIndex` turns each tag into a space, so a name in the first
words after a heading is searchable but undetectable as a mention. Detail, including the five
mutation checks and the test defect they exposed, is in `FINDINGS/2026-09-13-fixture-generator.md`.

## What's in progress

Shift 1B is still next and still local: rerun polish and searchui to sort timing from
regression, two concurrent `--no-prepare` runs to prove the dynamic port fix, correct the
structure suite's stale header, delete the mangled-path folder in the repo root, and record a
second bookrender duration against the 420 seconds of 2026-09-10. Cloud rows 2A, 2B and 3A were
done on 2026-09-11, 2026-09-12 and 2026-09-13 in its place, because 1B cannot run without a
display and a quiet machine, so it has now been deferred three times. The timing case against
the baseline has not moved: `structure` took 0.3 seconds on the cloud runner against 10.1 on the
development machine on 2026-09-10, and `compilestore` 0.4 against 17.0, for the third shift
running. Row 3B is the next row in order but is local; 4A is the next cloud-capable row.

## What's waiting on Jack

Whether `mentionStore` should extract a document's text the way `searchIndex` does, since the
difference makes a character named just after a chapter heading invisible to detection —
demonstrated in `FINDINGS/2026-09-13-fixture-generator.md`, and it would move detection counts in
every existing project. Whether `duplicateNode` and `deleteNode` should write the binder on the
other side of the document content they copy or remove, so a crash leaves discoverable orphan
files rather than documents that open empty — traced in `FINDINGS/2026-09-12-binder-part-two.md`.
Whether the fifteen stores without the `loadFailed` guard should refuse to write when their file
cannot be read, listed store by store in `FINDINGS/2026-09-11-filesystem-part-one.md`. Whether
the eight polish failures of 2026-09-10 should be fixed if 1B confirms them, which is a renderer
change and needs visual confirmation, and whether the freshness assertion should skip when no
installed app exists.

## What's been ruled out

Windows Task Scheduler and headless `claude -p` as the scheduling mechanism, replaced by
Claude Code Routines. Pixel-diff comparison for compile output and any page-count or layout
assertion outside Times New Roman on the development machine, since that is the one unbundled
font. Committing the Scrivener corpus, which is git-ignored apart from its README, and storing
generated fixture projects, which the generator replaces. The
`FINDINGS/2026-09-09-headless-viability.md` file earlier entries cite was never written and is
not being reconstructed.

## What's next

Shift 3B on the development machine: the byte-identical self-test is already done for both
shapes, so what remains of that row is opening Realistic in the built app over CDP with no
migration or repair, and re-running day 2's suites against it at scale. Shift 1B is still
outstanding and still local. Row 4A is the next cloud-capable row: compile structure in Node for
TXT, Markdown and DOCX, which the truth file's per-document word counts give a word-parity
target for. A cloud shift should still run `git checkout package-lock.json` before committing —
`npm install` dropped `libc` from thirty entries again on 2026-09-13 — but the Electron binary
downloaded cleanly that day, so the `node node_modules/electron/install.js` fallback is worth
checking for rather than assuming.
