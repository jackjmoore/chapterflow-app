# Compile structure, txt, Markdown and docx — 2026-09-14, cloud shift 4A

Workbook row 4A, run on a cloud runner from a clean checkout of `main` at `b80f321`.
`TEST-STATE.md` named shift 1B, which `TEST-SHIFT.md` lists as local-only, so the substitute
rule was taken for the fourth shift running and 4A was run instead. Linux, no display, no
installed app, Node v22.22.2, Electron 43.4.1, `ELECTRON_DISABLE_SANDBOX=1`, the whole runner
under `xvfb-run -a`. Raw records are in `test-results/2026-09-14-shift-4A-final/`, which is
git-ignored, so this file is the durable copy.

## The new suite

`tests/compileStructure.test.ts`, registered in `scripts/run-tests.mjs` as `compilestruct` and
in `test:build`, placed immediately after `compile`. Node-hosted, opens no window, asserts no
timing, works inside a temp directory it removes afterwards.

| Suite | Host | Status | Passed / total | Seconds |
|---|---|---|---|---|
| compilestruct | node | passed | 66 / 66 | 2.5 |

It compiles the generator's Realistic shape — 4 parts, 48 chapters, 120,000 planted Draft
words, a Matter folder of three documents — to all three formats and reads the result back.
One full compile is 840,639 bytes of plain text and 3,362 docx paragraphs; three formats at
that size take about a second, so the suite affords six full compiles rather than sharing one.

What it covers, by section:

| Section | Assertions | What it holds |
|---|---|---|
| one section per node in scope | 10 | The output has one section per binder node and no more, in all three formats, and the Contents lists each once. Depth survives: parts are level 1 and chapters level 2 (`Heading1`/`Heading2` in the docx). Both formats that can be counted exactly are: every docx heading paragraph is either one of the 52 structural headings or one of the 48 documents' own `<h1>`, and every Markdown heading line is the title, the Contents caption, one of 52 sections or one of 48 documents. A chapter compiled twice has nowhere to hide. |
| a partial scope compiles exactly its scope | 9 | Parts One and Three and their chapters — 26 nodes, 24 documents. All three formats carry 26 sections, the Contents shrinks with the scope, and an excluded chapter is gone in both its heading and its prose, which are separately checkable and separately breakable. |
| word parity against the planted counts | 9 | The count a compile records is the planted Draft total exactly, for the whole manuscript and for a one-part scope computed from the truth file's per-document counts. Each artifact is within 2% of the manuscript and never below it. |
| the last paragraph of the last document | 7 | The last paragraph of chapter 48 is present in all three formats, is the last thing in the `.txt` file, and is the last docx paragraph with text in it. A sentence that was never planted is absent, so the search can fail. |
| front matter, manuscript, back matter | 22 | Front matter precedes the manuscript and back matter follows the last chapter in all three formats; matter adds only its own documents' headings and nothing to the Contents; matter words stay out of the recorded count while the matter itself is genuinely in the file. Where the formats disagree about the Contents, both sides are pinned — see below. |
| an empty document gives an empty section | 11 | A document created in the binder and never typed into keeps its section, its heading and its Contents entry in all three formats, with no body between it and the next section, and contributes no words. The two documents that do have content still compile. |

### Stated tolerances

The recorded body count is compared **exactly**: both sides are `countWords` over the same
visible text, so any difference at all is a renderer eating or inventing a word. The artifacts
themselves are allowed **2%**, because they carry scaffolding the manuscript does not — the
project title, the word "Contents", every Contents entry, every section heading.

What the scaffolding actually costs, on 120,000 words:

| Format | Words | Over the manuscript |
|---|---|---|
| txt | 120,402 | +402 |
| md | 120,451 | +451 |
| docx | 120,150 | +150 |

So 2% is about six times the real figure, and still well under one missing chapter, which on
this shape averages 2,500 words — 2.1% of the manuscript. A shortfall is treated separately and
not tolerated at all: each artifact must be the manuscript **plus** its scaffolding, never less.

## The suite was checked against deliberate breakage

