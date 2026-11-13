# The frozen `.git` snapshot is gone; the clone now arrives fresh and current

2026-11-13, cloud runner. Follow-up to `FINDINGS/2026-11-10-frozen-git-snapshot.md` and
`FINDINGS/2026-11-12-commit-gap-rule.md`. It falsifies the arrival shape both of those describe,
by the test the second one named. Nothing here needs a decision; the consequence is that the
arrival sequence must be read rather than predicted.

## What was predicted and what arrived

`FINDINGS/2026-11-12-commit-gap-rule.md` closes: "If this firing pushes one commit, the gap on
2026-11-13 should be 6." It also named the falsifying observation — "a gap smaller than the
commits pushed would mean the inherited `.git` had started carrying writes forward."

The gap was 0.

| Thing | 2026-11-12 | 2026-11-13 |
|---|---|---|
| `git rev-parse --abbrev-ref HEAD` | `HEAD` (detached) | `main` |
| local branch `main` | `57dcd3f`, the 2026-11-07 tip | `4245f99`, the remote tip |
| `origin/main` before fetching | `57dcd3f` | `4245f99` |
| `git rev-list --count main..origin/main` | 5 | 0 |
| `git status --short` | empty | empty |
| bootstrap fetch in `.git/logs/refs/remotes/origin/main` | 2026-11-08 02:08:30 | 2026-11-13 02:08:26 |
| pre-existing pack | `pack-7be55801…` 20,535,568 bytes, dated 2026-11-08 | `pack-4235e996…` 20,557,875 bytes, dated 2026-11-13 |

## Why this is not writes carrying forward

It is the other possibility: the snapshot was replaced, not updated. The reflog still holds
exactly one event rather than an accumulating series, and that event is dated 28 seconds before
this firing began:

```
0000000 -> 4245f99  1794535706  fetch --no-progress --depth 50 origin main: storing head
```

`.git/logs/refs/heads/main` holds one matching line, `branch: Created from
refs/remotes/origin/main` at 1794535707, and `.git/logs/HEAD` holds the bootstrap's own detach at
1794535706 followed by `checkout: moving from 4245f99 to main` at 1794535707. There is no entry
for 2026-11-08 through 2026-11-12 anywhere in `.git`, and the 2026-11-08 pack is not present under
any name.

So the discarding of a firing's own `.git` writes, which
`FINDINGS/2026-11-10-frozen-git-snapshot.md` established over three days, still holds. What
changed is that the `.git` restored into the container is no longer a fixed 2026-11-08 image but a
clone made at provisioning time, shallow at depth 50 as before. Whether that is a one-off or the
new steady state cannot be told from a single firing.

The second change is in the same bootstrap. It now creates the local branch and checks it out at
the remote tip, one second after the fetch, instead of leaving `HEAD` detached with `main` stale.
That is what makes the gap 0 rather than merely small.

## Consequence

The three commands `FINDINGS/2026-11-09-inherited-checkout.md` prescribes are now a no-op rather
than a rescue:

```
git fetch origin main
git checkout main
git merge --ff-only origin/main
```

They remain the right thing to run. `git checkout main` is harmless when `main` is already the
tip and the tree is clean, and `merge --ff-only` reports `Already up to date` rather than
guessing. The reason to keep running them is that one firing cannot establish which shape the
next one gets, and the sequence is correct under both. What is now ruled out is predicting the
gap from the previous firing's pushes: the prediction of 6 was wrong by 6, and the number is read
with `git rev-list --count main..origin/main` after a fetch, as
`FINDINGS/2026-11-12-commit-gap-rule.md` already recommended for its own reason.

The warning in `FINDINGS/2026-11-10-frozen-git-snapshot.md` about `git checkout main` reverting
every firing's work since 2026-11-07 is specific to the stale-branch shape and does not apply to
the shape seen today. It should not be deleted from that file, because the shape may return.

## What did not change

The shallow boundary. `git rev-parse --is-shallow-repository` returned true on arrival, as on
2026-11-08 through 2026-11-12, and `git fetch --unshallow origin main` was needed again before
`da85a6b` would resolve, per `FINDINGS/2026-11-08-shallow-clone-history.md`. After unshallowing,
the history is 92 commits from the root, `da85a6b` is 58 commits back and `3e416c5` is 77.
