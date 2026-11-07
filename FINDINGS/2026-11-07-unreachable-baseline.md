# The baseline commit `da85a6b` is not in this repository's history

Written by the cloud firing of 2026-11-07, which took no row. Read-only; no install, no build
and no suite was run. Follows `FINDINGS/2026-11-06-mangled-path-folder.md` in taking a question
out of a later shift's way from tracked files alone, but this one was not on anybody's list: it
was found while checking the one verification `TEST-STATE.md` has told every firing to run.

## What the state file has been asserting

Since 2026-09-18, `TEST-STATE.md` has carried a sentence of this shape, and dozens of firings
have re-run its command and reported it empty:

> Nothing under `src/` or `tests/` has changed since `da85a6b`, confirmed by an empty
> `git diff --stat da85a6b HEAD -- src tests`.

The command does return empty, and the content claim is true. The commit it names, however, is
not an ancestor of `HEAD`:

```
$ git merge-base --is-ancestor da85a6b HEAD ; echo $?
1
```

## What the history actually looks like

The repository's root commit is `a983d96`, dated 2026-09-18 02:04:38 +0000, subject
`Cloud shift 2026-09-18 skipped: second firing with no cloud-capable row, 1B blocks`. It adds
every tracked path in one commit — `.gitignore`, the seven `FINDINGS/` files of week one, all
five planning documents, `src/`, `tests/`, `build/`, the lockfile. There are 50 commits in
total and 49 after the root, all 50 authored by `Claude`.

So the pushed history begins on 2026-09-18, with the whole working tree arriving as a single
import, even though shifts 1A through 7A ran on 2026-09-10 through 2026-09-16 and the first
skip fired on 2026-09-17. None of those commits is in it.

They are, however, present in this checkout as unreachable objects. `git fsck --unreachable`
finds seven unreachable commits, all inside the single packfile the clone arrived with:

| Commit | Date | Author | Subject |
|---|---|---|---|
| `5f252e5` | 2026-09-15 | Claude | Reference-rot suite, and report a deleted sheet to the search index |
| `90739c4` | 2026-09-15 | Claude | Test shift 6B close: reference rot at store level, 102 assertions, one bug found and fixed |
| `1f4ccc8` | 2026-09-16 | Jack Moore | Test shift 7A open: weekly review and routine definition, run in the cloud in place of 1B |
| `9ba3ca3` | 2026-09-16 | Jack Moore | Correct the cloud section's freshness rule, and name the two font-bound suites |
| `91a081f` | 2026-09-16 | Jack Moore | Week-one review findings and the cloud routine definition |
| `da85a6b` | 2026-09-16 | Jack Moore | Test shift 7A close: weekly review, routine definition, 23 of 26 suites and 1,197 assertions |
| `59d296e` | 2026-09-17 | Claude | Cloud shift 2026-09-17 skipped: no cloud-capable row left, 1B blocks |

No branch and no tag contains any of them; `git show-ref` lists only `refs/heads/main` and
`refs/remotes/origin/main`, and `git ls-remote origin` offers only `HEAD` and `refs/heads/main`,
both at `6dcdd75`. `59d296e` is the second commit the repository cites as if it were history:
`FINDINGS/2026-11-06-mangled-path-folder.md` and `TEST-STATE.md` both name it as the commit that
added the three `.gitignore` lines for the mangled-path folder.

Why the objects are here at all is not established. They sit in
`.git/objects/pack/pack-c3f7bf….pack`, dated 2026-10-31 with the container image, and a clone
is not normally served unreachable objects. The reading this file will commit to is only that
they are present in this checkout and reachable from nothing.

## What is and is not lost

No content is lost. The root commit's tree is identical to `da85a6b`'s for the paths that
matter:

```
$ git diff --stat da85a6b a983d96 -- src tests
(empty)
```

Across the whole tree the two differ in two files only, `TEST-LOG.md` and `TEST-STATE.md`, by
108 insertions and 58 deletions — which is the 2026-09-17 skip entry and its state rewrite,
folded into the import. Week one's test code, fixtures and findings all survive in the pushed
history.

What is lost is the commit-by-commit history of 2026-09-15 through 2026-09-17: seven commits,
three of them authored by Jack Moore, including both halves of shift 7A. If the remote prunes
its unreachable objects, that sequence goes with them unless it still exists in a clone on the
development machine. This is worth one look there; it is not worth reconstructing.

## Why a later firing should care

The citation is load-bearing. `TEST-STATE.md` instructs each firing to confirm the empty diff
against `da85a6b`, and that command resolves today only because of those packed unreachable
objects. A checkout that arrives without them — a fresh clone after a remote GC — fails the
command with a bad-object error rather than returning empty. A firing reading that as "something
changed under `src/`" would be wrong, and one treating the error as a blocker would stall.

The durable substitute is the root commit `a983d96`, which is reachable from `main` and whose
`src` and `tests` trees are byte-identical to `da85a6b`'s, shown above. For those two paths
`git diff --stat a983d96 HEAD -- src tests` is the same check and cannot be pruned. It is not a
drop-in for `TEST-LOG.md` or `TEST-STATE.md`, which do differ between the two commits.

This file makes that substitution in `TEST-STATE.md`, keeping `da85a6b` named as the week-one
baseline for the 2026-09-10 numbers, which is what it is, and no longer using it as a commit to
diff against.

## Not done here

The development machine was not inspected, so whether the pre-history still exists in a local
clone is unknown. Nothing was pushed to preserve the unreachable commits: creating a tag for
them would change what the remote holds, which is Jack's call and not a cloud firing's.
