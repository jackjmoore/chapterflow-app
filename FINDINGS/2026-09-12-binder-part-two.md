# Binder integration, part two — 2026-09-12, cloud shift 2B

Workbook row 2B, run on a cloud runner from a clean checkout of `main` at `31d2b2d`.
`TEST-STATE.md` named shift 1B, which `TEST-SHIFT.md` lists as local-only, so the substitute
rule was taken for the second shift running and 2B was run instead. Linux, no display, no
installed app, Node v22.22.2, Electron 43.4.1, `ELECTRON_DISABLE_SANDBOX=1`, everything
Electron-hosted under `xvfb-run -a`. Raw records are in `test-results/2026-09-12-shift-2B/` and
`test-results/2026-09-12-shift-2B-neighbours/`, both git-ignored, so this file is the durable
copy.

## The new suite

`tests/binder.test.ts`, registered in `scripts/run-tests.mjs` as `binder` and in `test:build`,
placed immediately after `filesystem`. Electron-hosted, opens no window, asserts no timing, and
works inside a temp directory it removes afterwards, so it is cloud-capable.

| Suite | Host | Status | Passed / total | Seconds |
|---|---|---|---|---|
| binder | electron | passed | 68 / 68 | 0.4 |

What it covers, by section:

| Section | Assertions | What it holds |
|---|---|---|
| delete cascade | 12 | Deleting a folder returns every document id beneath it, including a document nested under another document, and leaves nothing in `documents/`, no `snapshots/<id>` directory and no span-tag record; a document outside the subtree keeps its content, both snapshots and its span record; `lastOpenDocumentId` and the split-view reference are cleared when they pointed inside; the deletion reaches `binder.json`; a protected folder and an unknown id each delete nothing and change nothing. |
| duplicate | 14 | Every id in the copy is fresh and unique, the node count matches, the copy lands immediately after the original as a sibling, only the top node gains " Copy", content is copied at every depth, span-tag records are rebuilt for the copy without disturbing the original, synopsis/status/word target/chapter number carry across, tag ids are copied into a new array rather than shared, the copy starts with no snapshot history while the original keeps its two, a structural folder is refused, and the copy reaches `binder.json`. |
| random valid moves | 10 | Sixty seeded moves over a 26-node tree, each drawn from the destinations a drag could legitimately offer; after every one, the node count, the id set, the five structural folders' positions, the no-document-at-the-root rule and the `isTopLevel` flag discipline all hold. Then the tree round-trips through `binder.json` unchanged. Four refusals checked directly: a structural folder, a document to the root, a folder into its own descendant, and the promote/demote flag. |
| bulk insert | 12 | A five-node subtree costs exactly one `binder.json` write and returns its document ids in tree order; six invalid batches are each refused with nothing left in the tree and nothing written; an imported folder cannot arrive flagged top-level; dangling status and tag references are cleared; omitted metadata fields get defaults; a null or unresolved parent means Draft. |
| four legacy binder shapes | 20 | Pre-structure, three-folder era, pre-metadata documents, and a file with missing or wrongly typed top-level fields. Each opens, keeps its ids, order and nesting, and then holds still. |

The sixty moves carry a control assertion — "the tree actually changed over the sixty moves" —
so the invariants above cannot pass by every move having been silently refused. The duplicate
and delete sections carry the same kind of control: an untouched sibling, and the original's
snapshots.

The move count is one number worth keeping: 26 nodes, 60 moves, seed 20260912. The seed is in
the suite, so a failure reproduces exactly.

## The suite was checked against deliberate breakage

Three times, with the source restored afterwards and the final run green. All three mutations
were made on this checkout only and are not committed.

| Mutation | Assertions that failed |
|---|---|
| `deleteNode` stops cascading into snapshots and span tags; `cloneWithNewIds` reuses descendant ids | 6 — delete cascade (4), duplicate (2) |
| `insertSubtree` drops its duplicate-id and protected-id checks; `moveNode` drops the descendant guard and the `isTopLevel` delete | 7 — random moves (4), bulk insert (3) |
| `ensureStructuralFolders` stops sweeping root nodes into Draft, `normalizeTree` keeps the old `status`, and no `.pre-structure` sidecar is written | 5 — legacy shapes (5) |

Two defects in the test rather than the app came out of this, both fixed.

