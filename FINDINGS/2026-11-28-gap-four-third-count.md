# Three loose-object counts at a gap of four: 24 on 2026-11-28 against 22 and 20

2026-11-28, cloud runner. Follow-up to `FINDINGS/2026-11-23-same-gap-different-count.md`, which
paired a gap-4 reading of 20 against the 22 of 2026-11-17, and through it to
`FINDINGS/2026-11-17-image-fifth-firing.md` for the share rule and
`FINDINGS/2026-11-14-provisioning-top-up.md` for the mechanism. It continues the sequence
`FINDINGS/2026-11-26-gap-two-twelve-objects.md` and
`FINDINGS/2026-11-27-gap-three-eighteen-objects.md` extend at gaps of 2 and 3. Nothing here needs a
decision and nothing here changes what a test asserts. It is written rather than left as a log
paragraph because it is the first gap read three times, the three counts are three different
numbers, and the three together admit a closed form that every reading taken so far fits.

## What was read

| Thing | Reading |
|---|---|
| pack name before unshallowing | `pack-2f686ef4…` |
| pack bytes | 20,592,486 |
| pack date | 2026-11-24 02:08:57 |
| `refs/heads/main` on arrival | `31b7095` |
| `refs/remotes/origin/main` on arrival | `31b7095` |
| `HEAD` on arrival | detached, `b562a0d` |
| `git status --short` | empty |
| gap after fetching | 4 |
| loose objects at provisioning | 24 |
| lines in `.git/logs/HEAD` | 3 |

The pack name, byte count and second match the readings of 2026-11-24 through 2026-11-27, so the
fifth image held for a fifth firing rather than being rebuilt onto the same second. Under
`FINDINGS/2026-11-25-pack-predates-firing.md` a pack date is a build time, so the match alone
settles that the image did not move. All twenty-four loose objects carry the mtime 1795831699,
which is 2026-11-28 02:08:19, this firing's own provisioning and the only write inside `.git` that
did not come from the image's build.

## The twenty-four objects

`git rev-list --objects 31b7095..b562a0d` returns twenty-four ids and a `comm` against the
twenty-four loose object names matches exactly, with nothing on either side. Each object belongs to
exactly one of the four commits, checked pairwise: all six pairs share zero objects.

| Commit | Date | Objects it adds | Count |
|---|---|---|---|
| `deedd80` | 2026-11-24 | commit, root tree, `FINDINGS` tree, blob for `FINDINGS/2026-11-24-fifth-image.md`, `TEST-LOG.md`, `TEST-STATE.md` | 6 |
| `afc4df7` | 2026-11-25 | commit, root tree, `FINDINGS` tree, blob for `FINDINGS/2026-11-25-pack-predates-firing.md`, `TEST-LOG.md`, `TEST-STATE.md` | 6 |
| `9ef99c7` | 2026-11-26 | commit, root tree, `FINDINGS` tree, blob for `FINDINGS/2026-11-26-gap-two-twelve-objects.md`, `TEST-LOG.md`, `TEST-STATE.md` | 6 |
| `b562a0d` | 2026-11-27 | commit, root tree, `FINDINGS` tree, blob for `FINDINGS/2026-11-27-gap-three-eighteen-objects.md`, `TEST-LOG.md`, `TEST-STATE.md` | 6 |

Six times four is twenty-four. Every commit in this range added a file under `FINDINGS/` and
modified `TEST-LOG.md` and `TEST-STATE.md`, so each wrote its own `FINDINGS` tree and none reused a
predecessor's — unlike the 2026-11-23 range, where two commits added no findings file and reused the
tree unchanged. The count was read from `.git/objects` before the gap was known, so this is an
accounting of a reading and not a prediction made ahead of it; the one prediction made ahead of a
count still stands at 2026-11-22.

## One gap, three counts

| Date | Gap | Commits adding a findings file | Commits not | Objects |
|---|---|---|---|---|
| 2026-11-17 | 4 | 3 | 1 | 22 |
| 2026-11-23 | 4 | 2 | 2 | 20 |
| 2026-11-28 | 4 | 4 | 0 | 24 |

Three readings at the same gap, three different counts. `FINDINGS/2026-11-23-same-gap-different-count.md`
showed by a pair that the gap does not fix the count; a third value at the same gap leaves no
reading of the gap alone that could have produced all three. Twenty-four is also the largest a gap
of 4 can reach under the share rule, every commit having taken the six-object shape, so the three
readings span the full range the rule allows at this gap: 16 if no commit wrote a findings file, 24
if all four did.

