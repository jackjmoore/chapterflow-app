# ChapterFlow — Design Language

This is the living reference for visual and UI decisions. It is separate from
`CLAUDE.md`, which governs architecture rather than design. Read this file before
mocking any screen. You can vary within it, but do not reinvent it, and do not
contradict it without flagging why.

**How this file works.** Tier 1 rules are settled and apply everywhere, with no
exceptions unless we discuss it first. Tier 2 patterns have only been observed on one
screen so far. Apply them as candidates on new mocks, but report back if a pattern
doesn't fit rather than forcing it or quietly dropping it. A Tier 2 pattern is promoted
to Tier 1 only after it has held up on a screen it was not originally designed for.

After any mock round is confirmed, update this file before starting the next round. Add
new decisions, promote or remove Tier 2 entries, and resolve any contradictions.
Confirmed decisions should live here, not only in chat history.

---

## Tier 1 — settled, applies everywhere

**Labels use sentence case, never all-caps.** This is a deliberate reversal of the
current baseline. The existing progress panel uses all-caps section labels such as
PROJECT TARGET, PROGRESS, and PACE. That was a real decision to correct, not something
already agreed. Apply sentence case on every screen going forward, not only the one
where this was decided.

**Use the existing color system.** That means the ten existing color presets (five
light and dark pairs) plus the two OLED and night-comfort themes. Mocks should work
sensibly within this system rather than invent a new palette. If a mock genuinely needs
a color the system doesn't have, flag it as a gap instead of picking one yourself.

Everything a preset paints is derived from its four stored colours — background, text,
accent, page. As of September 2026 that includes the hairlines: borders used to stay on
the base theme's warm browns whatever preset was active, so a cool grey palette read as
two themes at once. They now shade from the chosen background like the panel and control
fills already did.

**All interface copy must read as plain, natural sentences written by a person, not as
compressed technical notes.** This is the rule that has failed in practice, so it needs
to be explicit rather than implied. Do not write UI copy as sentence fragments strung
together with em-dashes. Do not write copy that sounds like a person thinking out loud
in shorthand. Write copy the way a careful person would actually say it out loud to a
writer, in full sentences.

- Bad: "58,214 words — ahead of pace — due Dec 1, 30k left."
- Good: "You're at 58,214 words, ahead of pace, with about 30,000 left before December 1."
- Bad: "No sessions yet — set a target to see progress."
- Good: "Set a word target to start seeing your progress here."

Beyond sentence structure, copy should also favor sentences built around a number
rather than a labeled readout, use hedged language for anything computed or estimated,
and avoid exclamation points in errors or empty states. The overall register is plain
and non-SaaS: it should read like someone is actually keeping track of your work, not
like a dashboard product describing itself.

**Every section without a side panel lays out on one shared page frame.** The frame is
three tokens and a column: `--page-pad-top`, `--page-pad-x`, `--page-pad-bottom`, and
`--page-measure`, with `.page-column` for sections whose scroller spans the window. Do
not give a new screen its own padding or its own measure. This is a correction: the seven
panel-less sections were each designed on their own, and by September 2026 they held four
different paddings and six different measures between 660 and 1120, so clicking down the
nav rail moved the content sideways on every step. The measure is the widest of the old
values, because it is the one the compile assembly's two-column proof needs.

Two consequences worth stating, because both were bugs before they were rules. A page
whose content is prose caps the **text** at `--page-prose` rather than narrowing the
column, so the page still begins and ends where every other page does. And every page
scroller sets `scrollbar-gutter: stable`: without it a page that scrolls centres its
content half a scrollbar to the left of a page that does not, which is small enough to
feel like a twitch rather than to be seen.

Sections keep whatever controls they need above the column — a toolbar, or the Lexicon's
alphabet — so content does not always start at the same height. That difference is
structural and legible; the horizontal one was arbitrary.

**Empty states are a first-class design target, not an afterthought.** Every mock for a
data-driven screen needs its own explicit empty-state pass, not just the populated happy
path. A screen that looks excellent full of fake data but was never designed empty is an
incomplete mock.

**A stated number must come from a field that records the thing it claims.** The Query
Tracker's waiting list wanted to say how long replies usually take, and the record had no
reply date. The nearest available field, `updatedAt`, moves whenever an entry is edited
at all, so using it would have put a number on screen that looked like a reply time and
was not one. The field was added instead, entered by hand, and the median is computed
from the dated replies and from nothing else — it is absent entirely below three of
them, because a middle value drawn from one or two is a number about nothing. When a
screen wants a statistic the record cannot support, add the field or drop the sentence.
Never derive it from a field that happens to be nearby.

**A relationship between two things must state which way it reads.** This came out of
the Continuity Board redesign in September 2026, and it applies to any screen that shows
a link between two named things. The old map printed one label on the line drawn between
two names, which was true in only one direction, and the stored reverse wording had
nowhere to appear at all. Write the link as a sentence instead, phrased outward from
whichever entry the reader chose, with how it reads from the other end beneath it. When
a link has no separate reverse wording it is mutual, which means the same words apply
from both ends: say so in those same words rather than turning the sentence around. "Eda
Voss is the mother of Maren Voss" reverses correctly; "Maren Voss and Tomas Brek is the
oldest friend of" is the failure this rule exists to prevent.

