# What is stale in the structure suite's header

Written by the cloud firing of 2026-11-07, which took no row. Read-only; the suite was not run.
Part 3 of shift 1B's four-part brief is "correct the structure suite's stale header", and no
file in the repository had said what was stale about it. This narrows that part to an edit, the
way `FINDINGS/2026-11-06-mangled-path-folder.md` narrowed part 5.

## The gap

`tests/structure.test.ts` is 618 lines and calls `section()` thirteen times. Its header comment,
lines 1 to 18, describes ten of those thirteen. Three sections are not mentioned anywhere in it:

| Line | Section | What its own in-body comment says it is for |
|---|---|---|
| 231 | `notes are metadata, and cannot reach the manuscript` | That a Draft document's body is both the compile source and the word-count source, so notes kept near it would silently become manuscript; asserts they structurally cannot. |
| 478 | `insertSubtree writes a whole subtree in one persist` | The bulk path an importer needs; its failure modes are all corruption, so each guard gets its own assertion. |
| 562 | `importSnapshot keeps the timestamp it was given` | Version history imported from elsewhere has to carry its own dates, or a diff between two revisions shows both as today. |

Each of the three carries its own explanatory comment in the body, so the suite is documented
section by section; only the header stopped keeping up. Two of the three are importer paths,
which fits the Scrivener importer having landed after the header was written, though no commit
shows this: `tests/structure.test.ts` has one commit in the history, the root import `a983d96`,
for the reason recorded in `FINDINGS/2026-11-07-unreachable-baseline.md`.

## The ten the header gets right

Checked one by one against the section list, and all ten hold:

- "the one-time migration (at the 45+ document scale...)" — line 116. `buildLegacyTree()` on
  line 67 builds 3 parts of 14 chapters, plus two fragments, plus three loose documents: 47
  documents, so "45+" is accurate.
- "its idempotence and sidecar backup" — asserted inside the migration section, lines 152 and
  163, not as a section of its own.
- "the protection guards" — 171. "the creation redirects" — 199. "the Draft-only word-count
  scoping" — 212. "the template/matter homes" — 294.
- "a legacy project gains the two new protected folders without its content moving, that they
  take documents like ordinary folders" — 316.
- "a custom top-level folder is deletable where the protected five are not" — 355. The five
  match `CLAUDE.md`: Draft, Notes, Matter, Archive, Trash.
- "none of these folders can be pulled into a compile pass" — 401.
- "emptying Trash removes documents AND their snapshots" — 436.

So nothing in the header is wrong. It is incomplete by three sections, which is a different
defect from the one the workbook row's wording implies and a smaller one.

## What the edit is

Three clauses added to the header's second paragraph, naming the notes-as-metadata, `insertSubtree`
and `importSnapshot` sections. No assertion changes and no behaviour changes, so it needs no
visual confirmation and is not a renderer change. It is a comment-only edit to a test file, which
a cloud firing with a row could make; this firing had no row and did not make it.
