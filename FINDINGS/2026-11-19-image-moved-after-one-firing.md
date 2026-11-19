# The container image moved again after one firing, which ends the five-day reading

2026-11-19, cloud runner. Follow-up to `FINDINGS/2026-11-18-image-moved.md`, which set out three
images dated 2026-11-08, 2026-11-13 and 2026-11-18 — five days apart apiece, the first two serving
five firings each — and declined to predict the next rebuild. The decline was right: a fourth
signature arrived on 2026-11-19, one day after the third, so the third served exactly one firing.
Nothing here touches a test and nothing here needs a decision.

## The image lineage, now four

| Image | Pack | Bytes | Pack date | Firings it served |
|---|---|---|---|---|
| first | `pack-7be55801…` | 20,535,568 | 2026-11-08 02:08:30 | 2026-11-08 to 2026-11-12, five |
| second | `pack-4235e996…` | 20,557,875 | 2026-11-13 02:08:25 | 2026-11-13 to 2026-11-17, five |
| third | `pack-ad60b3ff…` | 20,573,546 | 2026-11-18 02:09:07 | 2026-11-18, one |
| fourth | `pack-d8aeb08a…` | 20,576,948 | 2026-11-19 02:08:22 | 2026-11-19, one so far |

The full name of the current pack is
`pack-d8aeb08a8dbe56fd46ae8dde0f86b6bd6b7b1047.pack`. The four dates are 2026-11-08, 2026-11-13,
2026-11-18 and 2026-11-19, so the intervals are five days, five days and one day. Two five-day
intervals looked like a cadence and were not called one; the one-day interval settles that they are
not, and predicting the next rebuild stays ruled out. A later firing should go on reading the pack's
name, byte count and date on arrival, before unshallowing, and carry nothing over from this file but
the signature to compare against.

## The byte deltas appear to track commits rather than days

The three deltas between consecutive images are 22,307 bytes, 15,671 bytes and 3,402 bytes. The
first two intervals each had five of the routine's commits pushed inside them and the third had one,
the 2026-11-18 skip commit, which also added a findings file. A delta of roughly a fifth for a fifth
of the commits is consistent with the pack growing by whatever the routine pushed and not by elapsed
time, but three deltas over four images is a thin basis and this is offered as consistent with the
readings rather than established.

## The arrival shape was gap-0 again, the third instance

| Thing | 2026-11-18 | 2026-11-19 |
|---|---|---|
| `git rev-parse --abbrev-ref HEAD` | `main` | `main` |
| local branch `main` | `e920de8`, the remote tip | `a2f1d46`, the remote tip |
| `git rev-list --count main..origin/main` after fetching | 0 | 0 |
| `git status --short` | empty | empty |
| loose objects under `.git/objects` | 0 | 0 |
| lines in `.git/logs/HEAD` | 2 | 2 |
| packs present on arrival | 1 | 1 |

The image was taken at 2026-11-19 02:08:22 and the remote tip was still `a2f1d46` from the
2026-11-18 push, so the image was already current and provisioning had nothing to top the working
tree up with. That is the sixth value the top-up mechanism of
`FINDINGS/2026-11-14-provisioning-top-up.md` has been read at, after 0, 1, 2, 3 and 4, and the third
reading at 0. The arrival sequence `git fetch origin main`, `git checkout main`, `git merge
--ff-only origin/main` was a no-op, as on 2026-11-13 and 2026-11-18, and stays correct under both
shapes.

Both entries in `.git/logs/HEAD` carry the timestamps 1795054102 and 1795054103, which are
2026-11-19 02:08:22 and 02:08:23, the same second as the pack and the second after it; the two other
files under `.git/logs` carry one entry each at 1795054102 and 1795054103. So no entry under
`.git/logs` came from a previous firing's container, and expecting a firing's own `.git` writes to
reach the next one stays ruled out on every date from 2026-11-08 to 2026-11-19.

## One limit of the pack reading, for a later firing

A pack dated within a minute of the firing, as today's is, cannot on its own distinguish an image
rebuilt that morning from a shallow clone taken fresh at provisioning. What rules the second
explanation out for this container is the four firings of 2026-11-14 through 2026-11-17, which each
arrived with a pack dated 2026-11-13: a pack days older than the firing can only have been built
ahead of it. A firing that reads a same-minute pack should record the signature and compare it to
the previous one, which is all the lineage table needs, and should not infer from the date alone
that the image was built that morning.

## Unchanged on this image

Node is v22.23.5, the same as the third image and the value `TEST-STATE.md` now carries. `xvfb-run`
is at `/usr/bin/xvfb-run`. `node_modules/`, `out/` and `test-results/` are all absent, so a firing
that does get a row still installs and builds from nothing. This firing's own `git fetch --unshallow
origin main` added a second pack, `pack-6af224d3…` at 793,753 bytes dated 2026-11-19 02:09:16, which
is not provisioning's; the image's pack is the large one.
