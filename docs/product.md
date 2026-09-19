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
- Keeps every source view a real text editor first. A named structural
  assistance may make a narrow, reversible adjustment where the source itself
  makes the result unambiguous, such as keeping the Markdown alignment divider
  in step with its header, and it can always be switched off for the text in
  front of the user. It never reformats a draft on its own.
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
| Add view | Pane-edge controls plus the flat global command; the edge control is a full-length band straddling the outer edge, never over the scrollbar or a resize separator | ADR 0006, design system §6 | #69, owner, 2026-09-19 |
| View names | One Title Case name per view everywhere, the exception to sentence case; no short second name, a narrow pane truncates | design system §8 | owner, 2026-09-19 |
| Move pane | One command opening a destination dialog; no pane dragging | design system §3 | #73 |
| Download | The global format chooser is canonical | design system §3 | #70 |
| Palette | One unconditional dark palette; no theme preference | ADR 0010 | #289 |
| Page titles | `Tabelo · Table editor for Markdown, CSV, JSON and more` on the shell, `{table name} · Tabelo` once a table is open; no not-found title, because every deeper path is the app, normalized to `/` | `AGENTS.md` identity, `copy/product.ts` | #373 |
| Grid wrapping | Per column, opt-in, off by default; one pane command wraps all columns | design system §9 | #41, #360 |
| Source wrapping | Off by default; a global default in Settings that each pane may override | design system §2 | #95, #276 |
| Source display defaults | Wrapping, spaces, tabs, empty values, line breaks, and column alignment each have a global default in Settings, all off except line breaks and alignment; a pane's override, set in its Display dialog, wins where set and is stored as a choice, never as the resolved value | design system §2, §3 | #55, #276, #396, owner, 2026-09-19 |
| Markdown line break | A line break in a Markdown cell is written `&#10;` by default and `<br>` when "Use <br> for line breaks in cells" is on, a global default a Markdown pane may override; the pane and every Markdown output follow it, and the parser reads both | ADR 0002 | #397 |
| Source column alignment | CSV, TSV, and Jira panes draw padding after each field so every column starts at one position, on screen only; on by default, off while wrapping, none for a draft that does not parse | design system §2 | #396 |
| Line break in a cell | Drawn as one-character `¶`, escaped or literal; in Markdown the room the sequence gave back becomes cell padding so delimiters stay aligned; display only | design system §2 | owner, 2026-09-19 |
| Syntax palette | "A · Quente": warm value hues, coral notation, blue links, quiet punctuation; value tones at least 4.5:1 on the code surface | design system §2 | owner, 2026-09-19 |
| Automatic source rewriting | Only named structural-assistance features: smallest deterministic range, one undo step with the triggering edit, invalid drafts untouched, switchable off per buffer | `AGENTS.md` domain rules | #294 |
| Markdown divider assistance | The alignment divider follows the header, rows, columns, and valid markers of the current draft, and is left alone whenever the draft is ambiguous; the first codec-declared structural-assistance feature | ADR 0005 | #297 |
| Markdown row-start assistance | Enter at the end of a table row below the divider opens the new line with `\| ` and the caret after it, in the same undo step; a break anywhere else, after the header, or with Smart editing off stays plain | ADR 0005 | #391 |
| Markdown column padding assistance | An edit inside one table cell re-pads that column in every row to its widest cell, measured as the serializer pads it (wide characters by display width, escapes as written), growing and shrinking with it; the divider follows, content and other columns are untouched, the caret stays put, and it lands in the same undo step; an invalid draft or Smart editing off stays as typed | ADR 0005 | #401 |
| Jira row-start assistance | Enter at the end of the header or a table row opens the new line with a bare `\|` (a space would be cell content) and the caret after it, in the same undo step; a break anywhere else, in a draft without a Jira header, or with Smart editing off stays plain | ADR 0005 | #391 |
| Source row move | `Alt`+`ArrowUp`/`ArrowDown` in a pane whose codec maps rows moves the table row under the caret as one document step, also offered in the pane's context menu; a draft that does not parse is refused with its reason; HTML, JSON, and Records keep the text line move | design system §9 | #255 |
| Source structural commands | A source pane that maps rows also offers move column, insert row or column, sort by the caret's column, and delete row or column in its context menu only, with no keyboard binding; each is one document step with the grid's refusals, and deleting the header row promotes the first data row | design system §3, §9 | #255 |

