# Two loose-object counts at the same gap: 20 on 2026-11-23 against 22 on 2026-11-17

2026-11-23, cloud runner. Follow-up to `FINDINGS/2026-11-22-object-share-predicted.md` and
through it to `FINDINGS/2026-11-17-image-fifth-firing.md`, which first set out the share rule, and
to `FINDINGS/2026-11-14-provisioning-top-up.md` for the mechanism. Nothing here needs a decision
and nothing here changes what a test asserts. It is written rather than left as a log paragraph
because it is the first pair of readings taken at the same gap with different counts, which
separates the share rule from the gap by observation rather than by arithmetic alone.

## What was read

| Thing | Reading |
|---|---|
| pack name before unshallowing | `pack-d8aeb08a…` |
| pack bytes | 20,576,948 |
| pack date | 2026-11-19 02:08:22 |
| `refs/heads/main` on arrival | `a2f1d46` |
| `HEAD` on arrival | detached, `9d4e624` |
| `git status --short` | empty |
| gap after fetching | 4 |
| loose objects at provisioning | 20 |

The pack name, byte count and second are identical to the readings of 2026-11-19, 2026-11-20,
2026-11-21 and 2026-11-22, so this is the fourth image held for a fifth firing rather than a
re-snapshot that landed on the same second. All twenty loose objects carry the mtime
1795399695, which is 2026-11-23 02:08:15, this firing's own provisioning.

## The twenty objects

`git rev-list --objects a2f1d46..9d4e624` lists twenty object ids and a `diff` against the loose
object names matches exactly, with nothing on either side: 4 commits, 6 trees and 10 blobs, the
closure of the four commits pushed since the image was taken. Each object belongs to exactly one
commit:

| Commit | Objects it adds | Count |
|---|---|---|
| `6883ee6` | commit `6883ee6`, root `df69197`, `FINDINGS` `ff98605`, blob `9500aef` for `FINDINGS/2026-11-19-image-moved-after-one-firing.md`, `TEST-LOG.md` `3a23008`, `TEST-STATE.md` `6d02c67` | 6 |
| `df8b20c` | commit `df8b20c`, root `27e52f8`, `TEST-LOG.md` `d888fdf`, `TEST-STATE.md` `9f812bc` | 4 |
| `d51903c` | commit `d51903c`, root `1111a5d`, `TEST-LOG.md` `d198268`, `TEST-STATE.md` `6be7341` | 4 |
| `9d4e624` | commit `9d4e624`, root `87b0caa`, `FINDINGS` `44534f0`, blob `7b7104c` for `FINDINGS/2026-11-22-object-share-predicted.md`, `TEST-LOG.md` `d030850`, `TEST-STATE.md` `e9136cf` | 6 |

Six plus four plus four plus six is twenty. There are two `FINDINGS` trees in the range and not
one: `6883ee6` writes `ff98605`, `df8b20c` and `d51903c` both reuse it unchanged because neither
adds a findings file, and `9d4e624` writes `44534f0` when it adds the second. That is the same
reuse `FINDINGS/2026-11-22-object-share-predicted.md` recorded, seen twice in one range.

The count of 20 was read from `.git/objects` before the gap was known, so this is an accounting of
a reading rather than a prediction made ahead of it. The prediction made ahead of the count stands
at one, on 2026-11-22.

## Same gap, two counts

| Date | Gap | Commits with a findings file | Commits without | Objects |
|---|---|---|---|---|
| 2026-11-17 | 4 | 3 | 1 | 22 |
| 2026-11-23 | 4 | 2 | 2 | 20 |

Both readings are at a gap of four and the counts differ by two, which is the one findings file
that the 2026-11-17 range held and this one did not. Before this pair the share rule was supported
by arithmetic within single readings: six per commit predicted 24 against 22 on 2026-11-17 and 18
against 14 on 2026-11-22, so the gap was already known not to give the count. This pair shows it
directly, since the gap is held fixed and the count still moves. The count follows the paths the
commits in the range touched and the gap alone does not determine it.

## What this does not establish

It says nothing about when the image next moves. The fourth image has now served 2026-11-19
through 2026-11-23, five firings, which matches the 2026-11-08 image at five and the 2026-11-13
image at five while the 2026-11-18 image served one; four known image dates at intervals of five,
five and one day still fit no schedule, and predicting the next rebuild stays ruled out per
`FINDINGS/2026-11-19-image-moved-after-one-firing.md`.

It also says nothing about the gap itself, which stays unpredictable and is read with
`git rev-list --count main..origin/main` after a fetch. The gap has been 0, 1, 2, 3 and 4 on
various dates; what this file adds is that two ranges of the same length can cost different
numbers of objects, so a later firing should take the gap, list each commit's paths, and apply the
share rule, rather than carry a count forward from a date with the same gap.

The three files under `.git/logs` were as `FINDINGS/2026-11-17-image-fifth-firing.md` describes:
`.git/logs/HEAD` held three lines, the first two stamped 1795054102 for 2026-11-19 02:08:22, the
image's own build, and the third stamped 1795399695 for this firing's provisioning, recording the
move from `a2f1d46` to `9d4e624` with an empty reason field; `.git/logs/refs/heads/main` and
`.git/logs/refs/remotes/origin/main` each held one line, both stamped 1795054102. Nothing any
earlier firing wrote inside `.git` survived into this one.
