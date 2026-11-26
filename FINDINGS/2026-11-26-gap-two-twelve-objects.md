# A second reading at a gap of two: twelve loose objects, not ten

2026-11-26, cloud firing, seventy-first running to take no row. Read only; no install, no
build, no suite run. Follows `FINDINGS/2026-11-17-image-fifth-firing.md`, which states the
share rule, `FINDINGS/2026-11-22-object-share-predicted.md`, which predicted from it ahead of
the count, and `FINDINGS/2026-11-23-same-gap-different-count.md`, which showed at a gap of 4
that the gap alone does not fix the count.

## What was read

Counted at arrival, before the gap was read and before any fetch.

| Reading | Value |
|---|---|
| `HEAD` | `afc4df7`, detached |
| `main`, `origin/main` | both `31b7095` |
| `git status --short` | empty |
| Loose objects under `.git/objects` | 12 |
| Lines in `.git/logs/HEAD` | 3 |
| Packs | 1 |
| Pack name and size | `pack-2f686ef4fec618d231ab41ca128b5a7b52b964d6`, 20,592,486 bytes |
| Pack date | 2026-11-24 02:08:57 |
| `git rev-list --count main..origin/main`, after the fetch | 2 |

The pack's name, byte count and date are the fifth image's signature unchanged, so the image
held for a third firing. Its date is two days old, which under
`FINDINGS/2026-11-25-pack-predates-firing.md` is a build time and needs no further check.

## The two commits and their twelve objects

The gap holds `deedd80`, the 2026-11-24 close, and `afc4df7`, the 2026-11-25 close. Each
added one file under `FINDINGS/` and modified `TEST-LOG.md` and `TEST-STATE.md`, so each
contributes six objects by the share rule: the commit, the root tree, the `FINDINGS/` tree,
and three blobs.

| Object | `deedd80` | `afc4df7` |
|---|---|---|
| commit | `deedd808` | `afc4df72` |
| root tree | `4150051d` | `55c4c9c5` |
| `FINDINGS/` tree | `20faeeca` | `87b70f3f` |
| findings blob | `cd414ee3` | `392f4b7f` |
| `TEST-LOG.md` blob | `d919debc` | `d1e813d4` |
| `TEST-STATE.md` blob | `abf86064` | `cf4ef0e3` |

The twelve names above are exactly the twelve loose object names on disk, with no overlap
between the two sets and nothing left over. That is the fourth verification of the share rule
by name rather than by total.

## What this adds

The gap of 2 has now been read twice and the counts differ: 10 on 2026-11-21, where one commit
wrote a findings file and the other did not, and 12 today, where both did. This extends
`FINDINGS/2026-11-23-same-gap-different-count.md` from a gap of 4 to a gap of 2, so two of the
five gaps seen so far are known not to fix a count.

It also records a case where the share rule and the discarded six-per-commit rule agree. Two
commits of identical shape, each writing a findings file, give 12 under either, where
2026-11-21's mixed pair gave 10 against six-per-commit's 12. A reading whose commits are all
the same shape therefore cannot separate the two rules, and one that was taken as confirmation
of either on its own would be weak evidence. On the readings so far the separating cases are
2026-11-21, 2026-11-22 and 2026-11-23; today's is a confirmation of the share rule and no more.

## What it does not change

No test, no assertion and no decision. The repository's own state is unchanged since `da85a6b`
of 2026-09-16 under `src` and `tests`, and `TEST-WORKBOOK.md` is unchanged over the same range,
both confirmed by empty `git diff --stat` after `git fetch --unshallow origin main`. Nothing
here is a question for Jack.
