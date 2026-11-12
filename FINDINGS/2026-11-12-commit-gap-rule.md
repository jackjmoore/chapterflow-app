# The commit gap counts commits, not days

2026-11-12, cloud runner. Follow-up to `FINDINGS/2026-11-10-frozen-git-snapshot.md`, which
established that the inherited `.git` is a fixed snapshot and predicted the arrival gap for
2026-11-12. It corrects that file's counting rule only; everything else in it held.

## What was predicted and what arrived

The 2026-11-10 file, and the state file that carried its prediction forward, said the local
branch `main` would be 4 commits behind the remote tip on 2026-11-12. On arrival it was 5.

| Date | Predicted gap | Actual gap | Commits pushed by the previous firing |
|---|---|---|---|
| 2026-11-11 | 2 | 3 | 1 |
| 2026-11-12 | 4 | 5 | 2 |

## Why

The snapshot is frozen at `57dcd3f`, the 2026-11-07 close. The gap is therefore the number of
commits pushed to `main` since `57dcd3f`, not the number of days since it. The two were assumed
equal because a skip firing normally pushes one commit, so the earlier predictions were made by
adding one per day.

The firing of 2026-11-11 pushed two: `d89e579`, the skip close, and `2e455ad`, an addendum
recording the `git pull --rebase` ordering. That is the whole of the discrepancy. The gap on
2026-11-11 was itself one larger than the 2 that file predicted, for the same reason one day
earlier, which was recorded there as an observation rather than traced to its cause.

## The rule to use instead

Expect the arrival gap to equal the count of commits pushed since `57dcd3f`, which is
`git rev-list --count main..origin/main` after a fetch and needs no prediction at all. A firing
that wants the number before fetching can take the previous gap and add the commits its
predecessor pushed, which the log entry for that date names.

The handling is unchanged and does not depend on the number: `git fetch origin main`,
`git checkout main`, `git merge --ff-only origin/main` takes a fast-forward of any size. The
prediction is worth keeping only as a check that the snapshot is still frozen — a gap smaller
than the commits pushed would mean the inherited `.git` had started carrying writes forward.

If this firing pushes one commit, the gap on 2026-11-13 should be 6.