## A closed form that fits every reading so far

The routine's commits come in exactly two shapes. One modifies `TEST-LOG.md` and `TEST-STATE.md`
only, for four objects — commit, root tree, two blobs. The other adds a file under `FINDINGS/` as
well, for six — the same four plus the `FINDINGS` tree and the new blob. With `n` the gap and `k`
the number of commits in it that added a findings file, the share rule reduces to

    objects = 4n + 2k

Every count recorded to date fits it:

| Date | Gap `n` | `k` | 4n + 2k | Objects read |
|---|---|---|---|---|
| 2026-11-17 | 4 | 3 | 22 | 22 |
| 2026-11-21 | 2 | 1 | 10 | 10 |
| 2026-11-22 | 3 | 1 | 14 | 14 |
| 2026-11-23 | 4 | 2 | 20 | 20 |
| 2026-11-24 | 0 | 0 | 0 | 0 |
| 2026-11-25 | 1 | 1 | 6 | 6 |
| 2026-11-26 | 2 | 2 | 12 | 12 |
| 2026-11-27 | 3 | 3 | 18 | 18 |
| 2026-11-28 | 4 | 4 | 24 | 24 |

This is the share rule written out for the two shapes the routine actually produces, not a new rule,
and it is worth no more confidence than the rule it restates. It holds only while every commit in
the range touches that same set of paths. A commit that changed a file under `src/` or `tests/`, a
findings file edited rather than added, or two findings files in one commit would each break it, and
none of those has occurred in any range read so far. The discarded six-per-commit rule is the
special case `k = n`, which is why it agrees whenever a range is uniform.

## The third agreement, and why it still proves nothing

With `k = n` the formula gives `6n`, so the share rule and six-per-commit agree today as they did on
2026-11-26 and 2026-11-27. That is the third such agreement by the count the 2026-11-27 entry keeps,
and the third in a row. All three fell on ranges whose commits were of one shape, which is the case
six-per-commit was built from, so none of them can test it. The readings that separate the two
remain 2026-11-21, 2026-11-22 and 2026-11-23. A gap holding commits of at least two shapes is still
the only kind of reading that can separate them, and the firing after a date on which the routine
wrote no findings file is the only way one arises.

## What this does not establish

It says nothing about when the image next moves. The fifth image has now served 2026-11-24 through
2026-11-28, five firings, matching the 2026-11-08 image at five and the 2026-11-13 image at five
against the 2026-11-18 image's one; five known image dates at intervals of five, five, one and five
days still fit no schedule, and predicting the next rebuild stays ruled out per
`FINDINGS/2026-11-19-image-moved-after-one-firing.md`.

It says nothing about the gap, which stays unpredictable and is read with
`git rev-list --count main..origin/main` after a fetch. Nor does the formula let a later firing skip
the paths: `k` is read from the commits in the range, by `git diff-tree -r --name-status` or the
equivalent, and is not derivable from `n`.

The pack byte delta is again not a per-commit cost. The unshallow wrote `pack-c169157e…` at 812,543
bytes dated 2026-11-28 02:09:32, against the 811,021 bytes of 2026-11-27, a delta of 1,522 bytes
over the one commit between them; that is smaller than earlier per-commit deltas and reading it as a
cost stays ruled out per `FINDINGS/2026-11-24-fifth-image.md`.

## The three files under `.git/logs`

As `FINDINGS/2026-11-17-image-fifth-firing.md` describes. `.git/logs/HEAD` held three lines: the
first two stamped 1795486137 and 1795486138, which is 2026-11-24 02:08:57 and 02:08:58, the image's
own depth-50 clone, and the third stamped 1795831699 for 2026-11-28 02:08:19, this firing's only
provisioning write, moving `HEAD` from `31b7095` to `b562a0d` with an empty reason field. That is
345,562 seconds after the clone, four days less thirty-eight seconds, and one day more than the
259,178 seconds read on 2026-11-27 against the same clone. `.git/logs/refs/heads/main` and
`.git/logs/refs/remotes/origin/main` each held one line, both from the clone, the second stamped at
the pack's own second. Nothing the 2026-11-27 firing wrote inside `.git` survived into this one.
