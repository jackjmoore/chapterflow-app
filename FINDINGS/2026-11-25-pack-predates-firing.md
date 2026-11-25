# The depth-50 clone belongs to the image build, not to provisioning

2026-11-25, cloud firing, seventieth skip. Follows
`FINDINGS/2026-11-24-fifth-image.md`, which set the check this file runs, and
`FINDINGS/2026-11-19-image-moved-after-one-firing.md`, which set the limit it removes.

## What was open

The 2026-11-19 file recorded that a pack dated within a minute of the firing that reads it
cannot on its own tell two things apart: the container image having been rebuilt at that
moment, or provisioning cloning the repository afresh at the start of every session. On the
five image dates to 2026-11-24 the pack was always same-minute, so the two readings fit every
observation equally. The 2026-11-24 file turned that into a one-command check and named the
firing that could run it: the first one to arrive with a pack dated days, not seconds, before
itself should read `.git/logs/refs/remotes/origin/main` and see which second the depth-50
fetch line carries.

This firing is that one. The pack is a day old.

## What was read

| Reading | Value |
|---|---|
| Pack name | `pack-2f686ef4fec618d231ab41ca128b5a7b52b964d6.pack` |
| Pack bytes | 20,592,486 |
| Pack mtime, epoch | 1795486137 |
| Pack mtime, UTC | 2026-11-24 02:08:57 |
| `origin/main` reflog, message | `fetch --no-progress --depth 50 origin main: storing head` |
| `origin/main` reflog, epoch | 1795486137 |
| `heads/main` reflog, message | `branch: Created from refs/remotes/origin/main` |
| `heads/main` reflog, epoch | 1795486138 |
| Third `.git/logs/HEAD` line, epoch | 1795572490 |
| Third `.git/logs/HEAD` line, UTC | 2026-11-25 02:08:10 |
| Pack second to that line | 86,353 seconds |

The pack's name and byte count are the fifth image's, unchanged from 2026-11-24, so the image
held for a second firing rather than moving.

## What it settles

The depth-50 fetch line is stamped at the pack's own second, 1795486137, and both sit 86,353
seconds — just under twenty-four hours — before the only `.git` write this firing's
provisioning made. Provisioning therefore does not clone. It moved `HEAD` from the image's
commit `31b7095` to the remote tip `deedd80` and wrote the six objects that move needed, and
it wrote nothing else: the two reflog lines from the clone are the image build's, carried in
the image.

So a pack dated in a firing's own minute means the image was built in that minute. The first
of the two readings is correct and the second is ruled out. Pack date is build time, and the
five image dates of 2026-11-08, 2026-11-13, 2026-11-18, 2026-11-19 and 2026-11-24 can be read
as rebuild times without the caution attached. Predicting when the next rebuild falls stays
ruled out; the intervals of five, five, one and five days fit no schedule, and the image
holding on 2026-11-25 adds a sixth firing-day without a sixth signature.

## A one-second discrepancy with the 2026-11-24 entry

The 2026-11-24 log entry records the `origin/main` line at 1795486138 and the `heads/main`
line at 1795486139. Read directly today from the same image, they are 1795486137 and
1795486138. The image is byte-identical by pack name and size, so the files cannot have
changed and one of the two readings is off by one second; today's came from `cat` on the
reflog and `stat -c %Y` on the pack, which agree with each other exactly. The conclusion does
not turn on it either way, because under both readings the fetch line carries the same second
as the pack. Earlier entries are not edited, so this paragraph is the correction.

## Arrival shape, for the record

Detached `HEAD` at the remote tip `deedd80` with `main` and `origin/main` both stale at
`31b7095`, clean `git status --short`, six loose objects, three lines in `.git/logs/HEAD`, one
pack. `git rev-list --count main..origin/main` read 1 after the fetch. That is the
image-behind shape, the fourteenth such reading in eighteen since 2026-11-08 against four
gap-0 ones, and the sequence `git fetch origin main`, `git checkout main`, `git merge --ff-only
origin/main` was a rescue rather than a no-op.

The six loose objects were counted at arrival, before the gap was known, and the share rule of
`FINDINGS/2026-11-17-image-fifth-firing.md` accounts for all six against the one commit
pushed since the image was taken: commit `deedd80`, its root tree `4150051`, the `FINDINGS`
tree `20faeec`, and the three blobs `d919deb`, `abf8606` and `cd414ee` for
`FINDINGS/2026-11-24-fifth-image.md`, `TEST-LOG.md` and `TEST-STATE.md`. Six is what the rule
gives for one commit that writes a findings file, and six is what was there.

## Not established

That every future image carries exactly one depth-50 clone in its reflogs. Three log files
with one line each is what all six image-dated readings since 2026-11-08 have shown, but
nothing here says how the image is built, only when this one's clone ran.
