# Tabelo: Product Definition

Canonical answer to what Tabelo is, who it serves, and what it will never do.
Read it before proposing a feature. `AGENTS.md` is normative for process and
keeps the fixed product priority order; this file is normative for scope.

## What it is

Tabelo is a browser-based table editor. One table document is shown through
several synchronized views: a visual grid, Markdown, CSV, TSV, HTML source,
Jira syntax, JSON, and a rendered preview, arranged in a workspace of one to
four panes. Edit any view and the others follow.

## Who it is for

A developer or technical writer maintaining tables in text: in a README, in
project documentation, in a pull request description, in a Jira ticket.

Not a spreadsheet user. Someone who already has the table in a text format, or
needs it in one, and whose editor gives them no help with it.

## The job

Get a table into the right format, correct, without breaking its content on the
way.

Today that person has two options and dislikes both. They hand-align pipes in a
text editor, which is tedious and gets worse with every column added. Or they
paste into a spreadsheet, edit comfortably, and then lose the alignment,
escaping, and formatting on the way back out, sometimes silently.

Tabelo exists for the gap between those two: comfortable editing that returns
the exact text format the person came for.

## What it does

- Keeps one table document and projects it into every open view at once, so
  there is no copy-and-paste step between formats and no stale second copy.
- Treats data preservation as the first product requirement. Codec escapes are
  reversible, and any supported round trip that changes or drops a cell value
  is a defect.
- Keeps working when a draft does not parse. Every other view holds the last
  valid parse and stays editable, and the broken draft stays recoverable
  through undo rather than being discarded.
- Accepts pasted and imported data, reading the header row from formats that
  declare it and asking before replacing the table when CSV, TSV, or plain text
  does not.
- Runs entirely in the browser, offline, with no account and nothing uploaded.

## What it will never do

Each of these is a decision, not a gap waiting to be filled.

- **No accounts, backend, or cloud sync.** Everything runs locally. There is
  nothing to sign into, and a server would add operating cost and a privacy
  surface the product does not need to do its job.
- **No collaboration or CRDT layer.** One person edits one table. The single
  document with derived drafts (ADR 0001) is what makes synchronization
  predictable; a collaboration layer would replace that model wholesale.
- **No analytics or telemetry, of any kind.** The table content belongs to the
  user, and the product collects nothing, so there is nothing to leak. This is
  deliberate and it has a cost: see the success signals below.
- **No spreadsheet computational model.** Tabelo may adopt an interaction
  people already know from a spreadsheet when it makes editing a text-backed
  table faster or safer. It does not adopt formulas, multiple sheets, charts,
  macros, aggregation, or hidden type inference. A cell may carry a native
  number, boolean, or null, but only because a typed source stated it or the
  user chose it; nothing reads text and decides what it must be. The one
  sequence Tabelo will extend, on explicit request after a fill, is a row or
  column of typed numbers with one constant step. Dates, weekdays, custom
  lists, text patterns, a step guessed from a single value, and series running
  two ways at once are all excluded: each is an inference about intent, and
  guessing wrong quietly rewrites the user's data.
- **No large-document machinery.** Target scale is roughly 200 rows.
  Virtualization, Web Workers, and IndexedDB are all excluded. Input outside
  the supported bounds must be refused clearly instead of freezing or crashing
  the tab; that safeguard does not justify large-document architecture.
- **No localization framework.** English only, single locale, single
  maintainer. Dates and numbers inside cells are never localized or reformatted.
- **No versions or releases.** The deployed site is always the current version.

## How you know it worked

Three signals, in the order they can actually be checked.

1. **Data preservation holds.** A value that goes in must come back out
   byte-exact through every supported round trip. This is the one signal that is
   measured: the round-trip test suite is its check, and a failure is a defect
   regardless of what else the change improves.
2. **The user needs no second tool.** The whole task, paste through edit
   through export, happens here, without a spreadsheet, a converter site, or a
   text editor opened alongside.
3. **It beats the workaround.** Getting from source data to correct target
   format is faster and less annoying than hand-aligning pipes or the
   spreadsheet round trip.

Signals 2 and 3 have no collection channel, because analytics is a non-goal
above and that trade was made knowingly. Treat them as tests to apply to a
proposed change rather than as numbers to report: does this let someone finish
without leaving, and is it faster than the thing they do today? Neither has a
baseline, and neither should be given an invented one.

## Constraints

- Browser only, no runtime beyond the page. Persistence is `localStorage`;
  offline capability is a service worker.
- Published to GitHub Pages at `https://tabelo.martonpaulo.com/`, built from
  `apps/web` by CI. The application is its own landing page.
- The product stores no secrets and holds no user account state.
- Roughly 200 rows is the working scale, not a limit to engineer past.

## Decision index

The consequential product and interaction decisions, where each one is recorded,
and the issue that decided it. This is an index, not a second copy: the rule
itself lives in the document named, which is the canonical owner, and that
document cites the deciding issue beside the rule. When a decision changes, the
owning document is amended in the same change and this row follows it. A
reversible implementation choice does not belong here.

### Product and workspace