## Tier 2 — candidate patterns, observed once, not yet proven

These were all observed on the project-progress dashboard redesign in September 2026.
Try them on the next mocked screen too, but treat them as candidates rather than rules.
If a pattern doesn't fit a new screen, say so and explain why, rather than forcing it or
quietly ignoring it.

**Prefer whitespace over bordered card grids.** The dashboard direction that used
generous whitespace and a single hero statement read as stronger and less like an
Electron prototype than a four-card grid layout. This is untested on screens with
genuinely heterogeneous data, such as the Story Bible or Continuity Board, where a card
or repeating-row structure may be a structural need rather than a style choice. The
Continuity Board has now confirmed the exception twice. Its September 2026 redesign
first tried the whitespace shape, replacing the event cards with rows separated by a
single hairline, and that was rejected on sight: with one event per row and a date
column beside it, the hairlines let the events run together as a single block of text.
The cards came back, and the rule that came out of it is that a card earns its keep
where the reader needs to see where one item stops and the next starts, which is not the
same question as whether the screen has a hero number to lead with. The Story Bible is
the other confirming case, for the different reason that its entries are heterogeneous. The compile panel's assembly (September 2026) is a second confirming sample on the
main pattern: its steps are separated by whitespace and single hairlines, with no
bordered cards, and that held up in the built app. The Story Bible then confirmed the
exception rather than the rule: three directions were mocked, including a hairline
typographic index with no cards at all, and the card wall won because the entries are
heterogeneous and benefit from recognition at a glance. Cards are the right shape there.

**One hero number with one supporting line chart, everything else receding.** This
worked well specifically because there was one obvious headline metric, the word count
toward a target. It is likely dashboard-specific. Most other screens, such as Binder or
Story Bible, do not have one obvious number to lead with, so don't force this shape onto
them. The compile panel added a related sample in September 2026: its hero is a
sentence rather than a number, stating what a compile right now would produce. The
common thread seems to be leading with the one thing the screen is about, said in the
brand voice.

**Build a screen on the one thing the record knows about every row.** The Query Tracker
used to be a board of seven status columns, which spread the queries out by a field that
says nothing about what to do next and left most columns nearly empty. What the record
knows about every query, whatever its status, is the date it went out, so the redesign
in September 2026 made elapsed time the axis: a bar per open query against a shared
scale, longest wait first, with the ones that already came back off that list entirely.
Worth asking on any screen currently organised by a category field.

**A control that a removed gesture used to provide has to reappear somewhere explicit.**
Dragging a card between the tracker's columns was how a query changed status, and the
board went. The status is now a menu on the row, writing the same field the edit modal's
dropdown writes. A redesign that quietly drops a one-gesture action and leaves only a
modal has removed a capability rather than restyled one.

**A calendar or streak heatmap as a quiet habit visual.** This worked well and fits the
honest-over-gamified principle. It's worth trying anywhere writing frequency or a streak
is relevant, not only on the dashboard. The Story Bible added a second sample in
September 2026: the presence strip on each card and sheet is the same idea turned on
mention frequency instead of writing frequency, with one cell per manuscript document in
reading order. Every strip is drawn against the same document list, which is what makes
two entries comparable at a glance.

**Progressive disclosure through a single "collapse to a link" affordance**, instead of
always-visible controls. This direction is confirmed, but the actual interaction is not
yet decided. Whether it expands inline or opens a separate view is still an open
question. Don't assume an implementation here; ask. One counter-sample arrived with the
search redesign in September 2026: replace had been hidden behind a toggle and nobody
found it, so it is now always on screen and merely *inert* until a replacement is typed.
Hiding a control is not the same as disclosing it progressively, and a feature people
need to discover should not be the thing that gets collapsed.

**A panel that displaces rather than covers, when the work is about the page.** Search
results used to open as a drop-down over the manuscript, which is the wrong shape for
stepping through matches: the thing being read sat underneath the thing listing it.
Choosing a match now moves the list into the side panel's place, so the page keeps the
rest of the window. This is worth trying wherever a list exists to navigate the
manuscript rather than to be read on its own.

**A chooser should be the thing it chooses, and trying should be free.** The Appearance
page shows each theme as the app wearing it — search bar, rail, binder, a manuscript page
with real sentences on it, the accent on a control — rather than as a swatch of its
colours, and hovering one puts the whole window into that theme, this page included.
Nothing is written until a click, moving away puts it back, and leaving the section
cancels a preview that was still up. Two things make this honest rather than a trick: the
preview overrides the stored preset id at the single point the palette is derived from,
so a preview repaints through exactly the same effects a real choice would and cannot
disagree with it; and the cards are drawn from that same derivation, so a card cannot
show something the app would not do. That last point is why the theme wall needs no line
of copy under its heading — the cards say it. Worth trying wherever a setting has a
visible result that a label would only describe. The custom theme creator (September
2026) is the second sample, and it held: three directions were mocked, and the one chosen
makes a theme on the wall itself. A dashed card at the end of the presets opens into the
same specimen with a name and four wells beneath it, the whole window wears the draft
while it is open, and a saved theme becomes one more card in a "Your themes" row above
the presets. The loose "Custom colors" wells went with it, because a theme is those same
four colours kept under a name.