Five times, with the source restored afterwards and the final run green. All five mutations
were made on this checkout only and are not committed. Every run reached all 66 assertions.

| Mutation | Assertions that failed |
|---|---|
| `buildProjectContent` skips a document whose blocks are empty | 6 — the empty document (6) |
| `projectToMarkdown` emits a section heading for matter sections too | 1 — matter (1) |
| `projectToPlainText` loses the last section | 11 — section counts (1), partial scope (1), word parity (2), last paragraph (2), matter (2), empty document (3) |
| the recorded word count stops excluding matter | 1 — matter (1) |
| `blocksToPlainText` drops heading text | 3 — word parity (2), matter (1) |

The fifth is the one that justifies the exact tolerance. Dropping every document's own `<h1>`
from the plain-text render loses 91 words out of 120,000 — 0.08%, inside any percentage
tolerance anyone would write down, and caught only because the body count is asserted to the
word.

No defect in the test itself came out of the mutation runs, which is the first time in four
shifts. Three did come out of the first green run, all of them the suite mismeasuring rather
than the app misbehaving, and all fixed before the run above: the Markdown heading level for a
chapter is `##` and not `###`; a hand-built fixture whose documents carried an `<h1>` matching
their binder name made "count the structural headings" ambiguous, so those documents are prose
only now; and matter documents legitimately repeat their binder name in their own `<h1>`, so
"no matter document becomes a section heading" is measured as a difference against the same
compile without matter rather than by looking for the name.

## Found: front matter sits on different sides of the Contents in different formats

Demonstrated by the suite on 2026-09-14, not inferred.

`projectToPdfHtml` splits the leading matter sections off and emits them before the Contents,
with the reason in a comment at the place that does it: *"Front matter before the Contents — a
title page after a Contents page would read backwards."* `projectToDocxBuffer` does the same
split, for the same reason. `projectToPlainText` and `projectToMarkdown` do neither. They build
the Contents block first, before the loop over `content.sections`, and then emit every section
in order — matter included.

| Format | Order |
|---|---|
| pdf | front matter, Contents, manuscript, back matter |
| docx | front matter, Contents, manuscript, back matter |
| txt | Contents, front matter, manuscript, back matter |
| md | Contents, front matter, manuscript, back matter |

So compiling the same project to docx and to Markdown gives a title page on opposite sides of
the table of contents. Back matter is consistent in all four: it follows the manuscript
everywhere, because sections order alone puts it there.

Nothing is lost and nothing is duplicated — the assertions for presence, word parity and
Contents membership all hold for txt and md. It is an ordering difference only, and whether the
two text formats should follow the paged ones is a decision about compiled output rather than a
defect with an obvious fix, so nothing was changed. Both orders are asserted in the suite as
they stand today, the plain-text and Markdown one labelled as the disagreement it is, so a
change to either side arrives as a failure rather than silently. It is listed in "What's
waiting on Jack".

Two smaller observations from the same section, neither of them problems:

- A matter document's own `<h1>` does become a heading in the output. That is the matter page's
  own text and not the binder's name for it, but it means "Title page" appears as `# Title page`
  in the Markdown while the binder name contributes nothing — the two are indistinguishable by
  reading the output, which is why the assertion counts the difference against a matter-less
  compile instead.
- `documentSeparation` was left at its default for every compile here. It moves page breaks and
  scene markers, which plain text and Markdown ignore by design, so it changes nothing this
  suite measures. The docx side of it belongs with row 4B's paged assertions.

## Recorded, not asserted: the project-level renderers are one import away from Node

`src/main/export/index.ts` reaches `documentStore`, which reaches `projectRoot`, which computes
its default root from `app.getPath('documents')` at module load. Nothing on the txt, Markdown or
docx path calls a BrowserWindow — `toPdf` and `bookPdf` are imported but never entered, and
`getImageDataUris` returns immediately for a project with no images — so that one top-level call
is the whole of what kept the project-level renderers out of a Node host.

