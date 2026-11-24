# A fifth container image, and what the arrival reflog can settle that the pack date cannot

2026-11-24, cloud runner. Follow-up to `FINDINGS/2026-11-19-image-moved-after-one-firing.md`, which
set out four images and closed with a limit: a pack dated within a minute of the firing cannot on its
own tell an image rebuilt that morning from a shallow clone taken fresh at provisioning. A fifth
signature arrived today, again within a minute of the firing, so the limit applies again. This file
records the signature, a fourth byte delta that does not help the per-commit reading, and one thing
read on arrival today that a later firing can use to settle the ambiguity. Nothing here touches a
test and nothing here needs a decision.

## The image lineage, now five

| Image | Pack | Bytes | Pack date | Firings it served |
|---|---|---|---|---|
| first | `pack-7be55801…` | 20,535,568 | 2026-11-08 02:08:30 | 2026-11-08 to 2026-11-12, five |
| second | `pack-4235e996…` | 20,557,875 | 2026-11-13 02:08:25 | 2026-11-13 to 2026-11-17, five |
| third | `pack-ad60b3ff…` | 20,573,546 | 2026-11-18 02:09:07 | 2026-11-18, one |
| fourth | `pack-d8aeb08a…` | 20,576,948 | 2026-11-19 02:08:22 | 2026-11-19 to 2026-11-23, five |
| fifth | `pack-2f686ef4…` | 20,592,486 | 2026-11-24 02:08:58 | 2026-11-24, one so far |

The full name of the current pack is
`pack-2f686ef4fec618d231ab41ca128b5a7b52b964d6.pack`. The five dates are 2026-11-08, 2026-11-13,
2026-11-18, 2026-11-19 and 2026-11-24, so the intervals are five days, five days, one day and five
days. Three fives and a one still fit no schedule, and predicting the next rebuild stays ruled out;
the reason is now stronger than it was on 2026-11-19, because a cadence of five days would have
required the fourth image not to exist. The fourth served five firings, which equals the first and
the second and is the longest run observed. A later firing should read the pack's name, byte count
and date on arrival, before unshallowing, and carry nothing over from this file but the signature.

## The fourth byte delta does not tighten the per-commit reading

| Interval | Commits pushed inside it | Byte delta | Bytes per commit |
|---|---|---|---|
| first to second | 5 | 22,307 | 4,461 |
| second to third | 5 | 15,671 | 3,134 |
| third to fourth | 1 | 3,402 | 3,402 |
| fourth to fifth | 6 | 15,538 | 2,590 |

The six commits between the fourth image and the fifth are `6883ee6`, `df8b20c`, `d51903c`,
`9d4e624`, `39948f5` and `31b7095`, read with `git log --oneline a2f1d46..31b7095`; three of them
added a findings file and three did not. The 2026-11-19 file offered the delta as tracking commits
rather than days, as consistent with the readings rather than established. Today's delta is the first
that points the other way on its own terms: six commits bought fewer bytes than five did in the
second interval, and the per-commit figure has fallen at every reading. Pack size is a function of
compression across the whole history, not a sum of per-commit costs, so a per-commit figure was
always a weak instrument. It is recorded here to close the question rather than to carry it forward:
the deltas are all positive and all between three and twenty-three kilobytes, and that is as much as
four of them support.

## The arrival shape was gap-0, the fourth such reading

| Thing | 2026-11-24 |
|---|---|
| `git rev-parse --abbrev-ref HEAD` | `main` |
| local branch `main` | `31b7095`, the remote tip |
| `git rev-list --count main..origin/main` after fetching | 0 |
| `git status --short` | empty |
| loose objects under `.git/objects` | 0 |
| lines in `.git/logs/HEAD` | 2 |
| packs present on arrival | 1 |

That is the fourth gap-0 arrival in seventeen readings since 2026-11-08, after 2026-11-13,
2026-11-18 and 2026-11-19, and the thirteen others were the detached shape. The image was taken at
02:08:58 with the remote tip already at `31b7095` from the 2026-11-23 correction push, so
provisioning had nothing to top the working tree up with, and the sequence `git fetch origin main`,
`git checkout main`, `git merge --ff-only origin/main` was a no-op as it was on the three earlier
gap-0 dates. Zero loose objects is what the share rule of `FINDINGS/2026-11-17-image-fifth-firing.md`
gives at a gap of 0, since no commit is outside the pack; this is the fourth reading at that value
and it is an accounting, not a prediction, the count having been read before the gap.

## The reflog verb, which is new and is for a later firing

`.git/logs/refs/remotes/origin/main` held one line on arrival, and its message is the command that
wrote the pack:

```
fetch --no-progress --depth 50 origin main: storing head
```

stamped 1795486138, which is 2026-11-24 02:08:58, the same second as the pack. `.git/logs/HEAD` held
two lines, stamped 1795486138 and 1795486139, and `.git/logs/refs/heads/main` one, stamped
1795486139 and reading `branch: Created from refs/remotes/origin/main`. So the clone is a depth-50
fetch, which is also why `git rev-parse --is-shallow-repository` reads true on arrival and why any
comparison to `da85a6b` needs `git fetch --unshallow origin main` first.

This does not by itself resolve the 2026-11-19 limit, and it is not offered as doing so. What it
gives a later firing is a check that would. If a firing arrives with a pack dated days before it —
as 2026-11-14 through 2026-11-17 and 2026-11-20 through 2026-11-23 all did — and that firing reads
`.git/logs/refs/remotes/origin/main` and finds this same `fetch --no-progress --depth 50 origin main`
line stamped at the pack's own second rather than at the firing's, then the depth-50 clone is part of
the image build, the reflog travels inside the image, and a same-minute pack means a rebuild that
morning and not a provisioning-time clone. If instead that firing finds the line stamped at its own
second, the clone runs at provisioning on every container, and the pack date is simply the
provisioning date, which would make the whole lineage table above a record of clone times rather than
of image builds. No reading before today quoted the reflog message, so neither outcome is in the
record yet, and the first firing to arrive with a pack older than itself can settle it in one `cat`.

## Unchanged on this image

Node is v22.23.5, the same as the third and fourth images. `xvfb-run` is at `/usr/bin/xvfb-run`.
`node_modules/`, `out/` and `test-results/` are all absent, so a firing that does get a row still
installs and builds from nothing. `src/` and `tests/` are unchanged since `da85a6b`, confirmed by an
empty `git diff --stat da85a6b HEAD -- src tests` after unshallowing; the history is 104 commits from
the root, with `da85a6b` 70 back and `3e416c5` 89. This firing's own unshallow added a second pack,
`pack-870c5d6988e1f2bff04fca7c4cd02c29550f1455.pack` at 807,905 bytes dated 2026-11-24 02:09:55,
which is not provisioning's; the image's pack is the large one.
