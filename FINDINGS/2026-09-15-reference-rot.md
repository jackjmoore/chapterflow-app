# Reference rot at store level — 2026-09-15, cloud shift 6B

Workbook row 6B, run on a cloud runner from a clean checkout of `main` at `e28af58`.
`TEST-STATE.md` named shift 1B, which `TEST-SHIFT.md` lists as local-only, so the substitute
rule was taken for the fifth shift running and 6B was run instead. Linux, no display, no
installed app, Node v22.22.2, Electron 43.4.1, `ELECTRON_DISABLE_SANDBOX=1`, the final run under
`xvfb-run -a`. Raw records are in `test-results/2026-09-15-shift-6B-final/`, which is
git-ignored, so this file is the durable copy.

## The new suite

`tests/references.test.ts`, registered in `scripts/run-tests.mjs` as `references` and in
`test:build`, placed immediately after `compilestruct`. Node-hosted through
`tests/electronForNode.ts`, opens no window, asserts no timing, and works inside a temp
directory it removes afterwards.

| Suite | Host | Status | Passed / total | Seconds |
|---|---|---|---|---|
| references | node | passed | 102 / 102 | 0.1 |

The subject is the three deletes that remove something other records point at, and in every case
the cascade is split across two places: `binderStore.deleteNode` returns the document ids and
deliberately imports none of the stores holding records about them, `storyBibleStore.deleteItem`
takes the sheet and the images but not the mentions, and `src/main/index.ts` composes the rest.
A store can therefore be correct on its own while the cascade is missing a limb.

What it covers, by section:

| Section | Assertions | What it holds |
|---|---|---|
| the cascade index.ts composes | 8 | The four handler bodies — `binder:delete`, `binder:emptyTrash`, `storyBible:deleteItem`, `timeline:pruneReferences` — are read out of `src/main/index.ts` as source, and the `someStore.someCall(` names in each are compared against the set the suite itself performs. Six, five, four and five calls respectively. Each carries a control that the handler was found at all, so a renamed channel cannot pass by the extractor finding nothing to disagree with. |
| a Story Bible item delete takes its sheet, its images and its mentions | 24 | The item leaves the index, its sheet file leaves disk, both images its sheet referenced leave disk, and no mention record names it — the manual one included. The neighbouring item keeps its record, its sheet, its image and its mention records byte for byte. Its name and its alias stop being claimed in the suppression list while the neighbour's name stays claimed. An unknown id leaves both files byte-identical; an item that never had a sheet deletes cleanly. |
| a deleted item's sheet text stops being searchable | 8 | A word planted only on one item's sheet is searchable before the delete and not after, and the other item's sheet text and both names behave the other way round. Asserted again after the index is reopened, separately, so a session-long staleness and a permanent one cannot be confused. This is the section that failed — see below. |
| a document delete clears comments, mentions and submission links | 22 | Deleting a folder returns both documents beneath it; their comments, their auto mentions and their manual mentions all go; the surviving document's comment, mention records and content file are unchanged. The submission sent from a deleted document keeps its id, recipient, notes, creation time and `documentNameAtSend` tombstone while `documentId` and `snapshotId` are nulled. The submission sent from the surviving document and the one never tied to a document are both byte-identical afterwards, `updatedAt` included. |
| emptying Trash cascades the same way | 6 | The same assertions over `binderStore.emptyTrash`, rather than trusting it to be the same code: the returned id, the comment, the mention records, both submission links, and no submission removed by either delete. |
| a delete leaves the board alone until a prune asks | 3 | Deleting a Story Bible item leaves `timeline.json` and `relationships.json` byte-identical and the entry still carrying the dead id. That is the documented policy, so it is pinned rather than assumed. |
| timeline pruning drops links to deleted items and nothing else | 31 | Five entries and three relationships against two live items and one live document. Every entry survives and in the same order; an all-valid entry keeps both links and is not restamped; an entry with one dead item keeps the live one in place; an entry with two dead items and a dead document loses all three and keeps its description; an entry with no links is untouched and unrestamped. No creation time is rewritten. Two relationships with a dead endpoint go and the live one keeps its label. A second prune returns 0 and rewrites neither file, and `binder.json` and `storybible/index.json` are byte-identical throughout. |

The control the prune section rests on is that the renderer's own `findBrokenLinks` /
`countBrokenLinks` and the prune agree about what is dead: five broken links across five entries
before, seven dead references removed in total once the two relationships are added.

## Found and fixed: a deleted item's sheet stayed in the search index

Demonstrated by the suite on 2026-09-15, not inferred. The suite was written with the assertion
in it, ran 101 of 102, and the one failure was this.

The search index is maintained by an observer registered with `atomicWrite`, so every project
write reindexes the file it touched. A delete is not a write, and the index says so in a comment
at the one place that compensates:

    /** atomicWrite never sees a delete, so documentStore reports them here. */
    export function onDocumentDeleted(documentId: string): void

