# Typing and pagination performance harness

Measures what typing costs in the built app on a 100,000-word document, over the
DevTools protocol, with real key events. Exists because "smooth" is not a
testable claim: these scripts turn it into keystroke cost, frame gaps, long
tasks and pagination pass durations that can be compared before and after a
change.

```
npm run build
node tools/perf/seed.mjs <scratch dir>            # 100,000 words in one document
node tools/perf/measure.mjs <scratch dir> --label after
node tools/perf/trace.mjs <scratch dir> [--fine]  # Chromium's own event names
```

`measure.mjs` types 180 keystrokes at 60ms intervals in three scenarios and
reports, per scenario, the main-thread time per keystroke (the CDP round trip
of the keyDown dispatch), animation-frame gaps, long tasks, and the app's own
`chf:paginate` / `chf:apply-breaks` performance measures. Pass
`--profile out.json` for a CPU profile aggregated by function; build with
`build: { minify: false }` in the renderer section of electron.vite.config.ts
first, or the names are mangled. Do not run anything else Electron-shaped at
the same time, and discard any run the script flags as having seen too few
animation frames: a window covered by another one is throttled by Chromium
and measures nothing real.

## Recorded on 6 September 2026

Same machine, same seeded document (100,050 words, 1,116 paragraphs, 208 A4
pages). Scenario A appends at the end of the document; B types a full line into
paragraph 40 so every later page break moves; C is one keystroke then a pause.

| | before | after |
| --- | --- | --- |
| A keystroke p50 / p95 / max | 18.9 / 52.6 / 105.6 ms | 17.5 / 26.4 / 63.2 ms |
| A frames over 33 ms / over 100 ms | 23 / 4 | 2 / 0 |
| A long tasks (count, total) | 22, 1,635 ms | 0 |
| A pagination pass mean / max | 55.1 / 85.5 ms | 5.3 / 8.5 ms |
| B keystroke p50 / p95 / max | 20.8 / 76.8 / 366.5 ms | 17.2 / 25.6 / 71.8 ms |
| B long tasks (count, total) | 29, 2,815 ms | 0 |
| B pagination pass mean / max | 78.9 / 343.0 ms | 7.6 / 21.9 ms |
| B applying shifted breaks, max | 81.0 ms | 16.8 ms |
| B pass after the last keystroke | 343 ms, landed 711 ms later | 22 ms, landed 289 ms later |
| C single pass after one keystroke | 541.7 ms | 7.4 ms |

A second "after" run on the finished build (with the fonts and Hemingway mode
in) read A p50 22.3 / p95 33.7 / max 98.1 ms, still with no long tasks and
pagination passes of 6 to 10 ms; run-to-run spread on this machine is a few
milliseconds at the median.

### What the time was, and what it is now

A CPU profile over scenario A attributed the before-state to four things, all of
them whole-document work done to answer a question about one paragraph:

- `paginate()` re-parsed the whole document's HTML into a hidden node and laid
  it out again on every pass (1.86 s of an 11 s burst, 81 ms a pass), after
  `editor.getHTML()` had rebuilt that HTML (18 ms a pass).
- The pagination plugin rebuilt its 207 gap widgets on every transaction, and
  ProseMirror then re-checked every block's decorations (about 6 ms a
  keystroke).
- The footnote plugin walked every node to renumber footnotes on every view
  update (about 1 ms a keystroke); the spellcheck-suppression plugin re-scanned
  the whole text per keystroke in any project with a Story Bible; tiptap's
  Placeholder walked every node to find empty ones.

Now the measurement rig keeps a persistent copy of the document and swaps only
the blocks whose serialized HTML changed (per-node HTML is cached on the
immutable ProseMirror nodes), resumes the break arithmetic from the first
changed block, and reuses the unchanged tail when the edit did not move it. Gap
widgets live in plugin state and are mapped through edits; footnote numbering
and suppression decorations are mapped too and rebuilt only for what a
transaction touched; the placeholder checks the first block alone.

### What remains, and why it was left

With the JavaScript side reduced to a few milliseconds, a Chromium trace of the
same burst shows the remaining per-keystroke cost inside
`TypingCommand::InsertText`: `FrameSelection::SetSelection` (about 6 ms) and
`WidgetBase::UpdateTextInputStateInternal` (about 6 ms, the text-input state
Chromium keeps for the IME, computed over the whole editable). The same
keystrokes on a 528-word document cost about 12 ms p50 against 19 to 22 ms on
100,000 words, so roughly 8 to 10 ms a keystroke is document-size dependent
and lives in Blink's contenteditable handling, not in app code. It is the same
in continuous mode, so it is not caused by the page-gap widgets. Only splitting
the editable itself (virtualising the document) would remove it.

The largest JavaScript cost still on the keystroke path is React re-rendering
the whole App tree on every editor transaction (about 1.5 to 3 ms a keystroke);
it is not pagination and was left alone.
