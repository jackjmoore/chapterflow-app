# The container image moved again, and the gap-0 arrival shape returned

2026-11-18, cloud runner. Follow-up to `FINDINGS/2026-11-17-image-fifth-firing.md`,
`FINDINGS/2026-11-15-image-held.md` and `FINDINGS/2026-11-13-snapshot-replaced.md`. The image this
container was provisioned from is no longer the one that held for the five firings of 2026-11-13
through 2026-11-17. Nothing here needs a decision, and nothing here touches a test; the consequence
is that the pack signature has to be read on every arrival rather than carried over from the
previous firing's state file.

## The image lineage

Three images have now been seen, each identified by the pack its `.git` arrives with:

| Image | Pack | Bytes | Pack date | Firings it served |
|---|---|---|---|---|
| first | `pack-7be55801…` | 20,535,568 | 2026-11-08 02:08:30 | 2026-11-08 to 2026-11-12, five |
| second | `pack-4235e996…` | 20,557,875 | 2026-11-13 02:08:25 | 2026-11-13 to 2026-11-17, five |
| third | `pack-ad60b3ff…` | 20,573,546 | 2026-11-18 02:09:07 | 2026-11-18, one so far |

The full name of the current pack is
`pack-ad60b3ff7a50ef36ebb6e1b8046ee20138aceb56.pack`. It is 15,671 bytes larger than the second
image's, which is the same direction and rough size as the 22,307 bytes between the first and the
second, and is consistent with the routine's own commits having been added to the history the image
holds.

The three image dates are 2026-11-08, 2026-11-13 and 2026-11-18, five days apart apiece, and each
of the first two served exactly five firings. Two intervals are not enough to call that a schedule,
and predicting when the image next moves is not attempted here: the next firing should read the
pack's name, byte count and date, as `FINDINGS/2026-11-15-image-held.md` already prescribes, and
not assume a rebuild on 2026-11-23.

## The arrival shape this produced

Because the image was taken at 2026-11-18 02:09:07 and the remote tip had not moved since the
2026-11-17 firing pushed `e920de8`, the image was already current, and provisioning had nothing to
top the working tree up with. That is the second instance of the shape first seen on 2026-11-13,
and the first since the top-up mechanism was understood:

| Thing | 2026-11-17 | 2026-11-18 |
|---|---|---|
| `git rev-parse --abbrev-ref HEAD` | `HEAD` (detached) | `main` |
| local branch `main` | `4245f99`, stale | `e920de8`, the remote tip |
| `git rev-list --count main..origin/main` after fetching | 4 | 0 |
| `git status --short` | empty | empty |
| loose objects under `.git/objects` | 22 | 0 |
| lines in `.git/logs/HEAD` | 3 | 2 |
| packs present on arrival | 1 | 1 |

The arrival sequence `git fetch origin main`, `git checkout main`, `git merge --ff-only
origin/main` was a no-op this time rather than a rescue, exactly as it was on 2026-11-13. It
remains the right thing to run, for the reason `FINDINGS/2026-11-13-snapshot-replaced.md` gives:
one firing cannot establish which shape the next one gets, and the sequence is correct under all of
them.

## What this confirms

Zero loose objects is what the top-up account predicts at a gap of 0, and it is the fifth value the
mechanism of `FINDINGS/2026-11-14-provisioning-top-up.md` has now been read at — 0, 1, 2, 3 and 4
commits. The closure rule of `FINDINGS/2026-11-17-image-fifth-firing.md` holds trivially here: the
closure of no commits is no objects.

The reflog count also comes out as that file's decomposition predicts. All three files under
`.git/logs` carry one entry each except `.git/logs/HEAD`, which carries two, and every entry in all
three shares the timestamp 1794967747, which is 2026-11-18 02:09:07 — the same second as the pack:

```
0000000 -> e920de8  1794967747                                      (bootstrap fetch, origin/main)
0000000 -> e920de8  1794967747  branch: Created from refs/remotes/origin/main
0000000 -> e920de8  1794967747                                      (HEAD, bootstrap detach)
e920de8 -> e920de8  1794967747  checkout: moving from e920de8 to main
```

So the three entries read in `.git/logs/HEAD` on 2026-11-17 were the image's two plus the top-up's
one, as that file states, and with no top-up there are two. A later firing should expect two at a
gap of 0 and three when the image is behind, and should read the count rather than assume either.

The conclusion the reflog counting has served since 2026-11-08 is unchanged and unweakened: no
entry under `.git/logs` was written by a previous firing's container, so expecting a firing's own
`.git` writes to reach the next one stays ruled out, now on every date from 2026-11-08 to
2026-11-18.

## One correction

`TEST-STATE.md` has carried Node v22.23.4 since 2026-11-16. The third image has Node v22.23.5.
`xvfb-run` is still at `/usr/bin/xvfb-run`, and `node_modules/`, `out/` and `test-results/` are
still all absent, so a firing that does get a row still installs and builds from nothing.

## A note on the second pack

Two packs were present by the end of this firing, not one. The second,
`pack-c4b0c729…` at 791,139 bytes dated 2026-11-18 02:09:56, is this firing's own `git fetch
--unshallow origin main` and not provisioning's. A later firing reading the pack signature should
take it before unshallowing, or distinguish the two by date; the image's pack is the large one.
