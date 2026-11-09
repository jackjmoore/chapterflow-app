# The checkout can arrive as the previous firing's own, with `main` a commit behind

Written by the cloud firing of 2026-11-09, which took no row. Read-only with respect to the
remote until its own skip commit; no install, no build and no suite was run. It records a fourth
checkout shape, not seen on any of the fifty-three firings before it: the working copy is the
`.git` directory yesterday's firing left behind, `HEAD` is detached at the remote tip, and the
local branch `main` still points at the commit that was the tip a day ago. The three shapes
`TEST-STATE.md` has been telling each firing to expect do not cover it, and the ordinary reading
of "check it is on `main` before committing" is not sufficient on its own.

## What arrived

The first four commands of the firing, before anything was fetched or checked out:

```
$ git status --short
                                    # clean
$ git rev-parse --abbrev-ref HEAD
HEAD                                # detached
$ git log -1 --format='%h %ad %s' --date=short
aaf88c6 2026-11-08 Cloud shift 2026-11-08 skipped: ...
$ git rev-parse origin/main
57dcd3fac5f6...                     # the tip as of 2026-11-07
```

`aaf88c6` is the 2026-11-08 close commit, made and pushed by yesterday's firing. It was already
present in the object store and already checked out, before this firing fetched anything. The
remote-tracking ref was a day stale, and `git fetch origin main` moved it `57dcd3f..aaf88c6`,
that is, up to the commit `HEAD` was already on.

| Ref at container start | Commit | Date |
|---|---|---|
| `HEAD` (detached) | `aaf88c6` | 2026-11-08 |
| `main` | `57dcd3f` | 2026-11-07 |
| `origin/main` | `57dcd3f` | 2026-11-07 |

## Why it looks inherited rather than cloned

Three independent signs, all consistent with one `.git` directory reused across two days rather
than a fresh clone made this morning.

The reflog carries both days. `main` was created once, from `refs/remotes/origin/main`, at
2026-11-08 02:08:30 — yesterday's clone, not today's:

```
$ git reflog show main --date=iso
57dcd3f main@{2026-11-08 02:08:30 +0000}: branch: Created from refs/remotes/origin/main
$ git reflog --date=iso | sed -n 3,5p
aaf88c6 HEAD@{2026-11-09 02:08:30 +0000}:
57dcd3f HEAD@{2026-11-08 02:08:30 +0000}: checkout: moving from 57dcd3f... to main
57dcd3f HEAD@{2026-11-08 02:08:30 +0000}:
```

The two reason-less entries, one per day at 02:08:30, are where each day's provisioner set `HEAD`
directly. Only the 2026-11-08 one is followed by a branch checkout.

`.git/shallow` held two boundaries, one per depth-50 fetch:

```
$ cat .git/shallow
4ad60b30630bf91e516646dee5c518a8c3f4e6e2
7dd08e29f05a849a1850fdef8f9a1db5fe56df75
$ git rev-list --count 4ad60b3^..57dcd3f
50
$ git rev-list --count 7dd08e2^..aaf88c6
50
```

`4ad60b3` is the boundary `FINDINGS/2026-11-08-shallow-clone-history.md` recorded yesterday,
measured from `57dcd3f`. `7dd08e2` is a second boundary, measured from `aaf88c6`. The fixed depth
of 50 holds for both, so this is the same mechanism that file described, applied twice in the same
object store a day apart.

The pack and most of `.git` predate today. The pack file and `.git/branches`, `hooks`, `info`,
`logs` and `refs` are dated 2026-11-08 02:08; `.git/config` and `.git/HEAD` are dated 2026-11-09
02:08. Mtimes under the worktree are not usable as evidence here, because this firing's own
`git checkout main` rewrote the three files `aaf88c6` touched.

## The consequence, and the sequence that is safe

The hazard is narrow but real, and it is a data-loss hazard rather than a confusing one. `git
checkout main` on its own succeeds and leaves the tree a commit behind:

```
$ git checkout main
Switched to branch 'main'
Your branch is behind 'origin/main' by 1 commit, and can be fast-forwarded.
```

At that point `TEST-LOG.md` and `TEST-STATE.md` hold their `57dcd3f` content: yesterday's close
entry is not in the log, yesterday's state rewrite is undone, and `FINDINGS/2026-11-08-shallow-clone-history.md`
is absent from the tree. A firing that appended its own entry from there and committed would have
written a log with a day missing and deleted a findings file, and the commit would have looked
ordinary.

`TEST-SHIFT.md`'s own pre-commit step, `git pull --rebase origin main`, prevents it, provided it
is run after the branch checkout and not before. What this firing ran, and what a later firing
should run when it finds a detached `HEAD`:

```
git fetch origin main
git checkout main
git merge --ff-only origin/main
git status --short            # expect clean
git log -1 --format='%h %s'   # expect the commit HEAD was detached at
```

The fast-forward is the step that matters. If it is not a fast-forward, the local branch carries
something the remote does not, and that is a different situation than this one and is not covered
here.

## What this does not say

Nothing about why the image was reused; that is the runner's business and this firing has no
view of it. Whether the next firing inherits this checkout again, or arrives as a fresh clone in
one of the three earlier shapes, is not predictable from one observation — seven rebuilds have
reset the commit gap to zero on dates no firing predicted, per the 2026-11-08 entry, and this is
one more event of that kind rather than a new rule. The remote is unaffected throughout: the
fetch, the unshallow and the fast-forward all write only locally.
