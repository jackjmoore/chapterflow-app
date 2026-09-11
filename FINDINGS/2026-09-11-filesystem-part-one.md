# Filesystem integration, part one — 2026-09-11, cloud shift 2A

Workbook row 2A, run on a cloud runner from a clean checkout of `main` at `66b0084`.
`TEST-STATE.md` named shift 1B, which `TEST-SHIFT.md` lists as local-only, so the substitute
rule was taken and 2A was run instead. Linux, no display, no installed app, Node v22.22.2,
Electron 43.4.1, `ELECTRON_DISABLE_SANDBOX=1`, everything Electron-hosted under `xvfb-run -a`.
Raw records are in `test-results/2026-09-11-shift-2A/`, which is git-ignored, so this file is
the durable copy.

## The new suite

`tests/filesystem.test.ts`, registered in `scripts/run-tests.mjs` as `filesystem` and in
`test:build`. Electron-hosted, opens no window, asserts no timing, and works inside a temp
directory it removes afterwards, so it is cloud-capable.

| Suite | Host | Status | Passed / total | Seconds |
|---|---|---|---|---|
| filesystem | electron | passed | 24 / 24 | 0.4 |

What it covers, by section:

| Section | Assertions | What it holds |
|---|---|---|
| write ordering under contention | 5 | Twelve unawaited writes to one path complete in the order queued and the last one is what stays on disk; a second path is unaffected; parent directories are created; no temp file is left after a successful write. |
| a failed write | 3 | A write that cannot land rejects rather than resolving; the observer is not told about it; a later write to the same path still runs, so a rejection does not poison the queue. |
| observer failure never fails a save | 6 | A throwing observer neither rejects the save nor stops the file being written, and is still called on the next write; the observer is handed the exact bytes; clearing it stops notification. |
| binder guard | 6 | An unparseable binder, a binder with no usable tree, and a binder that exists but cannot be read each survive three mutations untouched; a readable binder is still written; switching project roots clears the block. |
| story bible guard | 4 | The same three for `storybible/index.json`, plus the readable control. |
| stores without the guard | 0, recorded | See below. |

Two of the six sections carry a control assertion — "a readable binder is still written to",
"a readable index is still written to" — so the guard sections cannot pass by the store having
quietly stopped writing at all.

## The suite was checked against deliberate breakage

Twice, with the source restored afterwards and the final run green. Both mutations were made on
this checkout only and are not committed.

| Mutation | Assertions that failed |
|---|---|
| `atomicWrite` writes directly instead of through the per-path queue, and `persist()` in `binderStore` loses its `loadFailed` return | 5 — write ordering (2), binder guard (3) |
| Only the `loadFailed` return removed, in both `binderStore` and `storyBibleStore` | 5 — binder guard (3), story bible guard (2) |

The first mutation also showed a defect in the test rather than the app: a guard failure made
`setLastOpenDocument` reject, which threw out of the suite and abandoned the three sections
after it. `pokeBinder` now swallows each rejection, so a missing guard arrives as failed
assertions and the suite still completes its 24. Re-checked under the second mutation: 19
passed, 5 failed, all sections reached.

## Which stores have the guard

Read from the source on 2026-09-11. The guard is the `loadFailed` flag that makes `persist()`
refuse to write when the file on disk exists but could not be read or understood.

| Store | File | Guard |
|---|---|---|
| binderStore | `binder.json` | yes |
| storyBibleStore | `storybible/index.json` | yes |
| commentStore | `comments.json` | no |
| compileSettingsStore | `compile.json` | no |
| compileStore | `compiles/` index | no |
| lexiconStore | `lexicon.json` | no |
| mentionStore | `mentions.json` | no |
| relationshipStore | `relationships.json` | no |
| searchHistoryStore | `searchHistory.json` | no |
| sessionStore | `sessions.json` | no |
| snapshotStore | `snapshots/<id>` index | no |
| spanTagStore | `spanTags.json` | no |
| sprintStore | `sprints.json` | no |
| storyBibleSheetStore | `storybible/sheets/<id>.json` | no |
| submissionStore | `submissions.json` | no |
| suppressedWordStore | `suppressedWords.json` | no |
| timelineStore | `timeline.json` | no |

The fifteen without it share one shape: read the file, fall back to an empty file when the read
or the parse throws, modify, write the whole file back. Demonstrated for one of them and
recorded rather than asserted — `mentions.json` seeded with two records, then replaced with
truncated JSON, then one further `setManualMention`, and the file came back with one record and
no trace of the other two.

The risk this poses is not corrupt content, which is already lost, but a transient read error:
the comment on `binderStore.loadFailed` names a sync client or a scanner holding the file for a
moment, and on that path a perfectly good file is read as empty and written back empty. Whether
the other fifteen should refuse the write too is a behaviour decision, not a defect to fix
inside a test shift, so nothing was changed. It is the first item in "What's waiting on Jack".

## Recorded, not asserted

A write whose rename fails leaves its temp file beside the target: one `blocked.json.tmp-*`
remained after the failed write in this run. `atomicWrite` has no cleanup on the failure path.
This is the same behaviour the deferred "sweeping orphaned `.tmp-*` files on open" item is
about, and it also says those orphans can be created by a live failure and not only by a crash.

## Notes on running this in the cloud

Three things cost time and are worth knowing before the next cloud shift.

The Electron binary did not download on the first `npm install --legacy-peer-deps`: the postinstall
step returned 502 from `release-assets.githubusercontent.com` and left
`node_modules/electron` without a `dist/`. Running `node node_modules/electron/install.js` once
more fetched it. A cloud shift should check `node -e "require('electron')"` before trusting the
install.

`npm install` on this runner rewrote `package-lock.json`, dropping the `libc` field from thirty
optional dependency entries — an artifact of the runner's npm being older than the one that
wrote the lockfile. It was reverted with `git checkout package-lock.json` and is not in the
shift's commit. A cloud shift should check for this before committing.

The runner is faster than the development machine on the same work, which bears on the timing
question the baseline left open: `compilestore` took 0.5 s here against 17.0 s on 2026-09-10.
Five other suites were run alongside it to confirm the runner change did not disturb them —
export, compile, book, scrivmeta, scrivrtf — all passed, 242 assertions across the six. The
suites needing the app build were not run; `npm run build` was never invoked this shift.
