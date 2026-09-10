ChapterFlow

Local-first desktop manuscript editor for long-form fiction writers. Electron + React + TypeScript. Solo project. Ships with no AI features and makes no network calls carrying manuscript content — a positioning decision, not an oversight.

Commands
npm run dev — launch the app
npm run typecheck — FILL IN or delete
npm test — FILL IN or delete
npm run package — FILL IN or delete
Decisions already made

Settled deliberately. If a task appears to require breaking one, stop and say so rather than working around it.

Documents are UUID-keyed files. binder.json holds structure, separately.
Tags, status, synopsis and metadata live on DocumentNode in binder.json, never in content files.
Word counts are computed live. Never cached, never persisted.
Search ranking is hand-written priority tiers, not a weighted scoring formula.
Page view is a debounced separate rendering pass, not live DOM mutation of the editor.
Draft, Notes, Matter, Archive and Trash are protected structural folders, fixed at the binder root and identified by fixed ids rather than by name. The writer's own top-level folders sit between Matter and Archive, carry an isTopLevel flag, and are ordinary folders in every other respect.
Emptying Trash is the one delete in the app that bypasses snapshots. It cannot be undone and must always be confirmed.
Gotchas
IMPORTANT: a passing test suite has repeatedly not meant the UI updated. Changes to the editor, page view, Book View or theming need visual confirmation against the running app before being reported as done.
The project must stay outside OneDrive.
Copy

Plain and factual. Stats read as sentences containing numbers, not labelled readouts. Hedged language for anything computed or estimated. No exclamation points in errors. No badges, streaks or celebratory language.