`documentStore.deleteDocument` calls it. Nothing did the same for a Story Bible sheet.

Deleting an item rewrites `storybible/index.json`, which the observer does see, so the item's
name, aliases and summary dropped out of the index on their own. But its sheet's block text is a
separate source, keyed `storybible/sheets/<id>.json`, and `storyBibleSheetStore.deleteSheet`
unlinks that file silently. Those entries stayed in the index with no file behind them.

| Source | Key | Dropped when the item is deleted, before the fix |
|---|---|---|
| the item's name, aliases, summary | `storybible/index.json` | yes — the file is rewritten and the observer sees it |
| the sheet's block fields | `storybible/sheets/<id>.json` | no |

The measured effect: a word appearing only on the deleted item's sheet still returned one search
hit after the delete, pointing at an item no longer in the Story Bible. It is not permanent —
`searchIndex.open()` lists the files actually present and drops sources that vanished, so
reopening the project, restoring a backup or restarting the app clears it. The suite asserts
both halves separately, and the post-reopen assertion passed before the fix as well as after.
So the window is one session, from the delete until the next `open()`.

The fix mirrors the document path exactly, since `deleteSheet` has one caller
(`storyBibleStore.deleteItem`) and the idiom already existed:

- `searchIndex.onSheetDeleted(itemId)` drops the `storybible/sheets/<id>.json` source and
  persists, the same three lines as `onDocumentDeleted`.
- `storyBibleSheetStore.deleteSheet` calls it after the `unlink`, with the same comment.

Both are store-level changes in `src/main` with no renderer side, which is why they were made
here rather than reported. `search` (41 assertions) and `rank` (72) were run afterwards and both
pass; they are the suites that own `searchIndex.ts`.

## The suite was checked against deliberate breakage

Six deliberate mutations, with the source restored afterwards and the final run green. All six
were made on this checkout only and are not committed. The first row below is not a mutation but
the state the checkout arrived in, before the fix above, and is listed with them because it is
the same kind of evidence. Every one of the seven runs reached all 102 assertions.

| Mutation | Assertions that failed |
|---|---|
| `storyBibleSheetStore.deleteSheet` does not report the delete (the state before the fix) | 1 — the search section (1) |
| `binder:delete` in index.ts drops its `commentStore.deleteAllForDocument` line | 1 — handler composition (1) |
| `mentionStore.deleteAllForItem` spares `manual` records | 3 — item delete (3) |
| `storyBibleStore.deleteItem` deletes only the first of a sheet's images | 1 — item delete (1) |
| `timelineStore.pruneReferences` also removes entries left with no links | 7 — prune (7) |
| `submissionStore.handleDocumentDeleted` clears `documentNameAtSend` too | 1 — document delete (1) |
| `commentStore.deleteAllForDocument` drops every comment, not one document's | 2 — document delete (2) |

The second is the one that justifies the handler-composition section existing at all. The
suite's own cascades are restatements of index.ts, so dropping a line from the real handler
changes nothing the other six sections measure — that mutation is invisible to every assertion
except the one that reads the source. The fifth is the one that justifies asserting `updatedAt`
both ways: an entry that lost nothing must not be restamped, and an entry that lost something
must be.

No defect in the test itself came out of the mutation runs, the second shift running. Two came
out of writing it, both the suite mismeasuring rather than the app misbehaving, and both fixed
before the first recorded run: the default Story Bible type ids are `sb-character` and not
`character`, and `suppressedWordStore.listWords` returns lower-cased words, so a check for
`Ottiline` could never have failed.

## Recorded, not asserted: manuscript images are never deleted at all

Read from the source on 2026-09-15 and confirmed by grep, not demonstrated by a test.

`documentImageStore.deleteImage` is exported and has no caller anywhere in `src/`. There is no
`documentImage:delete` IPC channel, the preload exposes none, and `binder:delete` does not
cascade into it. So a manuscript image file under `images/` outlives the image being removed
from the text, and outlives the document being deleted.

The Story Bible side of the same feature is complete, which is what makes the gap visible:

| Path | Removing the image from a block | Replacing it | Deleting the owner |
|---|---|---|---|
| Story Bible images | `deleteStoryBibleImage` | `deleteStoryBibleImage` on the old id | `storyBibleStore.deleteItem` |
| Manuscript images | nothing | nothing | nothing |

Nothing is lost by this and nothing breaks — the files are orphans, which
`binderStore.insertSubtree`'s own comment calls the discoverable side of the trade. It is the
same category as the orphaned `.tmp-*` files recorded on 2026-09-11, and it belongs with the
deferred "sweeping orphaned files on open" item rather than with the cascades above. Left
unasserted deliberately: an assertion that the orphan survives would pin the behaviour, and a
future sweep would then arrive as a failure.

