# A second reading at a gap of three: eighteen loose objects, not fourteen

2026-11-27, cloud firing, seventy-second running to take no row. Read only; no install, no
build, no suite run. Follows `FINDINGS/2026-11-17-image-fifth-firing.md`, which states the
share rule, `FINDINGS/2026-11-22-object-share-predicted.md`, which read a gap of 3 and counted
14, and `FINDINGS/2026-11-23-same-gap-different-count.md` and
`FINDINGS/2026-11-26-gap-two-twelve-objects.md`, which showed at gaps of 4 and 2 that the gap
alone does not fix the count.

## What was read

Counted at arrival, before the gap was read and before any fetch.

| Reading | Value |
|---|---|
| `HEAD` | `9ef99c7`, detached |
| `main`, `origin/main` | both `31b7095` |
| `git status --short` | empty |
| Loose objects under `.git/objects` | 18 |
| Lines in `.git/logs/HEAD` | 3 |
| Packs | 1 |
| Pack name and size | `pack-2f686ef4fec618d231ab41ca128b5a7b52b964d6`, 20,592,486 bytes |
| Pack date | 2026-11-24 02:08:57 |
| `git rev-list --count main..origin/main`, after the fetch | 3 |

The pack's name, byte count and date are the fifth image's signature unchanged, so the image
held for a fourth firing. Its date is three days old, which under
`FINDINGS/2026-11-25-pack-predates-firing.md` is a build time and needs no further check.

## The three commits and their eighteen objects

The gap holds `deedd80`, the 2026-11-24 close, `afc4df7`, the 2026-11-25 close, and `9ef99c7`,
the 2026-11-26 close. Each added one file under `FINDINGS/` and modified `TEST-LOG.md` and
`TEST-STATE.md`, so each contributes six objects by the share rule: the commit, the root tree,
the `FINDINGS/` tree, and three blobs.

| Object | `deedd80` | `afc4df7` | `9ef99c7` |
|---|---|---|---|
| commit | `deedd808` | `afc4df72` | `9ef99c74` |
| root tree | `4150051d` | `55c4c9c5` | `335ee8f1` |
| `FINDINGS/` tree | `20faeeca` | `87b70f3f` | `a6bb5bb7` |
| findings blob | `cd414ee3` | `392f4b7f` | `f510fef5` |
| `TEST-LOG.md` blob | `d919debc` | `d1e813d4` | `5451df1e` |
| `TEST-STATE.md` blob | `abf86064` | `cf4ef0e3` | `21af6faa` |

The eighteen names above are exactly the eighteen loose object names on disk, with no overlap
between the three sets and nothing left over, checked by sorting both lists and diffing them.
That is the fifth verification of the share rule by name rather than by total, and the first at
a gap of 3.

## What this adds

The gap of 3 has now been read twice and the counts differ: 14 on 2026-11-22, where the three
commits differed in shape, and 18 today, where all three wrote a findings file. This extends
the result of `FINDINGS/2026-11-23-same-gap-different-count.md` from gaps of 4 and 2 to a gap
of 3, so three of the five gaps seen so far are known not to fix a count. Of the remaining two,
a gap of 0 can only give zero, and a gap of 1 has been read once, at six on 2026-11-25.

It is also the second reading where the share rule and the discarded six-per-commit rule agree,
after 2026-11-26. Three commits of identical shape give 18 under either, where 2026-11-22's
mixed three gave 14 against six-per-commit's 18 — the same pattern as 2026-11-21 against
2026-11-26 one gap down. Two agreements and three separations have now been read, and the
separating cases remain 2026-11-21, 2026-11-22 and 2026-11-23. Today's reading confirms the
share rule and does not distinguish it.

Across the two agreement readings the agreement itself has a visible cause: a gap whose commits
are all the same shape, and whose shape is six objects, is exactly the case six-per-commit was
built from, so such a reading cannot test it. A reading that separates the two needs a gap
containing commits of at least two shapes, which is what 2026-11-21 through 2026-11-23 each
held. This is a statement about which readings carry information, not a new rule.

## What it does not change

No test, no assertion and no decision. The repository's own state is unchanged since `da85a6b`
of 2026-09-16 under `src` and `tests`, and `TEST-WORKBOOK.md` is unchanged over the same range,
both confirmed by empty `git diff --stat` after `git fetch --unshallow origin main`. Nothing
here is a question for Jack.
