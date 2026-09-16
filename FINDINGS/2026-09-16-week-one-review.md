# Week one review, 2026-09-16, shift 7A (review half)

The week of 2026-09-10 read end to end, and one full run of all twenty-six suites on a cloud
runner set against the baseline of 2026-09-10. Raw records are in
`test-results/2026-09-16-shift-7A/`, which is git-ignored, so this file is the durable copy.
The baseline column repeats `FINDINGS/2026-09-10-baseline-run.md` and is a Windows development
machine; the cloud column is a Linux runner under `xvfb-run -a` with
`ELECTRON_DISABLE_SANDBOX=1`. The two machines are not comparable for time, and nothing here
treats them as though they were.

Twenty-three of twenty-six suites passed, 1,197 assertions of 1,201. Wall clock from the first
suite to the last was 4 minutes 19 seconds, against just under eighteen minutes for twenty-one
suites on 2026-09-10.

## The run, beside the baseline

| Suite | Host | 09-16 status | 09-16 passed | 09-16 s | 09-10 status | 09-10 passed | 09-10 s |
|---|---|---|---|---|---|---|---|
| freshness | node | passed | 6 / 6 | 0.3 | failed | 7 / 8 | 1.1 |
| export | node | passed | 37 / 37 | 0.1 | passed | 37 / 37 | 0.4 |
| compile | node | passed | 31 / 31 | 0.0 | passed | 31 / 31 | 0.1 |
| compilestruct | node | passed | 66 / 66 | 1.9 | — | — | — |
| references | node | passed | 102 / 102 | 0.1 | — | — | — |
| book | node | passed | 37 / 37 | 0.0 | passed | 37 / 37 | 0.1 |
| filesystem | electron | passed | 24 / 24 | 0.9 | — | — | — |
| binder | electron | passed | 68 / 68 | 0.4 | — | — | — |
| generator | electron | passed | 76 / 76 | 0.7 | — | — | — |
| compilestore | electron | passed | 44 / 44 | 0.4 | passed | 44 / 44 | 17.0 |
| bookrender | electron | passed | 35 / 35 | 4.0 | passed | 35 / 35 | 420.3 |
| structure | electron | passed | 59 / 59 | 0.3 | passed | 59 / 59 | 10.1 |
| pdf | electron | passed | 11 / 11 | 0.6 | passed | 11 / 11 | 32.8 |
| pagination | electron | failed | 68 / 69 | 0.4 | passed | 69 / 69 | 15.9 |
| pageview | electron | passed | 15 / 15 | 0.4 | passed | 15 / 15 | 16.4 |
| revision | electron | passed | 18 / 18 | 0.4 | passed | 18 / 18 | 16.4 |
| editorfeatures | electron | passed | 23 / 23 | 0.4 | passed | 23 / 23 | 16.1 |
| lexicon | electron | failed | 6 / 7 | 4.2 | failed | 6 / 7 | 21.1 |
| search | electron | passed | 41 / 41 | 0.6 | passed | 41 / 41 | 11.8 |
| rank | electron | passed | 72 / 72 | 0.5 | passed | 72 / 72 | 12.2 |
| searchui | node, drives app | passed | 96 / 96 | 44.3 | failed | 93 / 96 | 63.0 |
| polish | node, drives app | passed | 114 / 114 | 49.6 | failed | 106 / 114 | 186.8 |
| dashboard | node, drives app | passed | 38 / 38 | 59.8 | passed | 38 / 38 | 120.9 |
| scrivmeta | node | passed | 26 / 26 | 0.0 | passed | 26 / 26 | 0.2 |
| scrivrtf | node | passed | 67 / 67 | 0.2 | passed | 67 / 67 | 0.4 |
| live | node, drives app | failed | 17 / 19 | 52.7 | passed | 19 / 19 | 73.6 |

The assertion total reconciles against the baseline without a gap. The five suites written this
week carry 336 assertions — filesystem 24, binder 68, generator 76, compilestruct 66,
references 102 — and `freshness` asserts two fewer here than on 2026-09-10 for the reason below.
867 + 336 − 2 is 1,201.

## What the week produced

Five suites, all cloud-written, all green on the machine that wrote them and green again today:
`filesystem` on 2026-09-11, `binder` on 2026-09-12, `generator` on 2026-09-13, `compilestruct`
on 2026-09-14 and `references` on 2026-09-15. Assertions went from 867 to 1,201, a rise of 39%.
Layers 1 and 2 of `TESTING-PLAN.md` are now covered by something written on purpose rather than
inherited; layer 3 is covered for TXT, Markdown and DOCX and not for PDF; layers 4 and 5 are
where they were on 2026-09-10.

