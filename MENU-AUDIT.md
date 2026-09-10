# Menu and sub-menu design audit

A survey of every menu surface in the app, done against the running build rather
than the source. The list came first; the fixes marked below followed it.

**Method.** A CDP harness opened all 7 top-level menus, all 12 sub-menus, both
context menus, their 3 flyouts and 2 popovers, screenshotted each, and measured
size, item counts, shortcut coverage, alignment and viewport overflow. Sub-menus
had to be opened by moving the *real* pointer: they are revealed by CSS `:hover`,
which a synthetic `mouseover` cannot trigger, so an earlier pass measured every
flyout as 0×0 and looked fine. The editor context menu is raised by the main
process and needs a real right-click in a genuinely focused editor.

Screenshots: `mockups/menu-audit/`. Raw measurements:
`mockups/menu-audit/measurements.json`.

**Status.** Findings 1, 2, 3, 4 and 11 are fixed and verified against the
running app, as is the shortcut gap in section D. Sections C and E10 are
structural decisions and F is an open question — all left alone deliberately,
because they change what the menus contain rather than how they behave.

---

## A. Broken, not just untidy — FIXED

**1. The Story Bible Mentions flyout runs off the bottom of the window.**
Right-clicking a document low in the binder at 1280×720 opens a 394px flyout
whose bottom edge sits **285px below the window**. It has `max-height: none`
and does not scroll, so 12 of the 16 entries are simply unreachable — there is
no gesture that gets to them. See `edge-flyout-story-bible-mentions.png`.

The fix already exists in the codebase and was never generalised: `index.css`
caps exactly one list, `.context-menu-doc-list` (the Link to Document flyout),
at `max-height: 320px; overflow-y: auto`. Every other dropdown and flyout in the
menu system is uncapped. Story Bible Mentions is unbounded by the same logic —
it lists every Story Bible entry — so it was always going to hit this.

Worth noting the inconsistency is *inside* one component: the parent context
menu does clamp itself to the viewport (bottom 712 of 720), so the menu knows
about the window edge and its flyouts do not.

**2. Flyouts have no flip logic at all.** `.menubar-flyout` is
`position: absolute; top: -5px; left: 100%`, unconditionally. Set Status (122px)
and Add/Remove Tags (130px) are short enough not to show it today, but they are
the same code path as the one above, and the same is true horizontally for any
menu opened near the right edge.

---

## B. Visual grammar — FIXED

**3. Labels inside a single menu sit on two different left edges.** Checkable
items reserve a check column; plain items do not, so the left edge alternates
down the list. It is most visible in **View** (`menu-view.png`): Page Setup…,
Document View and Layout Presets are flush left, while Revision Mode, Read Aloud
and Distraction-Free Mode are indented — three of each, interleaved. The editor
context menu has the same fault (`context-editor.png`): Cut / Copy / Paste flush,
Bold / Italic / Underline indented below them.

**4. Three different selection idioms across one menu system.**

| Surface | How a selected item is shown |
|---|---|
| View, Binder ▸ Set Status | the menu's own `.menubar-item-check` mark |
| Binder ▸ Add/Remove Tags | a native checkbox plus a colour dot |
| Binder ▸ Story Bible Mentions | a bare native checkbox |

The two checkbox flyouts also use a denser row height and a narrower box
(~200px against the 220px used everywhere else), so they read as a different
control that happens to live inside a menu.

---

## C. Structure

**5. File is carrying too much** — 32 items, 559px tall, 6 separator groups,
4 sub-menus (`menu-file.png`). Export and print take 6 of its 9 top-level
entries across three competing mental models:

- Export Document ▸ (txt, PDF, docx, md)
- Export Project ▸ (txt, PDF, docx, md) — the same four, verbatim
- Export Manuscript Format ▸ (this document / whole project × PDF / docx)
- Print Document…, Print Project… — flat, not a sub-menu
- Print Manuscript Format ▸ (this document / whole project)

Two axes (scope, format) and one modifier (manuscript format) expressed five
different ways. This is the single biggest structural item on the list.

**6. `Delete` is the third item in the File menu**, immediately under New
Document and New Folder. It names no target, has no ellipsis, and has no
shortcut — a destructive action one row below two creates, in the menu people
open to make things.

**7. Four sub-menus exist to hold exactly two items**: View ▸ Document View,
View ▸ Layout Presets, Format ▸ List, File ▸ Print Manuscript Format. Each
costs a hover and a 66px flyout to reveal two options that would fit inline.

**8. Insert has two identical 6-item sub-menus** — Draft Word Count and
Character Count, both offering Exact / Nearest 50 / 100 / 250 / 500 / 1,000.
Twelve rows expressing one choice made twice.

**9. Project ▸ Saved Views mixes commands with content** — Save Current Filter
as View… and Manage Saved Views… sit above the user's actual saved views
("Needs work", "Final chapters") with a single rule between them.

---

## D. Shortcut coverage is uneven enough to be misleading — PARTLY FIXED

| Menu | Items with a shortcut |
|---|---|
| Edit | 7 / 7 |
| Format | 21 / 23 |
| File | 7 / 32 |
| View | 3 / 10 |
| Project | 3 / 11 |
| Insert | 3 / 21 |
| Binder context | 0 / 15 |
| Editor context | 0 / 58 |

The context menus are the sharp end: the editor menu offers Cut, Copy, Paste,
Bold, Italic, Underline and Find with **no** shortcut text, while Edit and Format
show a shortcut for every one of those same commands. Same command, two answers,
depending on which way you opened it.