`tests/electronForNode.ts` stands in for the `electron` module for this one suite, through
`--alias:electron=` in a second `esbuild` invocation in `test:build`. `getPath` returns a real
temporary path that nothing should read, because a suite using the shim sets its own project
root before it touches a store; everything else throws by name, so a test that strays onto a
path genuinely needing Electron fails saying which call it was.

The alternative was to host the suite in Electron, as `compilestore` is. That would have worked
and cost nothing, but the row asked for Node and the distinction is worth keeping: what runs
without a window is what a cloud shift can run, and this is now the second Node-hosted suite
that exercises main-process code rather than shared code.

`compilestore` is unaffected and still Electron-hosted. The shim is used by `compilestruct`
alone, and the main `esbuild` invocation still passes `--external:electron` for every other
suite.

## The neighbouring suites

Run in the same invocation as the new suite, one bundle for the lot, to confirm the runner
registration and the `test:build` change disturbed nothing.

| Suite | Host | Status | Passed / total | Seconds |
|---|---|---|---|---|
| export | node | passed | 37 / 37 | 0.2 |
| compile | node | passed | 31 / 31 | 0.0 |
| book | node | passed | 37 / 37 | 0.1 |
| filesystem | electron | passed | 24 / 24 | 4.9 |
| binder | electron | passed | 68 / 68 | 0.5 |
| generator | electron | passed | 76 / 76 | 1.1 |
| compilestore | electron | passed | 44 / 44 | 0.5 |
| structure | electron | passed | 59 / 59 | 0.4 |
| scrivmeta | node | passed | 26 / 26 | 0.1 |
| scrivrtf | node | passed | 67 / 67 | 0.3 |

Ten of ten passed, 469 assertions, and 535 with the new suite's 66. The suites needing the app
build were not run; `npm run build` was never invoked this shift.

`structure` took 0.4 seconds here against 10.1 on the development machine on 2026-09-10, and
`compilestore` 0.5 against 17.0 — the same two orders of magnitude the last three cloud shifts
recorded, and the same caveat: it is a comparison across two different machines and says
nothing on its own about why. `filesystem` took 4.9 seconds against 0.3 on the last three cloud
shifts; it was the first Electron-hosted suite in the run and the figure is a cold start, not a
regression. Nothing is asserted against any of these.

## Notes on running this in the cloud

`npm install --legacy-peer-deps` left `node_modules/electron` without a `dist/` again, as on
2026-09-11 and 2026-09-12 but not 2026-09-13. The check itself fixed it: `node -e
"require('electron')"` printed "Downloading Electron binary..." and then resolved, so the
postinstall's own retry path ran and `node node_modules/electron/install.js` was not needed
separately. Run the check before trusting the install; it is cheap, and on this runner it is
also the repair.

`npm install` rewrote `package-lock.json` again, dropping the `libc` field from the same thirty
optional dependency entries. Reverted with `git checkout package-lock.json` and not in this
shift's commits. Four shifts, four times.

`xvfb-run` was present, so the whole runner ran under it. The Node-hosted suite does not need
it; the seven Electron-hosted neighbours in the same invocation do.

Five suite runs were made on this checkout during the mutation checks, each re-bundling through
`test:build` so the mutated source reached the bundle. That is not the case `TEST-SHIFT.md`'s
one-bundle rule is about — the runs were strictly sequential and nothing else was running
against `node_modules/.cache/chapterflow-tests` at the time.

## What the next row gets from this

Row 4B: the structure assertions above are format-agnostic and the PDF path can reuse all of
them through outline entries — the section-count, scope, last-paragraph and matter-order
sections need only a different reader. The front-matter ordering question above is settled for
PDF already: `projectToPdfHtml` puts front matter first, so 4B should assert that rather than
re-open it. `documentSeparation` is untouched here and is genuinely paged, so it belongs to 4B.

Row 6B and later Node-hosted rows: `tests/electronForNode.ts` and the aliased `esbuild` step in
`test:build` are there to be reused. Anything in `src/main` that does not open a window can now
be tested without Electron; the thing to check first is whether the module reaches an `app`
call at load time, as `projectRoot` does.

Row 7A: `compilestruct` is cloud-capable and belongs on the routine's Node-hosted list.
