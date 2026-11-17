# The 2026-11-13 image held for a fifth firing; the per-commit object count is not six

2026-11-17, cloud runner. Follow-up to `FINDINGS/2026-11-15-image-held.md`, which it confirms on
its main point and corrects on one detail of wording, and through it to
`FINDINGS/2026-11-14-provisioning-top-up.md`, `FINDINGS/2026-11-13-snapshot-replaced.md`,
`FINDINGS/2026-11-12-commit-gap-rule.md` and `FINDINGS/2026-11-10-frozen-git-snapshot.md`. Nothing
here needs a decision and nothing here changes what a test asserts. It is written rather than left
as a log paragraph because it takes the top-up mechanism to four commits, replaces the
"six per commit" reading with the rule that actually produces it, and separates three reflog files
that earlier entries have referred to as two.

## The image

| Thing | 2026-11-14 | 2026-11-15 | 2026-11-16 | 2026-11-17 |
|---|---|---|---|---|
| pack name | `pack-4235e996…` | `pack-4235e996…` | `pack-4235e996…` | `pack-4235e996…` |
| pack bytes | 20,557,875 | 20,557,875 | 20,557,875 | 20,557,875 |
| pack date | 2026-11-13 02:08:25 | 2026-11-13 02:08:25 | 2026-11-13 02:08:25 | 2026-11-13 02:08:25 |
| `refs/heads/main` on arrival | `4245f99` | `4245f99` | `4245f99` | `4245f99` |
| `HEAD` on arrival | detached, `e4d58ec` | detached, `eaad6a7` | detached, `1d60683` | detached, `cbb59ae` |
| `git status --short` | empty | empty | empty | empty |
| gap after fetching | 1 | 2 | 3 | 4 |
| loose objects at provisioning | 6 | 12 | 18 | 22 |

The name, the byte count and the second are identical to the four earlier readings, so this is the
same image held for a fifth firing rather than a re-snapshot that happened to land on 2026-11-13.
The signature to read is still all three together, per `FINDINGS/2026-11-15-image-held.md`.

The 2026-11-13 image has now lasted 2026-11-13 to 2026-11-17 and the 2026-11-08 image lasted
2026-11-08 to 2026-11-12, which is two intervals of at least five days each. Two intervals of the
same observed length still do not establish a period, and the image's date is known to move without
notice, so nothing here should be used to predict when the next re-snapshot falls.

## The twenty-two objects, and why they are not twenty-four

All 22 loose objects were written at 2026-11-17 02:08:15. A `diff` of their names against
`git rev-list --objects 4245f99..cbb59ae` matches exactly with nothing on either side: 4 commits,
7 trees and 11 blobs, the closure of the four commits pushed since the image was taken.

`FINDINGS/2026-11-15-image-held.md` described the same objects as "six per commit, each being one
commit, two trees and three blobs". At four commits that reading predicts 24 and the count is 22.
Six was never the rule; it is what a commit touching three files happens to cost:

| Commit | Files touched | Objects |
|---|---|---|
| `e4d58ec` | `TEST-LOG.md`, `TEST-STATE.md`, `FINDINGS/2026-11-13-snapshot-replaced.md` | 6 |
| `eaad6a7` | `TEST-LOG.md`, `TEST-STATE.md`, `FINDINGS/2026-11-14-provisioning-top-up.md` | 6 |
| `1d60683` | `TEST-LOG.md`, `TEST-STATE.md`, `FINDINGS/2026-11-15-image-held.md` | 6 |
| `cbb59ae` | `TEST-LOG.md`, `TEST-STATE.md` | 4 |

`cbb59ae` wrote no findings file, so it needed no `FINDINGS/` tree and no third blob: one commit,
one tree and two blobs. The first three cost six apiece only because each added a findings file.
The rule is that provisioning writes exactly the closure of the commits pushed since the image was
taken, and a commit's share of it is whatever that commit touched. The top-up mechanism of
`FINDINGS/2026-11-14-provisioning-top-up.md` now holds at one, two, three and four commits.

## Three reflog files, not two

Earlier entries say "both reflogs inside `.git`" held one bootstrap event each. There are three
files under `.git/logs`, and the claim is about two of them. On arrival:

| File | Entries on arrival | Content |
|---|---|---|
| `.git/logs/refs/remotes/origin/main` | 1 | `fetch --no-progress --depth 50 origin main: storing head`, at 1794535705 |
| `.git/logs/refs/heads/main` | 1 | `branch: Created from refs/remotes/origin/main`, at 1794535705 |
| `.git/logs/HEAD` | 3 | two at 1794535705, one at 1794881295 |

1794535705 is 2026-11-13 02:08:25, the image's own build, and 1794881295 is 2026-11-17 02:08:15,
this firing's top-up. The two entries in `.git/logs/HEAD` dated to the image are an unlabelled
store-head and `checkout: moving from 4245f99… to main`; the third is the top-up moving `HEAD` from
`4245f99` to `cbb59ae` with an empty reason field, which is the entry
`FINDINGS/2026-11-14-provisioning-top-up.md` recorded. A later firing that counts lines in
`.git/logs/HEAD` should therefore expect three, not one, and should not read that as the earlier
claim having broken.

What the earlier claim was for is untouched. Nothing in any of the three files was written by a
previous firing's container: two timestamps belong to the image's build and one to this firing's
own provisioning. Expecting a firing's own writes inside `.git` to reach the next one stays ruled
out, on every date from 2026-11-08 to 2026-11-17.

## The gap

The gap read 4 with `git rev-list --count main..origin/main` after fetching, being `e4d58ec`,
`eaad6a7`, `1d60683` and `cbb59ae` — the four commits pushed since the image was taken. That it is
one more than the 3 of 2026-11-16 follows from one firing having pushed once in between, as it did
on the three dates before. Predicting the gap stays ruled out for the reason
`FINDINGS/2026-11-12-commit-gap-rule.md` gave; it is read after the fetch.

## Consequence

None beyond the two corrections above. The arrival sequence in `TEST-STATE.md` is unchanged and was
a rescue again, `main` being `4245f99` while the tree was at `cbb59ae`:

```
git fetch origin main
git checkout main
git merge --ff-only origin/main
```

The fetch first is what makes the checkout's revert harmless. The history arrived shallow at depth
50 and `git fetch --unshallow origin main` was needed again before `da85a6b` would resolve, per
`FINDINGS/2026-11-08-shallow-clone-history.md`; after unshallowing the history is 96 commits from
the root, with `da85a6b` 62 back and `3e416c5` 81.

## What this does not say

How often the image is re-snapshotted, for the reason given above. Nor anything about the suites:
this firing installed nothing, built nothing and ran nothing, and `src/` and `tests/` are unchanged
since `da85a6b` of 2026-09-16.