The first was found by the green run, not by a mutation: the control assertion for the sixty
moves compared the tree against itself. `getState()` returns the live `state.tree` array, so a
"before" snapshot taken as a reference mutates along with the tree. It is taken as a string
now. Worth knowing for any later suite: only values survive a mutation, never the array.

The second repeated 2A's finding exactly. Under the third mutation a lost node made the suite
throw and abandon the sections after it — 51 assertions reached instead of 68. Every walk that
could meet a missing node now goes through one helper that returns an empty list, so a lost
node arrives as a failed assertion. Re-checked under the same mutation: 63 passed, 5 failed,
all sections reached.

## Recorded, not asserted: write ordering around a crash

Traced through the source on 2026-09-12, not demonstrated by a test — a crash cannot be
provoked mid-operation from inside a suite, so this is a reading of the code rather than a
measurement.

`insertSubtree` states the rule the other paths can be measured against: the caller must have
written `documents/<id>.html` for every document node *before* the binder is written, because
"a crash with the binder written and the documents missing leaves a project full of chapters
that exist and are empty, which is indistinguishable from data loss; the reverse leaves orphan
files, which are discoverable and deletable."

Two paths take the other order.

| Path | Order today | A crash in the window leaves |
|---|---|---|
| `duplicateNode` | `persist()` the binder, then copy each document's content and rebuild span tags | Copies listed in the binder whose content files were never written — they open as empty documents |
| `deleteNode` | Delete content, snapshots and span tags, then `persist()` the binder | Documents still listed in the binder whose content is gone — they open as empty documents |

Both land on the side the comment calls indistinguishable from data loss, and both would land
on the discoverable side if the binder write moved to the other end. Neither loses anything
that existed before the operation: the original of a duplicate is untouched, and a delete is
what the writer asked for. The window is small and needs a crash inside it.

Whether to reorder either is a behaviour decision in `src/main`, not a defect to fix inside an
unattended shift, so nothing was changed. It is listed in "What's waiting on Jack".

One scope note on the same section: `deleteNode` cascades into documents, snapshots and span
tags only. Comments, mentions and submission links are cascaded by `index.ts` from the returned
ids, which this suite does not exercise — that is row 6B's subject, and the returned ids being
complete is asserted here.

## The neighbouring suites

Run with `--no-prepare` after the one bundle, to confirm the runner registration and the
`test:build` change disturbed nothing.

| Suite | Host | Status | Passed / total | Seconds |
|---|---|---|---|---|
| export | node | passed | 37 / 37 | 0.2 |
| compile | node | passed | 31 / 31 | 0.0 |
| book | node | passed | 37 / 37 | 0.0 |
| filesystem | electron | passed | 24 / 24 | 0.3 |
| compilestore | electron | passed | 44 / 44 | 0.4 |
| structure | electron | passed | 59 / 59 | 0.4 |
| scrivmeta | node | passed | 26 / 26 | 0.1 |
| scrivrtf | node | passed | 67 / 67 | 0.2 |

Eight of eight passed, 325 assertions, and 393 with the new suite's 68. The suites needing the
app build were not run; `npm run build` was never invoked this shift.

`structure` took 0.4 seconds here against 10.1 on the development machine on 2026-09-10, and
`compilestore` 0.4 against 17.0. That is the second shift in a row where the cloud runner came
in two orders of magnitude under the baseline on Electron-hosted suites, which continues to
make the baseline's timing-sensitive failures suspect. It is a comparison across two different
machines and says nothing on its own about why.

## Notes on running this in the cloud

Both cloud-runner problems 2A recorded happened again, in the same form. They are reliable, not
incidental.

The Electron binary did not download on `npm install --legacy-peer-deps`: the postinstall step
failed inside undici with an assertion rather than a clean error, and left
`node_modules/electron` without a `dist/`. Running `node node_modules/electron/install.js` once
more fetched it, exactly as on 2026-09-11. Check `node -e "require('electron')"` before
trusting the install; the check is cheap and the failure is silent until a suite crashes.

`npm install` rewrote `package-lock.json` again, dropping the `libc` field from the same thirty
optional dependency entries. Reverted with `git checkout package-lock.json` and not in this
shift's commits.

`xvfb-run` was present on this runner, so every Electron-hosted suite ran under it.
