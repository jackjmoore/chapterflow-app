# The history is not truncated; the checkout is a shallow clone

Written by the cloud firing of 2026-11-08, which took no row. Read-only with respect to the
remote; no install, no build and no suite was run. It corrects
`FINDINGS/2026-11-07-unreachable-baseline.md`, which read a shallow-clone boundary as a root
commit and concluded that seven commits of 2026-09-15 to 2026-09-17 survive only as unreachable
objects. They do not. The full history is on the remote, 86 commits beginning 2026-08-20, and
all seven are ordinary reachable ancestors of `main`.

## What yesterday saw, and why

Yesterday's file reports the repository's root commit as `a983d96` of 2026-09-18, the second
skip commit, "adding every tracked path in one commit", with 50 commits in total and all 50
authored by `Claude`. Today's checkout reports the same shape one commit further on:

```
$ git rev-parse --is-shallow-repository
true
$ cat .git/shallow
4ad60b30630bf91e516646dee5c518a8c3f4e6e2
$ git rev-list --count HEAD
50
$ git rev-list --max-parents=0 HEAD
4ad60b30630bf91e516646dee5c518a8c3f4e6e2   # 2026-09-19, the third skip commit
```

The clone is made to a fixed depth of 50, so the boundary moves forward as `main` does. The
arithmetic matches exactly on both dates:

| Firing | HEAD | Depth-50 commit from HEAD | Reported as root |
|---|---|---|---|
| 2026-11-07 | `6dcdd75` (2026-11-06) | `a983d96` (2026-09-18) | `a983d96` |
| 2026-11-08 | `57dcd3f` (2026-11-07) | `4ad60b3` (2026-09-19) | `4ad60b3` |

`git rev-list --count a983d96^..6dcdd75` is 50 and `git rev-list --count 4ad60b3^..57dcd3f` is
50. A shallow boundary answers `--max-parents=0` because its parents are grafted away, and its
diff against nothing shows the whole tree as added, which is why it reads as an import.

The seven commits yesterday found under `git fsck --unreachable` are the seven immediately
preceding its boundary — `5f252e5`, `90739c4`, `1f4ccc8`, `91a081f`, `9ba3ca3`, `da85a6b`,
`59d296e`. The pack that clone arrived with carried a few commits past the boundary; the graft
made them reachable from nothing. That is the question yesterday left open — "a clone is not
normally served unreachable objects" — and it is the answer. Today's pack carried no such
extras: `git fsck --unreachable` found none while the clone was still shallow.

## What the history actually holds

`git fetch --unshallow origin main` was run in this checkout. It changes nothing on the remote
and nothing in the working tree.

```
$ git rev-parse --is-shallow-repository
false
$ git rev-list --count HEAD
86
$ git rev-list --max-parents=0 HEAD
9d1ccdc  2026-08-20  Initial commit: roadmap complete, regression pass done
```

86 commits, 59 authored by `Claude` and 27 by `Jack Moore`, running from 2026-08-20 to
2026-11-07. The 14 commits before `3e416c5` are the application's own development, all dated
2026-08-20 to 2026-08-22, which no state rewrite has ever mentioned. All three commits the
planning documents cite are present and are ancestors of `HEAD`:

| Commit | Date | Author | What it is |
|---|---|---|---|
| `3e416c5` | 2026-09-10 | Jack Moore | The 2026-09-10 working-tree baseline |
| `da85a6b` | 2026-09-16 | Jack Moore | Shift 7A close, the week-one baseline |
| `a983d96` | 2026-09-18 | Claude | The second skip commit |

`git merge-base --is-ancestor da85a6b HEAD` exits 0. Both halves of shift 7A, and every week-one
shift commit from 1A on, are in the reachable history. Nothing is lost and nothing needs
preserving or reconstructing. `59d296e`, which `FINDINGS/2026-11-06-mangled-path-folder.md`
names as the commit that added the three `.gitignore` lines, is a reachable ancestor, so that
citation stands.

## The diff check, correctly

Both forms the state file has used fail in a shallow checkout, for the same reason and with the
same error. `a983d96` failed outright today — the boundary had already moved past it:

```
$ git diff --stat a983d96 HEAD -- src tests
fatal: bad revision 'a983d96'
```

Substituting one commit for another does not fix this. Any commit older than the boundary is
absent, and the boundary advances one commit per firing, so `da85a6b` of 2026-09-16 will be
absent from every future shallow checkout. The durable form is to undo the shallowness first:

```
git rev-parse --is-shallow-repository      # true on arrival
git fetch --unshallow origin main          # read-only against the remote
git diff --stat da85a6b HEAD -- src tests  # empty
```

Run that way today, `src/` and `tests/` are unchanged since `da85a6b`, which is the claim 52
state rewrites have made and the first time it has been checked against a commit that is
actually in the history. Against the 2026-09-10 baseline `3e416c5` the week-one work shows as
expected — 8 files and 3,112 insertions, the two store fixes in `searchIndex.ts` and
`storyBibleSheetStore.ts` and the six test files — which is independent evidence that week one
is in the reachable history rather than only in packed objects.

`git diff --stat da85a6b HEAD -- TEST-WORKBOOK.md` is also empty, so the workbook table has not
changed since 7A closed.

## What this retires

Two entries can come off the lists. "How this repository's history came to begin on 2026-09-18"
is answered: it did not. Jack does not need to look for the pre-history in a clone on the
development machine, which is what the 2026-11-07 entry asked of him. "Reconstructing the seven
unreachable commits of 2026-09-15 to 2026-09-17, or pushing a ref to preserve them" is moot
rather than ruled out; there is nothing to preserve.

The 2026-11-07 file is left as written. It is wrong in its conclusion and careful in its
evidence, and it is the reason this was checked today.

## Not done here

`TEST-SHIFT.md`'s "Running in the cloud" section does not mention the shallow clone, and a
firing that compares anything to a commit older than 50 back will keep hitting this. That
section is Jack's and changes on its own commit with a reason, so it was not edited here; the
shallowness check is recorded in `TEST-STATE.md` instead, where a firing will read it. Whether
the clone depth is configurable from the environment's side was not investigated.