## Recorded, not asserted: the cascade runs after the binder is written

Traced through the source on 2026-09-15, not demonstrated — the same limit 2B recorded, that a
crash cannot be provoked mid-operation from inside a suite.

`binder:delete` calls `binderStore.deleteNode`, which persists `binder.json` before returning,
and only then cascades into mentions, comments and submissions. A crash in that window leaves
comment bodies and mention records naming a document that is no longer in the binder. Comment
bodies are authored content that exists nowhere else, so they are not recoverable from the text
the way a mention record is — but they are also not reachable, since every view of them starts
from a document. This is the orphan side of 2B's trade rather than the data-loss side, and it
compounds that finding rather than being a new one: `deleteNode` already writes the binder after
removing the content it owns.

## The neighbouring suites

Run in the same invocation as the new suite, one build and one bundle for the lot.

| Suite | Host | Status | Passed / total | Seconds |
|---|---|---|---|---|
| export | node | passed | 37 / 37 | 0.2 |
| compile | node | passed | 31 / 31 | 0.0 |
| compilestruct | node | passed | 66 / 66 | 1.9 |
| book | node | passed | 37 / 37 | 0.0 |
| filesystem | electron | passed | 24 / 24 | 8.0 |
| binder | electron | passed | 68 / 68 | 0.4 |
| generator | electron | passed | 76 / 76 | 0.7 |
| compilestore | electron | passed | 44 / 44 | 0.4 |
| structure | electron | passed | 59 / 59 | 0.4 |
| lexicon | electron | **failed** | 6 / 7 | 4.2 |
| search | electron | passed | 41 / 41 | 0.6 |
| rank | electron | passed | 72 / 72 | 0.6 |
| scrivmeta | node | passed | 26 / 26 | 0.1 |
| scrivrtf | node | passed | 67 / 67 | 0.2 |

Fourteen suites, 655 assertions, one failure; 757 assertions with the new suite's 102.

The `lexicon` failure is the known one. `TEST-SHIFT.md` records it as failing on one spellcheck
assertion in a fresh profile, and the assertion that failed is that one — *an unknown word is
flagged normally*, which returned an empty string because a cloud runner has no dictionary
loaded. Not news, and not spent time on.

This is the first cloud shift to run `search`, `rank` and `lexicon`. All three are marked
`needsBuild`, and `npm run build` — never invoked by the four cloud shifts before this one —
took 948 milliseconds on this runner, which is cheap enough that a cloud shift touching anything
in `src/main` should run it rather than skip the suites that need it.

`structure` took 0.4 seconds here against 10.1 on the development machine on 2026-09-10, and
`compilestore` 0.4 against 17.0 — the same two orders of magnitude the last four cloud shifts
recorded, and the same caveat: it is a comparison across two different machines and says nothing
on its own about why. `filesystem` took 8.0 seconds against 4.9 on 2026-09-14 and 0.3 on the
three shifts before it; it was again the first Electron-hosted suite in the run, so the figure is
a cold start rather than a regression. Nothing is asserted against any of these.

## Notes on running this in the cloud

`npm install --legacy-peer-deps` left `node_modules/electron` without a `dist/` for the fourth
time in five shifts. The check repaired it by itself again: `node -e "require('electron')"`
printed "Downloading Electron binary..." and then resolved to the binary path, so
`node node_modules/electron/install.js` was not needed separately.

`npm install` rewrote `package-lock.json` again, dropping the `libc` field from the same thirty
optional dependency entries. Reverted with `git checkout package-lock.json` and not in this
shift's commits. Five shifts, five times.

`xvfb-run` was present. The new suite is Node-hosted and does not need it; the six
Electron-hosted neighbours in the same invocation do.

Eight suite runs were made on this checkout — one first green-but-for-the-bug run, six mutation
runs, one final run — each re-bundling through `test:build` so the mutated source reached the
bundle. Strictly sequential, with nothing else running against
`node_modules/.cache/chapterflow-tests` at the time.

## What the next row gets from this

Row 6A (backup restore): the three cascades above are now pinned, which is what a restore has to
put back. A restore that revives `binder.json` without reviving `comments.json` and
`mentions.json` alongside it produces exactly the orphan state this suite asserts against, and
the byte-identity comparisons here are the shape to reuse.

Row 7A: `references` is cloud-capable and belongs on the routine's Node-hosted list, alongside
`compilestruct`. It is the fourth suite to exercise `src/main` without Electron and the second
through the `electronForNode.ts` shim; the shim needed no change to carry ten more stores,
including two that import `BrowserWindow` and `dialog` at the top level without calling them.

Any later row touching `src/main/index.ts`: the handler-composition section is a pattern worth
copying rather than a one-off. It costs eight assertions and it is the only thing in this suite
that can see a cascade losing a limb in the file where the cascades actually live.
