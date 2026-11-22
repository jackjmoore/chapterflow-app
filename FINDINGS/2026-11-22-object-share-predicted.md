# Loose-object share: a prediction at a gap of 3, and the object-by-object account

2026-11-22, cloud firing, sixty-seventh skip. Follows
`FINDINGS/2026-11-17-image-fifth-firing.md`, which first stated the share rule, and the
2026-11-21 log entry, which separated it from six-per-commit by arithmetic on a gap of 2.
This file records the first reading where the rule was used to predict a count before the
count was taken, and the first full attribution of every loose object to the commit that
wrote it.

## The prediction

The share rule says a commit's contribution to `.git/objects` is the closure of what that
commit touched, not a fixed six. Applied to the three commits between the image's
`a2f1d46` and the remote tip `d51903c` before any object was counted:

| Commit | Paths written | Predicted objects |
|---|---|---|
| `6883ee6` | `FINDINGS/2026-11-19-image-moved-after-one-firing.md`, `TEST-LOG.md`, `TEST-STATE.md` | 6 |
| `df8b20c` | `TEST-LOG.md`, `TEST-STATE.md` | 4 |
| `d51903c` | `TEST-LOG.md`, `TEST-STATE.md` | 4 |
| | | **14** |

`find .git/objects -type f` outside `pack/` and `info/` read 14. Six per commit would have
predicted 18.

## The attribution

Every one of the 14 objects, by type, with the commit whose
`git rev-list --objects <commit> --not a2f1d46` first introduces it:

| Object | Type | Path | Written by |
|---|---|---|---|
| `6883ee6` | commit | — | `6883ee6` |
| `df69197` | tree | root | `6883ee6` |
| `ff98605` | tree | `FINDINGS` | `6883ee6` |
| `9500aef` | blob | `FINDINGS/2026-11-19-image-moved-after-one-firing.md` | `6883ee6` |
| `3a23008` | blob | `TEST-LOG.md` | `6883ee6` |
| `6d02c67` | blob | `TEST-STATE.md` | `6883ee6` |
| `df8b20c` | commit | — | `df8b20c` |
| `27e52f8` | tree | root | `df8b20c` |
| `d888fdf` | blob | `TEST-LOG.md` | `df8b20c` |
| `9f812bc` | blob | `TEST-STATE.md` | `df8b20c` |
| `d51903c` | commit | — | `d51903c` |
| `1111a5d` | tree | root | `d51903c` |
| `d198268` | blob | `TEST-LOG.md` | `d51903c` |
| `6be7341` | blob | `TEST-STATE.md` | `d51903c` |

No object is unaccounted for and none is attributed twice.

## The mechanism

A commit in this repository writes one commit object, one root tree, and one blob per path
it changed. It writes one additional tree object for each directory below the root that it
touched. These shift commits touch no directory but `FINDINGS/`, so the only shapes available
to a skip firing are four objects when it writes a log entry and the state file, and six when
it also writes a findings file.

The reason the two later commits cost four rather than six is visible in the attribution
above: `ff98605`, the `FINDINGS` tree, and `9500aef`, the findings blob, are written once by
`6883ee6` and then reused unchanged by `df8b20c` and `d51903c`. A commit that leaves a
directory alone re-uses that directory's existing tree object and adds nothing for it. A
findings file is therefore charged once, to the commit that adds it, and never again.

This also fixes the floor and the ceiling for a firing's own writes. A skip firing that
writes no findings file adds four objects; one that writes a single findings file adds six;
one that writes two findings files in one commit would add seven, not twelve, because the
second file shares the `FINDINGS` tree the first already paid for. That last figure is
computed from the mechanism and has not been observed.

## What this does and does not settle

It settles that the share rule predicts and not merely explains: the count was derived from
three commit shapes before `find` was run, and the derived figure and the read figure are
both 14. It is the second gap at which the rule has been checked against a mix of commit
shapes, after the gap of 2 on 2026-11-21, and the first at which it was checked forwards.

It settles nothing about the arrival gap itself, which stays unpredictable for the reasons in
`FINDINGS/2026-11-15-image-held.md` and `FINDINGS/2026-11-19-image-moved-after-one-firing.md`:
the gap is the number of commits pushed since the container image was taken, and the image's
date moves without notice. The share rule converts a known gap into an expected object count.
It does not say what the gap will be.

A later firing wanting to check this needs the gap, the path list of each commit in it, and
one `find` over `.git/objects`. It does not need to re-derive the mechanism.
