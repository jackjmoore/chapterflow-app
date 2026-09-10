# Test suite — current state

Rewritten in full at the end of every shift. Keep the six headings below, in this order,
even when a section is empty. Every statement carries a number, a filename or a date.
Four sentences per section, six for What's in progress. Anything needing more technical
detail than two sentences goes in a `FINDINGS/` file and gets one plain sentence here
pointing at it.

Last updated: 2026-09-09 by Jack, by hand. No shifts have run yet.

## Where it stands

The test suite work has just started, and no scheduled routine has run against the repo.
A blind spot pass on 2026-09-09 established what can and can't run in a cloud routine, and
its findings are written up in `FINDINGS/2026-09-09-headless-viability.md`. The main result
is that Electron does run in the cloud under a virtual display, so the limits are about
fonts, timing and system libraries rather than about displays. Nothing has been built yet
beyond that map.

## What happened last shift

No shift has run. This file was written by hand to establish the format.

## What's in progress

The test runner is being reworked so an unattended routine can use it, which is the first
piece of work and blocks everything else. The three problems being fixed are: suites chained
with `&&` so one failure stops the run, about ten rebuilds of the app inside a single `npm test`,
and four CDP suites binding fixed ports (9345, 9347, 9359, 9367) that collide if two runs
share a machine. No suite's assertions are changing, only how they are invoked and how results
come back. Awaiting the implementation plan.

## What's waiting on Jack

Whether to bundle the serif fonts with the app. The PDF and Book View stylesheets in
`toPdf.ts:75` and `bookPdf.ts:56` request Iowan Old Style, Palatino Linotype, Georgia and
Times New Roman, none of which are bundled, so page counts differ by machine and page layout
cannot be tested anywhere except Jack's own. The repo also has 84 modified files and about
16,000 changed lines uncommitted against a last commit dated 2026-08-22, and cloud routines
test the commit rather than the working tree, so nothing scheduled is meaningful until that
lands.

## What's been ruled out

Windows Task Scheduler and headless `claude -p` as the scheduling mechanism, replaced by
Claude Code Routines, which run on Anthropic's cloud and need no local machine. Pixel-diff
comparison for compile output, because page breaks depend on fonts that are not guaranteed
to exist. Asserting page counts or layout numbers in any cloud test, for the same reason.

## What's next

Finish the runner rework and confirm it with two suites running concurrently, one of them
failing. Then fix the font check in the hidden-window suite, which currently reads the
requested font family rather than the resolved one and therefore passes on a fallback.
Then begin the fixture corpus. The 1M-word ceiling fixture waits until the corpus is proven
at a smaller size.