### Documents, formats, and persistence

| Decision | Current outcome | Recorded in | Decided on |
| :--- | :--- | :--- | :--- |
| Header import | Read an explicit format header; otherwise ask rather than guess | `AGENTS.md` domain rules | #23 |
| Table name | Renamed from the App Menu, outside undo; the browser title is `Table name · Tabelo` | design system §3 | #82 |
| Column width owner | A workspace preference keyed by column id | `CONTEXT.md` | #137 |
| Column and row size | A column width can be typed exactly or reset to the default; rows have no height setting and follow their text | design system §9 | #370 |
| Column width commands | Pointer resize, Fit column to content, and a keyboard resize | design system §9 | #81 |
| Cell types | Carried, never inferred from appearance | ADR 0008 | #147 |
| Inline formatting | Normalized inline content (marks, links, images) is document data in headers and textual cells, never marker text; `cellText` is its one projection; native values are never formatted | ADR 0011 | #306 |
| Inline editing | The Visual Table formats the complete text of each selected textual cell as one history step, adds, edits, and removes links and images in one cell through dialogs, and edits text in a restricted rich cell editor built on the browser's editing surface with the document as the only model, whose own menu carries the Format group for the range being edited | ADR 0011 | #306, #398, #399 |
| Rich cell editor clipboard | Paste into the rich cell editor inserts one cell's formatting from Tabelo's payload or HTML, never from plain text, and more than one cell as plain text; copy and cut write the fragment's text, semantic HTML, and exact structure (owner, 2026-09-19) | ADR 0011 | #306 |
| Inline syntax per format | Markdown, HTML, and Jira spell inline content in one canonical syntax each and never infer it from ordinary text; HTML input is untrusted, and formatting it declines keeps its text with a warning in the pane, the import, or the paste; CSV, TSV, JSON, and Records disclose the projection instead; only https images load and only web and email links open | ADR 0011 | #306 |
| Column type change | Changing a column's expected type converts its cells; cells that cannot follow without loss ask first, with Convert the rest or Cancel; one Undo | ADR 0008 | #392 |
| JSON shape | An array of row objects with explicit serializer preconditions | `CONTEXT.md` | #42, #145 |
| Source position mapping | A codec declares whether its parse maps each row and cell to source offsets; Markdown, CSV, TSV, and Jira do, HTML, JSON, and Records do not, and an unparsed draft maps nothing | ADR 0005 | #255 |
| Source column markers | Every source view whose codec maps its header cells shows the grid's column letters above its text, placed over the header line's cells, wrapped or not (on the header's first visual line) | design system §9 | #368 |
| Source axes | In a pane that maps rows, a column letter and a table row's line number open the grid's column and row menus (less grid-only preferences), a click selects the column's cells or the row's text, a drag of a selected one reorders it, and the keyboard reaches the menus from that selection; the divider and non-table lines offer nothing | design system §9, ADR 0005 | #395 |
| CSV export header | Always included | `AGENTS.md` domain rules | #148 |
| Persistence migrations | An explicit forward-only chain; unreadable data is kept and explained by reason | `AGENTS.md` architecture | #184, #32 |
| Codec escaping | Every escaping codec round-trips content losslessly | ADR 0002 | #183, #188 |

### Interaction and menus

| Decision | Current outcome | Recorded in | Decided on |
| :--- | :--- | :--- | :--- |
| Source undo after an outside change | A document change a source pane did not make (grid edit, another pane, menu command, row move, timeline step) clears that pane's keystroke history, so undo there walks the change back through the document timeline; the pane that made it keeps its history | ADR 0003 | owner, 2026-09-19 |
| Keyboard navigation | Two levels: Enter enters a pane, Escape leaves it; focus lost to a replaced pane lands inside the active pane; cell edits follow Google Sheets' enter and edit modes | design system §9 | #24, #54, #350, #366 |
| Row and column reorder | Keyboard and menu path plus pointer drag of a selected row number or column letter; no grip, no pane drag | design system §9 | #136, #139, #288 |
| Grid axis affordances | No icons beside row numbers or column letters; the context menu (right-click, `Shift`+`F10`, `ContextMenu`) is the grid's only menu; the gutter is sized for the number alone | design system §6 | #288 |
| Column resize shortcut | `Alt`+`Shift`+Left/Right on the focused column | design system §9 | #81 |
| Fit with wrapping | Fit is disabled with a reason while the column wraps | design system §9 | #81 |
| Menu grouping | Content, display, then pane actions | design system §3 | #70 |
| Group titles | Alignment, Edit, Move; no single-item title | design system §3 | #75, #81 |
| Cascading menus | Only for flat, immediate, self-explanatory command lists, one level deep; includes the grid's directional groups | design system §3 | #149, #155, #369 |
| New table | Confirm when work exists; success returns to the welcome surface | `AGENTS.md` domain rules | #39, #46 |
| Floating menu identity | Global commands; New table is destructive; identity includes copyright | design system §6 | #71 |
| Pinning | Optional first data row and first data column only | design system §9 | #160 |
| Sort, find, and fill | Sorting and find are in scope; every pane finds in what it shows, and replaces only where its view is editable; fill repeats and offers a numeric series | design system §3, §9 | #143, #144, #150, #280 |
| Whole-table structure | Transpose and Delete empty rows and columns are in scope, as floating menu commands; Transpose asks first, with Transpose anyway or Cancel, when first-column numbers, booleans, or nulls would become header text; both report in a notice with Undo, which also restores the removed columns' widths and wrapping | design system §5 | #235 |
| `Mod`+`D` | Belongs to a focused editable source editor and to the grid, unconditionally; the grid adds the next cell with exactly the same value | design system §9 | #232, #361 |
| Empty source field | One caret stop, at the value start | design system §2 | #345 |
| Empty-value placeholder | Drawn in every source view; never over a typed literal or over a Records blank line that is also the record separator | design system §2 | #274 |
| `Tab` in a source editor | Never leaves the editor; grid-shaped formats move between parsed fields, wrapping; JSON and HTML indent; `Escape` exits | design system §9 | #54 |

### Accessibility and presentation

| Decision | Current outcome | Recorded in | Decided on |
| :--- | :--- | :--- | :--- |
| Notices | A fixed overlay, never layout content | design system §5 | #44 |
| Copy rules and vocabulary | Text, source view, unfinished edits, formatted table, match, Smart editing; `New table` and `Settings` allowed; contractions outside labels; disabled reasons say how to unblock | design system §8, `CONTEXT.md` | #78 |
| Active pane | A non-layout-shifting boundary | design system §5 | #64 |
| Destructive contrast | The token and the variant both own the correction | design system §2 | #109 |
| Spacing scale | Stays `0.5, 1, 1.5, 2, 3, 4, 6`, not a doubling scale | design system §2 | #354 |
| Precondition correction | Lead the user to the first offending cell when possible | design system §4 | #146 |
| Pinned source header | The codec's first mapped row, Markdown divider included, stays at the top of a scrolled source pane as an inert copy | design system §2 | #252 |
| Grid lines | Subtle where the grid continues, strong where chrome meets the table; no state recolours a line | design system §9 | #346 |
| Selection on letters and numbers | A neutral surface and semibold label, never the selection fill | design system §9 | #291 |
| Copied mark and focus | One two-tone marquee on a focused copied cell, on the range's real edge | design system §4 | #223, #349 |
| Project mark | `logo.svg` is the one source for every icon | design system §6 | #307 |
| Settings | Display preferences apply as they change, with a live preview, `Switch` rows, and a `SegmentedControl` for spaces | design system §3 | owner, 2026-09-18 |
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
