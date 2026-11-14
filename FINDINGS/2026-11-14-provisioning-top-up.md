# The snapshot was not replaced; provisioning tops the working tree up to the remote tip

2026-11-14, cloud runner. Follow-up to `FINDINGS/2026-11-13-snapshot-replaced.md`, which it
corrects, and to `FINDINGS/2026-11-10-frozen-git-snapshot.md` and
`FINDINGS/2026-11-12-commit-gap-rule.md`. A third arrival shape appeared, and all three now
appear to come from one mechanism rather than from the clone behaviour changing. Nothing here
needs a decision; the consequence is one sentence longer than the arrival sequence already in
`TEST-STATE.md`.

## What arrived

| Thing | 2026-11-12 | 2026-11-13 | 2026-11-14 |
|---|---|---|---|
| `git rev-parse --abbrev-ref HEAD` | `HEAD` (detached) | `main` | `HEAD` (detached) |
| `HEAD` commit | `57dcd3f`, the then tip | `4245f99`, the tip | `e4d58ec`, the tip |
| local branch `main` | `57dcd3f` | `4245f99` | `4245f99` |
| `origin/main` before fetching | `57dcd3f` | `4245f99` | `4245f99` |
| `git rev-list --count main..origin/main` after fetching | 5 | 0 | 1 |
| `git status --short` | empty | empty | empty |
| bootstrap fetch in `.git/logs/refs/remotes/origin/main` | 2026-11-08 02:08:30 | 2026-11-13 02:08:26 | 2026-11-13 02:08:25 |
| pre-existing pack | `pack-7be55801…`, 20,535,568 bytes, dated 2026-11-08 | `pack-4235e996…`, 20,557,875 bytes, dated 2026-11-13 | `pack-4235e996…`, 20,557,875 bytes, dated 2026-11-13 |

The pack and both reflogs inside `.git` are dated 2026-11-13, a day before this firing began.
So the `.git` restored into the container is not cloned at provisioning time, as
`FINDINGS/2026-11-13-snapshot-replaced.md` concluded. It is a fixed image again, exactly as
`FINDINGS/2026-11-10-frozen-git-snapshot.md` established over 2026-11-08 to 2026-11-12, with the
image re-snapshotted once in between: 2026-11-08 02:08:30 up to and including 2026-11-12,
2026-11-13 02:08:25 on 2026-11-13 and 2026-11-14.

The 2026-11-13 reflog line reads 1794535705 here and was recorded as 1794535706 and 1794535707 in
that file. The one- or two-second difference is not explained; either the image holds a clone made
a second or two before the one that firing read, or the seconds in that file are slightly off. It
does not bear on anything below.

## The mechanism

Provisioning brings the working tree to the current remote tip and leaves the branch refs alone.
On this firing it wrote six loose objects at 2026-11-14 02:08:26, against a pack dated 2026-11-13,
and moved `HEAD` to `e4d58ec` with an empty reason field in `.git/logs/HEAD`:

```
4245f99 -> e4d58ec  1794622106  (no message)
```

The six are exactly the object closure of `e4d58ec` against the packed `4245f99` — one commit,
two trees and three blobs, for the three files that commit touched:

| Object | Type | What |
|---|---|---|
| `e4d58ec` | commit | the 2026-11-13 close |
| `68ef86f` | tree | root |
| `4ffc10a` | tree | `FINDINGS/` |
| `47a2da4` | blob | `TEST-LOG.md` |
| `aeeb6a9` | blob | `TEST-STATE.md` |
| `c710bce` | blob | `FINDINGS/2026-11-13-snapshot-replaced.md` |

Nothing else was fetched: the history stayed shallow at depth 50 and
`git fetch --unshallow origin main` was needed again before `da85a6b` would resolve, per
`FINDINGS/2026-11-08-shallow-clone-history.md`. After unshallowing the history is 93 commits from
the root, `da85a6b` is 59 back and `3e416c5` is 78.

This one mechanism accounts for all three shapes. Where the image's `main` is behind the tip, the
top-up detaches `HEAD` at the tip and `main` reads stale, which is 2026-11-08 to 2026-11-12 with
the image at `57dcd3f` and this firing with the image at `4245f99`. Where the image's `main`
already is the tip, there is nothing to top up and `HEAD` is left attached as the image had it,
which is 2026-11-13, the day the image was new. The gap is then the commits pushed since the
image was taken, not since the previous firing, which is why 2026-11-12's prediction of 6 was
wrong by 6: it counted from the wrong date, not from a stale premise about `.git` writes.

## Consequence

The arrival sequence is unchanged and is a rescue again rather than a no-op:

```
git fetch origin main
git checkout main
git merge --ff-only origin/main
```

The warning in `FINDINGS/2026-11-10-frozen-git-snapshot.md` — that `git checkout main` on its own
reverts the working tree to the image's commit — applied again on this firing, `main` being
`4245f99` while the tree was at `e4d58ec`. The order is what makes it safe: fetching first moves
`origin/main` to the tip, so the `--ff-only` merge immediately after the checkout puts the tree
back. That warning should not be deleted from that file, and the note in
`FINDINGS/2026-11-13-snapshot-replaced.md` saying the stale-branch shape may return should be read
as having been borne out on the next day.

Reading the gap rather than predicting it stays the rule, for the reason
`FINDINGS/2026-11-12-commit-gap-rule.md` gave. The mechanism above is still falsifiable without
predicting anything. If the image is still the 2026-11-13 clone on 2026-11-15, then `.git` should
hold the same `pack-4235e996…` dated 2026-11-13, `refs/heads/main` should arrive at `4245f99`
again, and the loose objects written at provisioning should be the closure of the commits pushed
since — `e4d58ec` and this firing's own. A pack or bootstrap reflog dated anything other than
2026-11-13, or `refs/heads/main` arriving at anything other than `4245f99`, would mean the image
has been re-snapshotted again, as it was between 2026-11-12 and 2026-11-13.

## What this does not say

How often the image is re-snapshotted. Two images have been seen, one taken on 2026-11-08 and one
on 2026-11-13, five days apart, and two observations of one interval do not establish a period.
Whether a firing's own `.git` writes ever carry forward is also untouched: both reflogs inside
`.git` hold one bootstrap event each, as on every date from 2026-11-08 onward, so the discarding
of a firing's writes still holds and the surviving `e4d58ec` objects came from the remote at
provisioning, not from the 2026-11-13 firing's container.