**An index can move the page on hover instead of being a row of buttons.** The Lexicon's
glossary has the alphabet across the top: hovering a letter takes the page to it, with no
click, so sweeping the strip flips through the glossary. Two things make it work. A letter
with no words under it is dimmed and completely inert, rather than a control that does
nothing when pressed. And the page carries enough trailing space for the last letter to
reach the top of the view, or hovering Y leaves you looking at W. The strip also marks
where you are as you scroll, so it reads as a position and not only as a control. Worth
trying wherever a long list has an obvious index. Note that hover-only leaves no keyboard
route, which is still an open question on this screen.

**Show the thing that caused the state, not the machinery that records it.** The
project's spellcheck suppression list is stored per word, because a spellchecker only
ever reports single words, so "Kestrel Point" is held as "kestrel" and "point". Printing
that list is accurate and useless: the reader is shown "Old", "Point" and "the" as though
they were names. The Lexicon lists the Story Bible names instead, which is what the
section is explaining, and counts the words separately in its opening sentence. A mock
built on hand-written data will not catch this; only real data will.

**A diagram you are meant to learn the shape of should hold still.** The relationship
web on the Continuity Board is drawn at a fixed 640 by 360, not scaled to the window and
not resized by how many names are on it. The layout is deterministic for the same
reason, so the web looks the same every time it is opened and choosing a different entry
moves nothing underneath it. Worth trying on any other diagram meant to be recognised
rather than read once.

**A section that takes the panel's width still holds one reading measure.** Taking the
panel's width is about not leaving a hole where the sidebar used to be, and it is not an
instruction to run text the full width of a large window. The Story Bible's cards tile
into whatever width they are given, but the Continuity Board's events are sentences, so
in September 2026 the board kept a single measure and centred it, with the toolbar, the
broken-link notice, the thread, and the relationship sentences all held to the same
column. Try this on any panel-less section whose content is mostly prose.

**Say once, in a sentence, why something broken is still on screen.** The Continuity
Board keeps references to deleted items and scenes rather than scrubbing them, because a
restored backup brings them back. That was previously left to be inferred from a
scattering of warning chips and a button in the toolbar. It now says so plainly in one
line above the board, with the cleanup action beside it. Worth trying anywhere the app
deliberately keeps something that looks like an error.

**Per-document targets and target and deadline editing should stay inline and low-chrome
elements**, not their own bordered panel. This carries over from the current UI's
working pattern of an inline "Set target" action per row. The interaction should
survive the redesign even as its visual treatment changes.

---

## Removed or rejected patterns

**The duplicate list sidebar on Continuity Board and Lexicon has been removed.** On
these two screens, the main panel already shows the full list with more detail per item
than the sidebar did, so the sidebar was duplicating it rather than acting as a
master-to-detail navigator. This is different from Binder, where the sidebar is the
only way to switch documents and must stay. Do not reintroduce this sidebar on these two
screens without a specific reason, and do not remove it from Binder or the Query
Tracker, where it still serves a real navigation purpose. Compile joined the removed
list in September 2026: its presets and history live in its own main area as chips and
the filmstrip, so the section now takes the panel's width, the way the two dashboard
sections do.

The Continuity Board's panel was actually taken out with its redesign in September 2026,
and its jump-list component was deleted with it. The cross-section jump into the board
from a search result was kept, because that arrives from elsewhere rather than from the
panel. The Lexicon's panel went the same way with its glossary redesign, once the
alphabet across the top had taken over the jumping its list was doing.

**The Query Tracker's panel has been removed too, reversing the protection above.** That
protection was written when the panel held a status filter, and the tracker's main area
was a board of every status at once. The waiting-list redesign in September 2026 groups
every entry by state on the page itself, so filtering to one status was filtering a list
that had already been sorted into those groups. The compiled-drafts list that shared the
panel went with it, and that is not a loss: the Compile section's filmstrip is where
compiled drafts live, and each tracker row still opens the exact draft it was sent with.
Binder remains the only section that keeps its panel, because there it is the only way
to switch documents.

**The Story Bible sidebar has also been removed, reversing the line above.** This entry
originally protected it alongside Binder and the Query Tracker. The card-wall redesign
changed the argument: the wall lists every entry grouped by type and carries a portrait,
a summary, a mention count, and a presence strip per entry, which is more per entry than
a panel row held, so the panel had become the duplicate list this section rejects
elsewhere. Binder is still the exception that keeps its panel, because there the sidebar
is the only way to switch documents.

**All-caps section labels are rejected as a general convention.** See the sentence-case
rule in Tier 1.

**A four-card metric grid as the default shape for a data screen is rejected on the
dashboard specifically.** It was considered directly against the whitespace and hero
direction and lost. This is not a rejection of card grids everywhere, only on this
screen.
