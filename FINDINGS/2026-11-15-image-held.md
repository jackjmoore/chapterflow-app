# The 2026-11-13 image held for a third firing; the falsification test passed in full

2026-11-15, cloud runner. Follow-up to `FINDINGS/2026-11-14-provisioning-top-up.md`, which it
confirms rather than corrects, and through it to `FINDINGS/2026-11-13-snapshot-replaced.md`,
`FINDINGS/2026-11-12-commit-gap-rule.md` and `FINDINGS/2026-11-10-frozen-git-snapshot.md`. Nothing
here needs a decision and nothing here changes what a test asserts; it is the first date on which
a prediction this routine made about its own container was checked and held.

## The three things that were named, and what arrived

`FINDINGS/2026-11-14-provisioning-top-up.md` said that if the image were still the 2026-11-13
clone on 2026-11-15, three things should be true. All three were.

| Named on 2026-11-14 | Arrived on 2026-11-15 |
|---|---|
| `.git` holds `pack-4235e996…` dated 2026-11-13 | `pack-4235e996…`, 20,557,875 bytes, dated 2026-11-13 02:08:25 |
| `refs/heads/main` arrives at `4245f99` | `4245f99`, with `refs/remotes/origin/main` the same |
| provisioning's loose objects are the closure of the commits pushed since | 12 loose objects at 2026-11-15 02:08:45, the closure of `e4d58ec` and `eaad6a7` |

The byte count and the reflog second are identical to 2026-11-14's reading, not merely the same
date, so this is the same image rather than a re-snapshot that happened to land on 2026-11-13.
Both reflogs inside `.git` again held exactly one bootstrap event, `fetch --no-progress --depth 50
origin main: storing head` and `branch: Created from refs/remotes/origin/main`, both at
1794535705, which is 2026-11-13 02:08:25.

## The arrival table, extended

| Thing | 2026-11-12 | 2026-11-13 | 2026-11-14 | 2026-11-15 |
|---|---|---|---|---|
| `git rev-parse --abbrev-ref HEAD` | `HEAD` (detached) | `main` | `HEAD` (detached) | `HEAD` (detached) |
| `HEAD` commit | `57dcd3f`, the then tip | `4245f99`, the tip | `e4d58ec`, the tip | `eaad6a7`, the tip |
| local branch `main` | `57dcd3f` | `4245f99` | `4245f99` | `4245f99` |
| `git rev-list --count main..origin/main` after fetching | 5 | 0 | 1 | 2 |
| `git status --short` | empty | empty | empty | empty |
| pre-existing pack | `pack-7be55801…`, 2026-11-08 | `pack-4235e996…`, 2026-11-13 | `pack-4235e996…`, 2026-11-13 | `pack-4235e996…`, 2026-11-13 |
| loose objects written at provisioning | not recorded | none | 6 | 12 |

The gap of 2 is the two commits pushed since the image was taken, `e4d58ec` of 2026-11-13 and
`eaad6a7` of 2026-11-14. It is read, not predicted; predicting it stays ruled out for the reason
`FINDINGS/2026-11-12-commit-gap-rule.md` gave, and the fact that 2 happens to be one more than
yesterday's 1 is a consequence of one firing having pushed once in between, not a rule.

## The twelve objects

Six per commit, each being one commit, two trees and three blobs for the three files that commit
touched — `TEST-LOG.md`, `TEST-STATE.md` and that firing's one findings file:

| Object | Type | From |
|---|---|---|
| `e4d58ec` | commit | the 2026-11-13 close |
| `68ef86f`, `4ffc10a` | trees | root, `FINDINGS/` |
| `47a2da4`, `aeeb6a9`, `c710bce` | blobs | the three files `e4d58ec` touched |
| `eaad6a7` | commit | the 2026-11-14 close |
| `67c97b1`, `5d122d3` | trees | root, `FINDINGS/` |
| `353015a`, `803fcc5`, `0125300` | blobs | the three files `eaad6a7` touched |

No other object arrived: the history was shallow at depth 50 again and `git fetch --unshallow
origin main` was needed before `da85a6b` would resolve, per
`FINDINGS/2026-11-08-shallow-clone-history.md`. After unshallowing the history is 94 commits from
the root, `da85a6b` 60 back and `3e416c5` 79.

## Consequence

None beyond confidence. The arrival sequence in `TEST-STATE.md` is unchanged and was a rescue
again, `main` being `4245f99` while the tree was at `eaad6a7`:

```
git fetch origin main
git checkout main
git merge --ff-only origin/main
```

A later firing that wants to know whether the image has moved should read the pack's name, byte
count and date together, since the date alone cannot separate a held image from a re-snapshot on
the same day; 20,557,875 bytes and `pack-4235e996…` are the current image's signature.

## What this does not say

How often the image is re-snapshotted. One image lasted 2026-11-08 to 2026-11-12 and this one has
lasted 2026-11-13 to 2026-11-15, which is two intervals of at least five and at least three days,
not a period. Whether a firing's own `.git` writes ever carry forward is still untouched and still
answered no on every date from 2026-11-08 to 2026-11-15.
