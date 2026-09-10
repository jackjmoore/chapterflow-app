# Drop Scrivener projects here

Put either of these in this directory:

- a **`.scriv` folder** — copy the whole thing, not just the `.scrivx` inside it
- a **`.zip`** — Scrivener's own backups work as-is, wrapper folder and all

Then, from `tools/scriv-import/`:

```
npm run intake
```

A report per project appears in `../reports/`.

You can also point it straight at one without copying anything:

```
npm run intake -- "D:/Writing/My Novel.scriv"
```

## Two things worth knowing

**Nothing here is committed.** This directory is gitignored apart from this file, and so
is `reports/`. A real project is a manuscript and has no business in version control.

**Nothing here is written to.** The intake opens projects read-only. It never modifies,
moves, or reorganises what you drop in, and the eventual importer works the same way —
reading a `.scriv` and building a separate ChapterFlow project from it, never editing the
original.

## What ends up in the report

The report is structural on purpose, because that is what settles the open format
questions and it does not require reading your manuscript:

- the file layout, and whether it is a Scrivener 2 or 3 project
- every element and attribute name in the `.scrivx`, and the `Type=` values
- the binder outline — nesting, item types and **chapter titles**
- which per-document sidecar files exist (`content.rtf`, `synopsis.txt`, `notes.rtf`, …)
- a census of every RTF control word, and specifically **which ones the parser does not
  yet handle** — the single most useful thing in the file
- whether every document parsed without throwing, and what the parser reported dropping

Prose appears only as a handful of samples truncated to about 90 characters, enough to
prove the text decoded correctly — that curly quotes and accents survived. If a specific
decoding problem needs chasing, `npm run intake -- --text` lengthens those samples. It is
off by default.

Titles and short samples are the only manuscript content that reaches a report. If even
that is more than you want to share, say so and the survey can be reduced to structure and
counts alone.
