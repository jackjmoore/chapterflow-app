# The inherited `.git` is a fixed 2026-11-08 snapshot, not yesterday's

Written 2026-11-10 by the fifty-fifth cloud firing. Follow-up to
`FINDINGS/2026-11-09-inherited-checkout.md`, one reading of which it corrects. Nothing here
needs a decision; the handling is the same three commands that file already prescribes.

## What arrived

On 2026-11-10 at 02:08 UTC the checkout was:

| Thing | Value |
|---|---|
| `git rev-parse --abbrev-ref HEAD` | `HEAD` (detached) |
| `HEAD` | `4e80372`, the 2026-11-09 close commit and the remote tip |
| local branch `main` | `57dcd3f`, the tip as of 2026-11-07 |
| `origin/main` before fetching | `57dcd3f` |
| `git status --short` | empty |
| commits between local `main` and the tip | 2 |

That is the fourth shape in `FINDINGS/2026-11-09-inherited-checkout.md` with one number changed:
yesterday the local `main` was one commit behind, today it is two.

## Why the gap grew

The reflogs hold three events, not four. `.git/logs/refs/remotes/origin/main` reads in full:

```
0000000 -> 57dcd3f  1794103710  fetch --no-progress --depth 50 origin main: storing head
57dcd3f -> 4e80372  1794276546  fetch origin main: fast-forward
```

The first is 2026-11-08 02:08:30 and is the bootstrap of that day's container. The second is
2026-11-10 02:09:06 and is this firing's own fetch. `.git/logs/refs/heads/main` has the matching
pair — `branch: Created from refs/remotes/origin/main` at 2026-11-08 02:08:30, then this firing's
fast-forward — and `.git/logs/HEAD` adds only the bootstrap's own detach of `HEAD` onto the tip at
2026-11-10 02:08:44. The single pre-existing pack,
`pack-7be55801c5032cc9fb75a501b038622adea3b6f3.pack` at 20,535,568 bytes, is dated 2026-11-08
02:08.

There is no entry anywhere for 2026-11-09. The firing of 2026-11-09 ran `git fetch origin main`,
`git checkout main` and `git merge --ff-only origin/main` against this same `.git` and recorded
doing so, and none of those three left a trace in it.

The reading those support is that the `.git` restored into the container is a fixed snapshot taken
at 2026-11-08 02:08:30 and reused unchanged on each later firing, and that whatever a firing writes
inside `.git` is discarded when the container is reclaimed. Yesterday's file read the same evidence
as the container inheriting *yesterday's* `.git`; the dates rule that out, because yesterday's
`.git` would carry yesterday's three commands. The commits themselves are safe either way: all
fifty-five close commits are on the remote, `4e80372` among them, so nothing has been lost on any
date.

## Consequence

The branch ref `main` stays at `57dcd3f` in the snapshot while the remote tip advances one commit
per firing, so the gap grows by one per day. It was 1 on 2026-11-09 and 2 on 2026-11-10; on
2026-11-11 it should be 3. The bootstrap still detaches `HEAD` onto the current tip, so the tree as
found is correct and only the branch ref is stale.

The operational point of `FINDINGS/2026-11-09-inherited-checkout.md` therefore sharpens rather than
changes. `git checkout main` alone no longer reverts one firing's work but every firing's work since
2026-11-07: today it would have discarded the log entries and state rewrites of 2026-11-08 and
2026-11-09 and deleted both `FINDINGS/2026-11-08-shallow-clone-history.md` and
`FINDINGS/2026-11-09-inherited-checkout.md`. A firing that appended from there would have committed
that loss.

## Handling, unchanged

```
git fetch origin main
git checkout main
git merge --ff-only origin/main
```

`merge --ff-only` takes a gap of any size, so no part of this needs tuning as the gap grows, and it
refuses rather than guesses if the shape is ever not a fast-forward. This firing ran it and got the
expected two-commit fast-forward and a clean tree. `git pull --rebase origin main`, which the
brief's cloud section asks for before each commit, reaches the same place if it runs after the
checkout.

The shallow boundary is a separate matter and is unaffected: `git rev-parse
--is-shallow-repository` returned true on arrival, as on 2026-11-08 and 2026-11-09, and
`git fetch --unshallow origin main` made the history 88 commits from the root `9d1ccdc`, per
`FINDINGS/2026-11-08-shallow-clone-history.md`.
