# Scrivener import — refinement lab

Isolated workbench for the `.scriv` importer. **Nothing here is wired into the app.**
The app's `package.json`, build, typecheck and test suites are untouched; this directory
has its own dependencies and its own `node_modules`.

It exists so the RTF reader — the largest and riskiest piece of the importer — can be
built and refined before a real Scrivener project is available, and then *moved* into
`src/main/import/scrivener/` rather than rewritten.

Plan: `~/.claude/plans/validated-knitting-pie.md`.

## Giving it a project

Drop a **`.scriv` folder** or one of Scrivener's **`.zip` backups** into `corpus/`, then:

```
npm run intake
```

A structural report per project lands in `reports/`. Both directories are gitignored.
`corpus/README.md` says exactly what a report does and does not contain — the short
version is structure, a control-word census, and prose only as ~90-character samples.

You can skip the copy and point it at one in place:

```
npm run intake -- "D:/Writing/My Novel.scriv"
```

The report answers the plan's `VERIFY` questions directly — whether the identity attribute
is `UUID` or `ID`, whether `Title` is an element or an attribute, what the `Type=` values
are, what the sidecar files are called — and lists **every RTF control word the writer
emits that the parser does not yet handle**. That gap list is the most useful thing in it.

## Running it

```
npm install --legacy-peer-deps   # once; installs only into tools/scriv-import/node_modules
npm test                         # the RTF suite — 54 assertions, no corpus needed
npm run typecheck
npm run intake                   # survey whatever is in corpus/
npm run cli -- fixtures/sample.rtf [--html | --blocks]
node make-fake-project.mjs --zip # a synthetic project, to exercise the plumbing
```

## What is built

| | |
|---|---|
| `src/rtfToBlocks.ts` | RTF → the app's `Block[]`. The whole state machine. |
| `src/codepage.ts` | `\ansicpg` → an `iconv-lite` encoding. |
| `test/rtf.test.ts` | 54 assertions over hand-written RTF. |
| `src/projectSource.ts` | Read-only access to a `.scriv` folder or a `.zip` backup, alike. |
| `intake.ts` | The corpus front door — surveys a whole project. |
| `cli.ts` | Parse and report on a single `.rtf`. |
| `fixtures/sample.rtf` | A small file exercising most of the parser. |
| `make-fake-project.mjs` | A synthetic project, so the plumbing is provable without a real one. |

Not built yet: `scrivxToTree`, the real binder parser. It is deliberately last, because
every element name in it is inference until a report from a real project settles them.

## The division of labour

`rtf-stream-parser`'s `Tokenize` owns the bytes — group nesting, control words and their
parameters, and `\binN` / `\'XX` as opaque data rather than markup to be scanned. That
removes a whole class of failure: binary desync, control-word delimiter rules, bare CR/LF
being mistaken for text.

Everything above the tokenizer is here, because none of it is something a generic
tokenizer can know:

- **The `\ucN` fallback skip.** The single most destructive plausible bug in the importer,
  and the tokenizer has no concept of it — it hands the ANSI fallback over as ordinary
  tokens. Ignoring `\uc` renders every non-ASCII character twice; hard-coding "skip 1"
  eats the next real character of prose after every curly apostrophe wherever a writer
  emits `\uc0` with no fallback. There is a four-way regression test for exactly this, and
  it has been mutation-checked: reintroducing the hard-coded skip turns `don't stop` into
  `don' stop` and the suite catches it.
- **The destination table** — skip `\pict`/`\footnote`/`\annotation`, keep `\fldrslt` and
  drop `\fldinst`, skip `\listtext` while reading it as the list signal, and skip any
  unrecognised `{\*\…}` wholesale so unfamiliar writers degrade rather than leak.
- **`\plain` / `\pard` / `\par` reset semantics** and group-scoped property inheritance.
- **Decoding**, and the mapping onto `Block`/`Run`.

## Two notes for folding in

`src/shared/import.ts` will need two more `ImportWarningKind` members —
`annotationsDropped` and `textEncodingFallback` — with their `IMPORT_WARNING_LABELS`
entries. Until then they live as a local `LabWarningKind` union in `rtfToBlocks.ts`.

The `Block` model is imported by relative path from `src/main/export/`, deliberately: the
parser is validated against the real target format, so folding in is a move, not a port.

## Known gaps

- **macOS-authored projects are untested** and no Mac samples are available. List markup
  is the most likely thing to differ.
- **List detection** currently keys on the `\listtext` marker rather than harvesting
  `{\*\listtable}`. That is the documented safe floor — if detection fails entirely,
  paragraphs come through as paragraphs and no marker glyphs leak into the prose — but it
  should be revisited against real Scrivener output.
- **`\line`** becomes a paragraph split. The schema has no hard-break node, so the
  alternative is collapsing to a space, which is silently wrong for verse.
- **Headings** are only recovered from `\outlinelevel`. Stylesheet-based recovery is not
  implemented and probably should not be: for a `.scriv` import, structure comes from the
  binder, not the prose.