| Decision | Current outcome | Recorded in | Decided on |
| :--- | :--- | :--- | :--- |
| Product scope | A single-table editor, permanently | this document | #92 |
| Pane count | One through four panes; a fresh visit opens two; a stacked window grows to two | ADR 0006 | #91, #219 |
| Layout set | Eight presets, filtered to the current pane count | ADR 0006 | #91, #72 |
| Layout entry point | Global App-menu command opening the shared visual dialog | ADR 0006 | #72 |
| Add view | Pane-edge controls plus the flat global command | ADR 0006 | #69 |
| Move pane | One command opening a destination dialog; no pane dragging | design system §3 | #73 |
| Download | The global format chooser is canonical | design system §3 | #70 |
| Palette | One unconditional dark palette; no theme preference | ADR 0010 | #289 |
| Grid wrapping | Per column, opt-in, off by default | design system §9 | #41 |
| Source wrapping | Per pane, opt-in, off by default | design system §3 | #95 |

### Documents, formats, and persistence

| Decision | Current outcome | Recorded in | Decided on |
| :--- | :--- | :--- | :--- |
| Header import | Read an explicit format header; otherwise ask rather than guess | `AGENTS.md` domain rules | #23 |
| Table name | Renamed from the App Menu, outside undo; the browser title is `Table name · Tabelo` | design system §3 | #82 |
| Column width owner | A workspace preference keyed by column id | `CONTEXT.md` | #137 |
| Column width commands | Pointer resize, Fit column to content, and a keyboard resize | design system §9 | #81 |
| Cell types | Carried, never inferred from appearance | ADR 0008 | #147 |
| JSON shape | An array of row objects with explicit serializer preconditions | `CONTEXT.md` | #42, #145 |
| CSV export header | Always included | `AGENTS.md` domain rules | #148 |
| Persistence migrations | An explicit forward-only chain; unreadable data is kept and explained by reason | `AGENTS.md` architecture | #184, #32 |
| Codec escaping | Every escaping codec round-trips content losslessly | ADR 0002 | #183, #188 |

### Interaction and menus

| Decision | Current outcome | Recorded in | Decided on |
| :--- | :--- | :--- | :--- |
| Keyboard navigation | Two levels: Enter enters a pane, Escape leaves it; focus lost to a replaced pane lands inside the active pane | design system §9 | #24, #54, #350 |
| Row and column reorder | Keyboard and menu path plus pointer drag; no pane drag | design system §9 | #136, #139 |
| Column resize shortcut | `Alt`+`Shift`+Left/Right on the focused column | design system §9 | #81 |
| Fit with wrapping | Fit is disabled with a reason while the column wraps | design system §9 | #81 |
| Menu grouping | Content, display, then pane actions | design system §3 | #70 |
| Group titles | Alignment, Edit, Move; no single-item title | design system §3 | #75, #81 |
| Cascading menus | Only for flat, immediate, self-explanatory command lists | design system §3 | #149, #155 |
| New table | Confirm when work exists; success returns to the welcome surface | `AGENTS.md` domain rules | #39, #46 |
| Floating menu identity | Global commands; New table is destructive; identity includes copyright | design system §6 | #71 |
| Pinning | Optional first data row and first data column only | design system §9 | #160 |
| Sort, find, and fill | Sorting and find are in scope; fill repeats and offers a numeric series | design system §9 | #143, #144, #150 |
| `Mod`+`D` | Belongs to a focused editable source editor, unconditionally | design system §9 | #232 |
| Empty source field | One caret stop, at the value start | design system §2 | #345 |

### Accessibility and presentation

| Decision | Current outcome | Recorded in | Decided on |
| :--- | :--- | :--- | :--- |
| Notices | A fixed overlay, never layout content | design system §5 | #44 |
| Active pane | A non-layout-shifting boundary | design system §5 | #64 |
| Destructive contrast | The token and the variant both own the correction | design system §2 | #109 |
| Precondition correction | Lead the user to the first offending cell when possible | design system §4 | #146 |
| Grid lines | Subtle where the grid continues, strong where chrome meets the table; no state recolours a line | design system §9 | #346 |
| Selection on letters and numbers | A neutral surface and semibold label, never the selection fill | design system §9 | #291 |
| Copied mark and focus | One two-tone marquee on a focused copied cell, on the range's real edge | design system §4 | #223, #349 |
| Project mark | `logo.svg` is the one source for every icon | design system §6 | #307 |
| Cognitive-accessibility claims | No condition-specific claim without representative task sessions | design system §9 | #80 |

### Superseded outcomes

Recorded so they are not proposed again by accident: a two-pane minimum; seven
layouts without Single; Layout inside the pane menu; per-view Download and the
retirement of the global chooser; removing Download or Layout from the global
menu; one and only one cascading submenu; arbitrary freeze boundaries; opaque
strings as the permanent cell model; a Light, Dark, and System preference; no
familiar spreadsheet interaction under any circumstances; the preview's first
row aligned with the grid's first row (#233); a separate blue-field icon source
(#307); the copied mark stepped inside the focus outline (#223); a blank table's
shape drawn in the rendered preview (#357).
