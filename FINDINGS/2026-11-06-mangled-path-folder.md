# The mangled-path folder in the repo root — likely mechanism

Written 2026-11-06 by the cloud firing of that date, which took no row. It answers one of the
four parts of shift 1B's brief, "find what wrote the mangled-path folder in the repo root",
from tracked files only. No command was run against a Windows shell, so the mechanism below is
the most likely one rather than a reproduced one.

## What is on disk

Nothing. A clean cloud checkout of `main` at `91c56a2` has no such folder; `git ls-tree HEAD`
lists 26 top-level entries and none of them is it. The folder is known only from `.gitignore`,
which has carried these three lines since `59d296e` on 2026-09-17:

```
# Left over from a path-mangling bug; kept out of history pending removal.
/UsersjackmOneDriveDocumentsChapterFlow Demo/
/verifyDemo.mjs
```

No path with a backslash, colon or quote has ever been tracked, checked with
`git log --all --diff-filter=A --name-only` over the whole history, so the folder was never
committed and deleting it is a development-machine action that a cloud shift cannot do.

## The name

The ignored name is

```
UsersjackmOneDriveDocumentsChapterFlow Demo
```

which is `C:\Users\jackm\OneDrive\Documents\ChapterFlow Demo` with the drive letter and every
backslash removed and the one space kept. That the space survived while the separators did not
points at a shell eating `\` as an escape character rather than at a bug in `node:path`: a
`path` fault would not single out backslashes and leave the space alone.

## The likely writer

`scripts/make-demo-project.mjs` takes its target straight from the command line with no
normalisation and no check that the path is absolute:

| Line | Code |
|---|---|
| 21 | `const target = process.argv[2]` |
| 27 | `existsSync(join(target, 'binder.json'))` |
| 489 | `await mkdir(join(target, 'documents'), { recursive: true })` |

With `recursive: true` and a relative `target`, line 489 creates the folder under the current
working directory without complaint, which is the repo root when the script is run the way its
own usage line shows. The guard on line 27 does not catch this: it refuses only an existing
project, and a mangled target names a folder that does not exist yet. The ignored
`/verifyDemo.mjs`, untracked and absent here, sits under the same comment block and may be the
caller that passed the unquoted path, but nothing tracked references it, so that part is
unverified.

## What this is not

It is not a data-loss path. The script writes a new project under a wrong folder; it does not
touch an existing one, and the line 27 guard still stands between it and an existing
`binder.json`. CLAUDE.md's rule that the project must stay outside OneDrive is consistent with
a demo target having been pointed into OneDrive when this happened.

## For shift 1B

Two of the row's four parts can be closed on the development machine without investigation:
delete the folder, and quote the target argument. Whether `make-demo-project.mjs` should reject
a relative target outright is a one-line change in the main process rather than the renderer,
so it could carry a test beside it under the plan's own slack rule. That is a question for Jack
and is not assumed here.
