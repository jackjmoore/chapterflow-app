# Test suite — current state

Rewritten in full at the end of every shift. Keep the six headings below, in this order,
even when a section is empty. Every statement carries a number, a filename or a date.
Four sentences per section, six for What's in progress. Anything needing more technical
detail than two sentences goes in a `FINDINGS/` file and gets one plain sentence here
pointing at it.

Last updated: 2026-09-10 at the close of shift 1A.

## Where it stands

The working tree is committed as `3e416c5`, so for the first time a cloud routine would test
the same app that runs on this machine. The runner completes all twenty-one suites in just
under eighteen minutes and writes a record per suite; seventeen passed with 867 assertions in
total. The seven-day plan is in `TEST-WORKBOOK.md` and shift 1A is ticked. Fonts, Scrivener
and where recorded numbers live are settled, as noted at the top of the workbook.

## What happened last shift

Shift 1A committed the baseline, wrote the workbook, and ran every suite once. Four suites did
not pass: freshness and lexicon for the same reasons as on 2026-09-09, searchui on three
assertions of the intermittent kind, and polish on eight assertions in the Story Bible hover
card and Lexicon alphabet strip. Per-suite table and failure text are in
`FINDINGS/2026-09-10-baseline-run.md`.

## What's in progress

Shift 1B is next: fix only what stops the runner completing, which today is nothing, so the
shift goes to the rest of its list. Two concurrent `--no-prepare` runs to prove the dynamic
port fix. Rerun polish and searchui to sort timing from regression, since the hover card was
the subject of the two commits before the baseline. Correct the structure suite's header,
which still cites the deleted `run-electron-test.mjs`. Delete the mangled-path folder in the
repo root, which is an empty binder from 2026-08-20 and cannot be reproduced by current
suites. Record a second bookrender duration against the 420 seconds seen today.

## What's waiting on Jack

Nothing blocks the next shift. Whether to fix the eight polish failures if 1B confirms them
is a renderer change and needs visual confirmation, so it waits for Jack. Whether the
freshness assertion should skip when no installed app exists, as it will on a cloud runner.

## What's been ruled out

Windows Task Scheduler and headless `claude -p` as the scheduling mechanism, replaced by
Claude Code Routines. Pixel-diff comparison for compile output and any page-count or layout
assertion outside Times New Roman on this machine, since that is the one unbundled font.
Committing the Scrivener corpus, which is git-ignored apart from its README. The
`FINDINGS/2026-09-09-headless-viability.md` file earlier entries cite was never written and
is not being reconstructed.

## What's next

Shift 1B as above. Then day 2: filesystem integration for the data-loss and binder-corruption
invariants, starting with atomicWrite ordering and the unreadable-binder guard, none of which
has a test today. Day 3 replaces the demo generator's fresh UUIDs with a fully seeded fixture
so days 4 and 5 have known word counts to assert against.
