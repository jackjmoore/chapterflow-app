# Baseline run, 2026-09-10, shift 1A

The first complete run of every suite through `scripts/run-tests.mjs`, against commit
`3e416c5` (the working tree as it stood on 2026-09-10, committed that morning). Run with
`--no-prepare` after one build and one bundle. Machine state during the run is unknown; nothing
else was deliberately running. Raw records are in `test-results/2026-09-10-shift-1A/`, which
is git-ignored, so this file is the durable copy.

Seventeen of twenty-one suites passed, 867 assertions in total. Wall clock from first suite
to last was just under eighteen minutes.

| Suite | Host | Status | Passed / total | Seconds |
|---|---|---|---|---|
| freshness | node | failed | 7 / 8 | 1.1 |
| export | node | passed | 37 / 37 | 0.4 |
| compile | node | passed | 31 / 31 | 0.1 |
| book | node | passed | 37 / 37 | 0.1 |
| compilestore | electron | passed | 44 / 44 | 17.0 |
| bookrender | electron | passed | 35 / 35 | 420.3 |
| structure | electron | passed | 59 / 59 | 10.1 |
| pdf | electron | passed | 11 / 11 | 32.8 |
| pagination | electron | passed | 69 / 69 | 15.9 |
| pageview | electron | passed | 15 / 15 | 16.4 |
| revision | electron | passed | 18 / 18 | 16.4 |
| editorfeatures | electron | passed | 23 / 23 | 16.1 |
| lexicon | electron | failed | 6 / 7 | 21.1 |
| search | electron | passed | 41 / 41 | 11.8 |
| rank | electron | passed | 72 / 72 | 12.2 |
| searchui | node, drives app | failed | 93 / 96 | 63.0 |
| polish | node, drives app | failed | 106 / 114 | 186.8 |
| dashboard | node, drives app | passed | 38 / 38 | 120.9 |
| scrivmeta | node | passed | 26 / 26 | 0.2 |
| scrivrtf | node | passed | 67 / 67 | 0.4 |
| live | node, drives app | passed | 19 / 19 | 73.6 |

## The four failures

**freshness.** The one assertion that fails checks that the installed app in AppData matches
source. The installed copy is from 2026-08-20 and lacks page-stack, chf-page-margin,
setPageBreaks and binder-minimap. Not a regression. Reinstalling clears it; a cloud runner
has no installed copy and this assertion needs a skip or a different meaning there.

**lexicon.** "suppression in the editor, not in the OS: an unknown word is flagged normally
(got "")". Third consecutive failure on this machine with the same text (2026-09-09 twice,
today once), so it is deterministic here rather than timing. The assertion depends on the OS
spellchecker flagging a nonsense word inside a fresh user-data directory, which suggests the
spellcheck dictionary is absent or not yet downloaded in that profile. Unverified.

**searchui.** Three failures: search history surviving a reload, the match drop-down no longer
overlapping the page, and the current-document group collapsing. The 2026-09-09 note has this
suite passing once and failing twice with no code change, so these are presumed timing until a
second run today says otherwise.

**polish.** Eight failures, all in the Story Bible hover card (four on dismissal when the cursor
leaves, three on fade in and out under reduced motion) plus one on the Lexicon alphabet strip
marking the current letter. The two most recent commits before the baseline changed exactly the
hover card's fade and its stuck-open behaviour, so these may be real rather than timing. Not
seen on 2026-09-09, which makes them the one genuinely new result of this run.

## Durations worth watching

bookrender took 420 seconds, more than a third of the whole run, against 17 seconds for
compilestore on the same host. There is no earlier number to compare against. If a second run
lands near that figure it is the suite's cost; if it lands far below, the machine was busy
during this run and every timing-sensitive failure above is suspect.