---

## E. Popovers that don't speak the menu's language

**10. Toolbar overflow** (182×186, `popover-toolbar-overflow.png`) — an
icon-only 4-column grid with no labels, uneven row heights, a lone `<select>`
occupying its own row, and the two `×` colour-clear buttons cramped against
their swatches. In the toolbar these icons have adjacency and tooltips; stacked
in an unlabelled grid they lose both. It reads as the toolbar wrapped, not as a
designed surface.

**11. Footer word count** (260×148, `popover-word-count.png`) — hover-only, on
a `<span>` rather than a button, so there is no click, no focus and no keyboard
route to it at all. Its content is good and the copy is right; it is simply
unreachable except with a mouse. It is also the only surface in the app using a
label-left / value-right table, which is a consistency question as well as an
access one.

---

## F. One open question rather than a defect

**12. Casing.** Every menu is Title Case ("New Document", "Manage Statuses…",
"Distraction-Free Mode"). DESIGN.md Tier 1 says labels use sentence case. But
that rule's stated target is the all-caps section labels in the progress panel,
and Title Case in a menu bar is the Windows platform convention — so the two are
not obviously in conflict. This wants a recorded decision either way rather than
a silent change in one direction.

---

## Checked and found fine

Stating these so they don't get re-examined:

- **Nothing overflows horizontally** at any size tested.
- **The File menu fits down to a 680px-tall window** (619px bottom edge). It has
  `overflow-y: visible` and does not scroll, so there is no headroom for another
  group and no fallback if one is added — but it is not clipping today.
- **Widths are consistent** at the 220px `min-width`, except View at 237px
  (Distraction-Free Mode plus its shortcut).
- **Edit and Format need nothing.** Edit is 7 items with 7 shortcuts; Format is
  23 items with 21, cleanly grouped.

---

## Screenshot inventory

`mockups/menu-audit/`

| File | Surface |
|---|---|
| `menu-file/edit/format/insert/view/project/help.png` | the 7 top-level menus |
| `submenu-file-export-document.png` … | all 12 sub-menus |
| `context-binder.png` | binder context menu on a document row |
| `context-binder-set-status/-add-remove-tags/-story-bible-mentions.png` | its 3 flyouts |
| `context-editor.png` | editor context menu with a word selected |
| `popover-toolbar-overflow.png`, `popover-word-count.png` | the 2 popovers |
| `edge-context-binder.png`, `edge-flyout-*.png` | the same menus opened near the window edge, at 1280×720 — where finding 1 shows |
| `small-1280x720-file.png`, `small-1024x680-file.png` | the File menu at smaller window heights |

---

## What was changed

New file `src/renderer/src/useFlyoutFit.ts`, used by `MenuBar.tsx`,
`BinderContextMenu.tsx` and `EditorContextMenu.tsx`.

**Findings 1 and 2.** A flyout is measured as the pointer enters its parent and
slid up until it fits, capping its height and letting it scroll only when it
cannot fit anywhere on screen. Sliding is preferred because it keeps the whole
list visible; scrolling is the fallback. The hook measures rendered height, not
`scrollHeight`, so it respects the Link to Document list's deliberate 320px cap
instead of overriding it. Delegated from a container, so flyouts added or
re-rendered later are covered without re-binding.

**Finding 3.** A dropdown containing any checkable item is flagged
`menubar-dropdown--checkable`, and CSS indents its plain items by exactly the
check gutter plus the flex gap. A menu with nothing checkable keeps its flush
edge, so nothing gains a gutter it has no use for.

**Finding 4.** The three native-checkbox lists — Binder ▸ Add/Remove Tags,
Binder ▸ Story Bible Mentions and Editor ▸ Tag Selection — are now ordinary
`menubar-item` buttons with the menu's own tick, at the same row height and
width as everything else. Set Status ▸ None gained an empty swatch so its label
lines up with the named statuses; that misalignment was there before and only
showed once the audit started measuring label edges.

**Finding 11.** The footer totals are a `<button>` with an `aria-label`, and the
popover opens on `:focus-within` as well as `:hover`, so it is reachable by
click and by keyboard.

**Section D.** The editor context menu shows the eight shortcuts it shares with
Edit and Format. Coverage across File, Insert, View, Project and the binder
context menu is unchanged — those are missing shortcuts, not missing labels, and
inventing them is a different decision.

### Deliberately not changed

Section C (File menu structure, Delete's position, the two-item sub-menus, the
duplicated Insert sub-menus, Saved Views grouping), E10 (the toolbar overflow
popover) and F (casing). Each changes what the menus contain or what the labels
say rather than how they behave, so each is a decision to take rather than a
defect to repair.

### Verified against the running app

Rebuilt and re-measured, not just typechecked:

- Story Bible Mentions from the lowest binder row at 1280×720: **16 of 16
  entries reachable**, 0px off screen, was 285px off with 4 of 16 reachable.
- No menu reports more than one label edge; the audit harness now fails on this
  explicitly.
- Zero native checkboxes remain in any menu surface.
- Editor context menu: 8 shortcuts, one left edge.
- Footer totals open with the pointer parked at (20, 20) and focus moved by
  keyboard alone.

Before-and-after pairs in `mockups/menu-audit/`: `menu-view.png` /
`after-menu-view.png`, `context-editor.png` / `after-context-editor.png`,
`edge-flyout-story-bible-mentions.png` /
`after-edge-flyout-story-bible-mentions.png`. Every other screenshot is the
original survey; those surfaces were not touched.