One bug was found and fixed: a deleted Story Bible item's sheet text stayed searchable, fixed in
`searchIndex.onSheetDeleted` on 2026-09-15. Four questions were found, traced and left for Jack,
listed in `TEST-STATE.md`. Every suite written this week was checked against deliberate
breakage — six mutations for `references`, five each for `generator` and `compilestruct`, three
for `binder`, two for `filesystem` — twenty-one in all, and each one failed at least one
assertion. Six defects in the tests came out of writing them and were fixed before the recorded
run; none came out of the mutation runs in the last two shifts.

Six of the fourteen planned rows ran: 1A, 2A, 2B, 3A, 4A and 6B, plus the review half of 7A
today. Rows 1B, 3B, 4B, 5A, 5B, 6A, 7B and the flake half of 7A are outstanding, and
`TEST-SHIFT.md` marks every one of them local. Shift 1B has now been deferred six
times, which is the single largest fact about the week: the substitute rule kept the cloud
shifts productive, and the cost is that every row needing a display or a quiet machine is
untouched.

## The three suites that did not pass

**pagination, one assertion, cloud-only and caused by the font.** The failure reads
`word-processor "Double" lands within 15% of the 375-word reference (got 432, natural line
height 17.00px)`. `fc-match "Times New Roman"` on this runner returns
`LiberationSerif-Regular.ttf`, and the arithmetic in the suite reproduces both figures exactly.
The A4 text column is 930.52px tall at 25.4mm margins, Chromium fits 16 `word`s per line at this
measure, and the count is the number of whole lines times 16:

| Line height | Whole lines | Words | Distance from 375 |
|---|---|---|---|
| 32.0px — CSS `line-height:2` | 29 | 464 | +23.7% |
| 34.0px — 2 × 17.00px measured here | 27 | 432 | +15.2% |
| 36.8px — 2 × 13.8pt, Times New Roman's own spacing as the suite's comment gives it | 25 | 400 | +6.7% |

The pinned `timesDouble === 464` assertion passes on both machines because Liberation Serif is
metric-compatible with Times New Roman on advance widths, so a reading that doubles the font
size is unaffected. The failing reading doubles the font's own line spacing, which is not
metric-compatible, and 15.2% clears a 15% band by 0.2 points. This is the font constraint in
`TESTING-PLAN.md` arriving as a red suite: no test may assert a page count or a layout
measurement off the development machine, and this assertion is one. The Windows figure of
36.8px is taken from the suite's own comment rather than measured, so the 400 row is computed,
not observed.

**live, two assertions, the same cause.** `the mid-document edit settles to more pages (2 → 2)`
and `content still fits the sheets after reformatting (overflow 25px)`. Both are page counts and
overflow measurements on a substituted font: the shorter line box fits the same text in fewer
sheets, so an edit that pushes a Windows document onto a third page does not push this one. Both
passed on 2026-09-10 and neither is an app change; nothing in `src/` between the two runs touches
pagination.

**lexicon, one assertion, on both machines.** `suppression in the editor, not in the OS: an
unknown word is flagged normally (got "")`, character for character what 2026-09-10 recorded.
Fourth consecutive failure with the same text, now on two different operating systems, which
makes the fresh-profile spellcheck dictionary the likelier cause rather than anything about
either machine. Still unverified.

## freshness passes on a cloud runner, and `TEST-SHIFT.md` says it cannot

`TEST-SHIFT.md`'s cloud section says freshness always fails on a cloud runner because there is no
installed app, and tells a shift never to spend time on it. It passed here, 6 assertions in 0.3
seconds. The suite already does what the rule assumes it does not: `packagedAsarPaths()` filters
its two candidates by `existsSync`, and when none survives the packaged-builds section writes the
note `none found on this machine — nothing to check` and asserts nothing. The assertion that
failed on 2026-09-10 is the AppData one, which is a stale installed copy from 2026-08-20 and is
about the development machine only.

What can fail freshness in the cloud is the other section: `out/` newer than `src/`. The four
cloud shifts before 2026-09-15 never ran `npm run build`, so `out/` was absent and the suite
failed for that reason rather than the recorded one. The rule has been corrected in
`TEST-SHIFT.md` in its own commit. This also answers one of the questions in "What's waiting on
Jack" — whether the freshness assertion should skip when no installed app exists — without
needing him: it already does.

## The eight polish failures of 2026-09-10 did not reproduce

`polish` passed 114 of 114 here against 106 of 114 on 2026-09-10, and the eight that failed were
the open question shift 1B exists to answer. All eight areas are green: the hover card's
dismissal section passes its fourteen assertions including `moving straight from the name to
elsewhere dismisses it` and `and the sweep leaves nothing stuck open`, the fade section passes
including `the card is still mounted the instant the cursor leaves (fading out, not gone)`, and
the Lexicon alphabet strip passes `so the strip marks it as where you are (W)`.

The renderer under test is the baseline's renderer. `git diff --stat 3e416c5..HEAD -- src/`
returns two files, `src/main/searchIndex.ts` and `src/main/storyBibleSheetStore.ts`, 18 lines
added and none removed, both main-process and both from 2026-09-15. Nothing in `src/renderer`
changed all week.

That does not prove the development machine passes, and this result should not be read as
closing the question. It is one run, on Linux, under Xvfb, on a machine where `polish` takes 49.6
seconds against 186.8. What it does establish is that the hover card code is not unconditionally
broken, so the two commits before the baseline are no longer the leading explanation, and timing
on a machine running the suite 3.8 times slower is. The same holds for `searchui`, whose three
baseline failures — `history survives a reload (spindrift)`, `and the drop-down is no longer over
the page`, and `this group collapses the same way the others do` — all pass here by their exact
labels.

## Durations

Every Electron-hosted suite on the development machine sat between 10.1 and 32.8 seconds on
2026-09-10 regardless of how much work it did, while the same suites take 0.3 to 0.9 seconds
here. `structure` does the same work in 0.3 seconds that took 10.1, and `compilestore` in 0.4
that took 17.0. A fixed per-suite cost on the order of ten to sixteen seconds on the development
machine would account for the whole cluster, and Electron startup under a Windows on-access
scanner is the obvious candidate, but this is inferred from the shape of the numbers rather than
measured and a local shift should confirm it before anyone acts on it.

`bookrender` is the exception and remains the thing worth watching: 420.3 seconds on 2026-09-10
against 4.0 here. Against its neighbour `structure` it is 41 times the cost on the development
machine and 13 times here, so the suite is genuinely the heaviest in both places and the
development-machine figure is disproportionate beyond that. The baseline said a second run far
below 420 would make every timing-sensitive failure in it suspect. This is not that second run —
it is a different machine, and the comparison the baseline asked for is still a local one — but
it points the same way as the `polish` and `searchui` results above, and row 1B is where all
three get settled.

## Cloud capability, suite by suite

Evidence from this run and the five cloud shifts before it. "Runs" means the suite completed and
passed here; it does not mean a second run would.

| Suite | Cloud | Why |
|---|---|---|
| freshness | yes, after `npm run build` | Packaged section skips itself when no installed copy exists |
| export, compile, book, scrivmeta, scrivrtf | yes | Node-hosted, no display, no timing, no font |
| compilestruct, references | yes | Node-hosted through `tests/electronForNode.ts` |
| filesystem, binder, generator, compilestore, structure | yes | Electron with no window, no timing assertion |
| search, rank | yes, needs the build | First run in the cloud was 2026-09-15 |
| bookrender, pdf, pageview, revision, editorfeatures | yes | Passed here; none asserts a page count |
| lexicon | runs, one known failure | Needs the build; the spellcheck assertion fails in a fresh profile on both machines |
| searchui, polish, dashboard | runs, not yet trusted | Drive the built app over CDP on about 140 fixed sleeps; passed here once, which is not a flake measurement |
| pagination | no | One assertion is a layout measurement and fails on a substituted font |
| live | no | Two assertions are page counts and fail on a substituted font |

The three CDP suites are the interesting row. `TESTING-PLAN.md` puts layer 4 under "local only"
on the grounds that shared cloud runners are neither quiet nor fast and flake there would present
as regression. This runner was fast — 44.3, 49.6 and 59.8 seconds against 63.0, 186.8 and 120.9 —
and all three passed. One run is not evidence of stability, and the flake half of row 7A, which
is the two back-to-back runs, is local and has not happened. Until it does, the honest position
is that these three can be run in the cloud and their failures cannot be trusted, which is the
weaker of the two claims and the one this run supports.

## What this leaves for a local shift

Row 1B now has three questions rather than one, and answers to all three are cheap: rerun
`polish`, `searchui` and `bookrender` on a quiet development machine and see whether the eight
failures, the three failures and the 420 seconds survive. If they do not, the baseline's caveat
applies and the failures of 2026-09-10 were the machine. If they do, the cloud results above
narrow the cause to something the development machine has and this runner does not.

Nothing here needs a fix. No assertion was added, removed or changed by this shift, and the two
suites that fail on a substituted font were left exactly as they are: changing an assertion
because it fails on a machine it was never written for would be tuning it away, and the decision
about whether `pagination` and `live` should hold layout numbers at all belongs with Jack and
with the font constraint that produced it.
