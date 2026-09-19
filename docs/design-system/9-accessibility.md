Part of the [Tabelo Design System](../design-system.md). Its entry point lists every part.

## 9. Accessibility floor

These are requirements, not aspirations:

- The grid is fully operable from the keyboard, including reordering. The model
  below is the contract, not a summary of it.
- **No shortcut requires more than three simultaneous physical keys**, counting
  every modifier and the final key. `Mod` is one physical modifier on the
  active platform, and a chord that reaches four keys is not offered at all
  rather than offered and hard to press. The rule is product-wide: app, pane,
  grid, and source-view bindings are all subject to it, and so is every view
  registered later. An action whose chord would exceed the limit keeps a
  visible, keyboard-navigable command path instead: a menu entry is a path, a
  longer chord or an undocumented key sequence is not. `copy.shortcuts` is the
  metadata this is checked over, and a unit test fails when any legend there
  names four keys.
- Every control has an accessible name. An icon-only action takes it from
  `ControlTooltip`'s `name`, which also shows it on hover and focus ([§3](3-components.md)).
- Focus is always visible and never trapped.
- Interface chrome is not text-selectable. Source text and rendered view
  content remain selectable; the visual grid uses structural cell selection
  instead of native text selection. Line numbers, pane titles, controls, dialog
  copy, menu copy, and portalled floating layers do not become selectable.
- Status is conveyed by text as well as colour.
- Contrast meets WCAG AA against the surface the element actually sits on.
- Nothing depends on hover alone: hover-revealed affordances also appear on
  keyboard focus.
- Use progressive disclosure for low-frequency actions, but keep the owning
  scope and menu label explicit. Do not require users to decode unfamiliar
  icons or remember hidden locations.
- Keep visible copy short, literal, and stable. Do not move controls or resize
  panes when selection or status changes.
- Accessibility validation must be executable in the CLI pipeline: inspect the
  browser accessibility tree and automate roles, names, states, relationships,
  keyboard paths, focus, and contrast. NVDA, JAWS, VoiceOver, and other GUI-only
  assistive applications are never acceptance or closure criteria. A separately
  arranged manual session can inform research, but it does not block delivery.
- The design may reduce common cognitive barriers, but Tabelo must not claim
  suitability for dyslexia, ADHD, or another condition without task-based
  sessions with representative participants. Record participants, tasks,
  outcomes, and changes before making such a claim.

### The grid keyboard model

One rule shapes the rest: **the workspace is a two-level ring. `Tab` walks between panes; `Enter` enters a pane, and `Escape` exits it.** A widget that answers every key is a trap, so the escape hatch is unconditional.

**What is at the workspace level is fixed per pane, never per row or per
column.** The ring holds the pane frame and the one trigger in its header, the
pane actions chevron ([§5](5-layout.md)), and that is all: the header is chrome that belongs beside the pane, not content
inside it. Everything the view itself contains, including every select handle
the grid grows and its context menu, is reachable only after entering. So the number
of stops the ring holds is a property of the layout and never of the table.

A pane counts as entered when focus is in its **body**. Two consequences that
are easy to get wrong and both cost the whole model: focus reaching a header
trigger is not entry, and a scrolling body is not a tab stop. A browser puts an
overflowing scroll container into the tab order on its own, so every scrollable
surface in a pane states `tabindex="-1"` and is focused deliberately or not at
all.

`Enter` lands on what the view says is its content: the grid's focused cell,
the source editor, or, for a view with nothing focusable in it, its scroll
container, so the arrow keys still work.

**The context-menu gesture opens Tabelo's menu in both editing views** (#234).
Right-click, the Menu key, and `Shift`+`F10` are one request, so the grid and
every source view answer all three with their own menu, and a keyboard user
reaches it exactly as a pointer user does. The source view's text commands are
only ones its keymap already binds, each with that shortcut: Cut, Copy, Paste,
Undo, Redo, Select all, and Select next match. Its table commands, where the
format maps rows, are the one exception: see the row move below (#255). Both
views list their commands in the one order every table menu shares
([§3](3-components.md)), so a command sits in the same place in either.
`Shift`+right-click in a
source view is left to the browser, because inside a text surface the browser's
menu holds things worth keeping: spelling suggestions, look up, its text
actions. The grid takes the gesture outright, since a cell offers the browser
nothing of the kind. The bypass is recorded here rather than printed inside the
menu, which holds commands only. A right-click inside the selection keeps it;
`Escape` closes the menu and returns focus to the text, and a second `Escape`
leaves the pane.

| Key | Effect |
| :--- | :--- |
| Arrows | Move the focused cell. They stop at the edges and never leave the grid |
| `Shift`+Arrows | Extend the active area from its anchor |
| `Mod`+Arrows | Jump to the edge of the data along that axis |
| `Mod`+`Shift`+Arrows | Extend the active area to that same edge |
| `Alt`+Arrows | Reorder one contiguous row or column block. A header-touching selection cannot move rows; several areas never collapse into one |
| `Mod`+`Alt`+Arrows | Repeat one contiguous data-cell selection into one more row or column in the requested direction |
| `Alt`+`Shift`+Left / Right | Narrow or widen the focused column without reordering it |
| `Tab` / `Shift`+`Tab` | Move one cell in reading order, wrapping at row ends and grid edges. It never leaves the grid |
| `Home` / `End` | First or last column of the row; with the modifier, the first or last cell of the table |
| `Enter` / `F2` | Edit the focused cell. On a column header, rename it |
| `Space` | On a column header, select the column: activating a button does what buttons do |
| `Ctrl`+`Space` | Add the focused cell's column to the selection, or take it away |
| `Ctrl`+`Shift`+`Space` | The same for its row |
| `Shift`+`F10` / `ContextMenu` | Open the grid menu where focus is. On a row number or column letter it is that axis's menu; on a cell the selection decides: whole rows get the row menu, whole columns the column menu, anything else the cell menu (#288). Opened on a cell, every one of them carries Move focus, keep selection |
| `Escape` | Close the innermost thing first: cancel an edit, close a menu, clear the copied mark, collapse a selection to one cell. If nothing else is open, exit the pane |
| `Backspace` | Clear the contents of the selection |
| `Mod`+`Backspace` | Remove the selected rows or columns |
| `Mod`+`Enter` | Add a row below |
| `Mod`+`Shift`+`Enter` | Add a row above |
| `Alt`+`Enter` | Add a column after |
| `Alt`+`Shift`+`Enter` | Add a column before |
| `Mod`+`F` | Open this pane's find bar and put the caret in it. Taken from the browser deliberately: its own find searches the rendered chrome rather than what the pane shows |
| `Mod`+`B` / `Mod`+`I` / `Mod`+`U` | Toggle bold, italic, or underline over the whole text of every selected textual cell, as one history step (#306) |
| `Mod`+`Shift`+`S` / `Mod`+`Shift`+`M` | Toggle strikethrough or inline code the same way |
| `Mod`+`K` | Open the link dialog for the one selected cell |
| `Mod`+click on a link | Open the link. A plain click selects the cell |
| Any printable character | Replace the cell and start editing. With several cells selected, the commit writes every selected cell (see below). On a row number or column letter, type over the selection it made; `Space` stays the button's own |

**Typing over a selection writes every selected cell** (owner, 2026-09-19).
The source views put one caret in each selected cell, so the grid does the
same. The editor still opens on the focused cell alone, however the edit
starts: a printable key, `Enter`, or `F2` on a cell, or a printable key on
the row number or column letter that made the selection. The other selected cells keep the
ordinary selection fill while the draft is open, which is what says they will
receive it; nothing new is drawn. The commit (`Enter`, `Tab`, or a click away)
writes the committed value into every selected cell, header cells included,
as one history step, so one undo restores them all, and `Escape` writes none.
Each column enters the value by the single-cell rule for its expected type
(`docs/adr/0008`); a draft some column cannot take unambiguously asks the
typed-cell question once for the whole selection, preferring the column being
typed in. Opening an editor and committing without typing anything writes
nothing. The selection stays as it was rather than moving on, since moving
would collapse it, and the polite channel says how many cells were set,
because only the edited cell shows it happen. A double-click still collapses
the selection to the cell it lands on first.

**Formatting keeps the grid's keyboard model** (#306). A mark chord that
the selection cannot take, because it holds only numbers, booleans, null, or
empty cells, does nothing but say why in a notice; the same reason is the
disabled Format segment's description. A formatting change is spoken through
the polite channel, since nothing else announces it. Inside the cell editor
the same chords act on the selected text, or set the marks the caret types
with; `Mod`+`K` opens the link dialog for the selection and returns to the
editor; `Mod`+`Enter` opens the link at the caret; `Mod`+`Z` and
`Mod`+`Shift`+`Z` walk the editor's own history while it is open. Enter,
`Shift`+`Enter`, Tab, Escape, F2, and the arrows keep their editing meanings.
The editor is a `textbox` named by position, like the one it replaced.

**A jump reads what the grid shows, and follows one rule on both axes** (#142).
When
the next cell continues the non-empty run the focus is already in, the target
is that run's far edge; otherwise the jump crosses the gap to the next cell
holding something; and when nothing holds anything in that direction, it lands
on the table's own edge. Only empty versus non-empty participates, and empty
means what the cell draws as empty, so a stored `null` and an empty string
behave alike. Nothing here reads a type out of text: see `docs/adr/0008`.

Vertically the header row is a structural endpoint rather than the first row of
data. An upward jump lands on it once the data above runs out, and a downward
jump from it begins at the first data row rather than treating the column's
name as the start of a run. Horizontally the header row is an ordinary line and
its names are walked like any other row's values.

**The four insert chords are one symmetric family**, so learning one teaches
the rest: `Mod` inserts a row, `Alt` inserts a column, and `Shift` chooses the
preceding side, above or left. Each one ends in the same store action as the
matching insert menu item, each menu item shows its key, and none of the four
reaches the three-key limit's edge with a modifier to spare. `Mod`+`Alt`
together no longer name an insert: that chord is unassigned, and it neither
inserts nor falls through into editing. A source view whose codec maps rows
answers the same four chords on the caret's row and cell (owner, 2026-09-19):
see the source-editor keyboard model below.

Moving the focus while keeping several selected areas has **no chord at all**.
Every arrow combination inside the limit is spent: `Alt` reorders,
`Mod`+`Alt` fills, `Alt`+`Shift` sets column width, and the jump above took
`Mod`. So it lives in the cell context menu instead, as the **Move focus,
keep selection** submenu (#369), whose four directions carry no shortcut legend and are
disabled at the table's edges with the reason written out. That is what keeps
multi-area selection off the pointer: `Ctrl`+`Space` adds the column the focus
is in, and the menu is what carries the areas already selected past the move to
the next column. The menu opens from the focused cell with `Shift`+`F10` or the
`ContextMenu` key as well as with a right-click. Once `Ctrl`+`Space` has selected
the whole column, that key opens the column menu instead (#288), and the
submenu stays there too: it follows the cell the menu was opened on, not the
axis, or the first step of the path would be lost. Closing it returns focus to the cell the
action moved to, revealed clear of the sticky chrome like every other focus
move. `Alt`+`Shift` with the left or right arrow sets column width only while
`Mod` is not held (#137; the guard in `table-grid.tsx` requires `!mod`).

Every arrow chord this grid does not name is left to the browser. A removed or
unassigned combination returns without preventing the default rather than
falling into the branch below it: that is what stops `Mod`+`Alt`+`Shift`+arrow
from quietly becoming a reorder now that its own branch is gone.

The two `Space` chords are the one place the key table names `Ctrl` rather than
`Mod`. Both modifiers count as the modifier everywhere, but macOS keeps
`Cmd`+`Space` for itself and the page never sees it, so `Ctrl` is the one that
is true on every platform. macOS reserves `Ctrl`+arrows the same way, so there
it is `Cmd` that carries `Mod`+Arrows. Whichever one the platform leaves alone
is the one that works; neither chord is unreachable anywhere.

While a cell or header editor is open it owns every key, and the grid's own
handler stands down: a `Backspace` in an editor must never delete the row the
editor is sitting in.

A cell editor has the two modes Google Sheets has (#366). An edit started by
typing over the cell is quick entry: a bare arrow key commits it and moves one
cell in that direction, onto the header row too. An edit started with `Enter`,
`F2`, or a double click is for changing the text: the arrows move the caret.
`F2` switches between the two while the editor is open. Arrows with a modifier
always belong to the text. The header editor keeps every arrow for the caret.

An editor never changes the height of the row it sits in (#375). In a wrapped
column the value is what makes the row tall, so the editor keeps supplying that
height from its draft and the row grows as lines are typed. In an unwrapped
column the editor grows over the rows below instead, because that column's
rows are one line by the owner's choice and the edit is momentary.

Moving the pointer to another cell, header, grid control, or surface outside
the grid commits the open editor before the destination takes focus, just like
`Enter` or `Tab` (#135). `Escape` is the only exit that discards the in-progress value.

**Every pointer affordance needs a keyboard equal.** Column width is the case
that proves it: the drag handle stays pointer-only and `aria-hidden`, while
`Alt`+`Shift`+Left/Right resizes the focused column and announces the resulting
width or limit through the grid status channel. The column's menu (the grid
context menu opened on its letter) adds Fit column
to content for the common automatic case and Set column width for an exact
one (#370), not stepping commands or a live numeric readout. Set column width
opens a dialog, because a typed number is a choice a menu cannot hold: it takes
the width in rem, the unit the announcements speak, refuses a value outside the
bounds rather than clamping it, says when the column is at the default, and
offers Use default to go back to it. Rows have no height setting: a row is as
tall as its text, and a fixed height would clip a wrapped value (#370).
The modifier click that builds a selection out of several
areas is the same obligation, and the two `Space` chords above are its answer.

**An equal is an addition, never a replacement** (#139). Reordering ships both ways:
`Alt`+arrows and the menu's four Move actions stay exactly as they are and
remain the accessible path, and dragging a selected row number or column
letter is offered beside them (#288).
Both routes end in the same store action, so a drag can never produce a document
shape the keyboard could not, and both are one history step.

Copy fill follows the same rule (#203). One handle sits at the active corner of one
contiguous data-cell selection, and the cell context menu keeps Fill up, down,
left, and right visible. `Mod`+`Alt`+arrows are the direct keyboard equal. All
three routes end in the same store action, tile the source values without
parsing or coercion, update every view immediately, and commit the complete fill
as one document-history step. A header-touching or several-area selection has no
handle, while the menu actions remain visible and explain why they are
unavailable.

The fill handle is a focusable overlay control with the 1.75rem control target
and a small square mark at its centre. It tracks the selected cell geometry, so
pane zoom, scrolling, resized columns, and wrapped rows need no parallel
position state. Its crosshair cursor keeps it distinct from cell selection,
column resize, and reorder. Once a drag crosses the shared threshold, its
dominant axis locks for that gesture. A dashed selection-colour preview covers
only the cells that would be added; it is static at every motion preference,
because [§7](../design-system.md#7-motion) never animates grid geometry. `Escape`, pointer cancellation, lost
capture, window blur, or a release back inside the source clears the preview and
changes nothing.

**A series is a second command, never a reading of the first** (#204). A fill repeats
what was selected and stops there. When the repeated cells were a single row or
column of at least two cells that already held numbers, separated by one
constant step, the fill leaves behind an offer: an info notice carrying
`Continue series` and `Keep repeated`. It says what a series would do and does
nothing until the user picks one. Choosing the series is a second document
operation and therefore a second undo step, so undo returns the copied result
before it returns the table the fill replaced. Dismissing it, answering `Keep
repeated`, or any change to the document clears it, and it is never
persisted, never history, and never document state.

The offer is a notice rather than a dialog because the fill already did what it
was asked to: nothing is pending, the table is correct as it stands, and [§3](3-components.md)
allows a dialog only for a choice the user's own command requires. That is also
why activation revalidates rather than trusting the offer. If the rows or
columns it named have moved, or the numbers would leave the range the arithmetic
stays exact in, it says so in a warning and writes nothing rather than applying
part of a sequence.

What is offered is deliberately narrow, and each exclusion is a decision rather
than an unimplemented case. Text that looks like a number is text and is never
read as one, because a type is carried and never derived: see `docs/adr/0008`.
A single value implies no step, so it offers nothing rather than assuming one.
Dates, weekdays, custom lists, text patterns, formulas, and series in two
directions at once are not offered at all: this is a table editor, not a
spreadsheet, and each of those is a guess about intent dressed as a
convenience.

**A press means one thing in one state** (decided on #288, replacing "one
gesture on one target" and its separate reorder grip). The row number and the
column letter carry two drag gestures, and the current selection, not a second
target, decides which a press makes, as it does in Google Sheets:

| Press on a label | Result |
| :--- | :--- |
| Touch | Selects, as a tap; a drag scrolls the pane and never reorders |
| Any button but the primary | Nothing; the context menu owns it |
| With `Shift` or the modifier | Extends or toggles the selection, never a reorder |
| On a row or column outside the selection | Selects it, and drag-selects along the axis |
| On a row or column inside one contiguous selection | Picks up the whole selected block to move it |

The header row never moves, since every table keeps it first, so a press on
its number only selects. A reorder begins only once the pointer crosses a small
threshold along its own axis, so a press on a selected label that does not
travel is a click, and selects that row or column alone. The column letter's
trailing edge is a separate element and only resizes. The cursor carries the
state: `pointer` on a label at rest, `grab` once its row or column would move,
`grabbing` while held.

While a block is being dragged, one line marks the gap it will land in. The
document changes once, on drop. `Escape`, a cancelled or lost pointer, and a
drop back where the block already sits all leave the document and the selection
untouched.

### Selecting several areas

A selection is an ordered list of areas, and a single area is the ordinary
case: every gesture except the modifier produces exactly one.

- A plain click replaces the selection. `Shift` extends the **active** area,
  the one the keyboard is working in. The platform modifier adds an area, or
  removes one when the click names an area already selected.
- `Mod`+`Shift`+click extends the area the modifier most recently added, so the
  two gestures compose instead of fighting.
- Removing works along the axis the click names. A modifier click on a selected
  column letter subtracts that column, splitting one area in two when the
  column sat in the middle of it. A cell has no axis to subtract along, so a
  modifier click on one adds an area unless it names exactly that single cell.
- A selection is never empty. A subtraction that would empty it does nothing.
- Every count is a set: two areas covering the same column still describe one
  column, so a label never promises to delete something twice.
- **Keeping what is already selected while the focus moves is a menu action,
  not a chord.** Move focus, keep selection in the cell context menu moves the
  focused cell without discarding the other areas, which is what lets
  `Ctrl`+`Space` reach a second column at all. The single cell the focus sits
  on is provisional: moving it moves that cell rather than leaving a trail of
  one-cell areas, and turning its column or row into an area replaces it
  instead of painting it twice. It changes no document state and adds no
  history step.

**`Mod`+`D` belongs to a focused, editable source editor, unconditionally.**
It adds the next occurrence of the selected text to the selection, and while an
editable source editor has focus it takes the key every time, including when
there is no next occurrence to add; a press with nothing to add changes nothing.
The browser's own `Mod`+`D` bookmarks the page, and it cannot be given a
different modifier the way the two `Space` chords were, because the browser
claims it on every platform. So the key is taken for exactly as long as the
user is inside a pane that uses it: a read-only view, a dialog, a menu, and the
page background all leave it to the browser, and `Escape`, which always exits
the pane, gives it back. The grid uses it too (#361): with a cell focused, each
press adds the next cell, in reading order and wrapping, whose value is exactly
the first cell's value (same carried type, same value, no case folding) as a
new area, and announces how many are gathered; with nothing left to add it
still claims the key and changes nothing. An outcome that depended on whether a
next match happened to exist would be a shortcut the user cannot predict.

**Find is a second way of moving the selection, never a second highlight.**
Every pane finds in what it shows (#280, superseding #144's "grid-pane only"
and "the rendered preview is out of scope"). `Mod`+`F` opens the find bar ([§3](3-components.md))
of the pane the user is in, and that pane's only, and `Escape` closes it,
returning the caret to the pane's own surface: the grid cell the last match
reached, the source editor, or the preview's scroller. Each pane takes the chord
at its own surface, the grid surface, the source editor, and the preview's
scroller, so the browser's find never opens over a pane. A cell or header editor
still owns every key while it is open. The pane menu carries the same command,
because a capability whose only entry point is a chord nobody was told about
fails the progressive-disclosure rule above. Each pane keeps its own query, so
two panes can search for different things at once; one query shared across
panes is out of scope. What the user typed is transient state, never persisted,
and closing a pane or changing its view drops it.

**A source pane searches its own text**, not the table behind it: a match in
Markdown is a match in the Markdown the user is looking at, separators and
escapes included. Matching, stepping, and replacing are CodeMirror's own search
commands, literal and never a regular expression, driven from the pane's bar
rather than from CodeMirror's panel. The count and the current position come
from the same search the commands run, and the current occurrence is the
editor's own selection, so what the bar says and where Enter lands cannot
disagree. A replace is an ordinary editor edit: it leaves the draft valid or
invalid exactly as typing the same change would, the other views follow through
the normal synchronization path, and undo treats it like typing.

**The rendered preview searches the text the reader is shown**, with the grid's
matching rule below, and offers find without replace. Its mark is painted
through the CSS Custom Highlight API, so the preview's DOM never changes and its
neutral-document treatment ([§3](3-components.md)) and every copy path keep one unbroken value.
A formatted cell is searched as the text it reads as, across its formatting,
with a link's label and an image's alternative text included and a URL never
(#306); a match that touches an image marks the whole image.

In the grid, matching is literal, left to right, non-overlapping, and
case-insensitive until the toggle says otherwise. It runs over the canonical
table in document order,
the header row first, because a header cell is an ordinary cell for every
purpose the user can observe. Cell values are opaque strings: nothing is
trimmed, normalized, unescaped, or read as a type, so a value holding `|` or a
newline is matched as exactly those characters and never as the syntax some
other format would wrap them in.

Stepping to a match **replaces the grid selection** with that cell and reveals
it clear of the sticky chrome, the same contract every other focus move honours.
The bar keeps the caret while this happens, so the walk is announced through the
shared polite channel rather than by the cell taking focus. Closing keeps the
cell the last match reached selected; restoring a selection the user has since
navigated away from would be a second surprise.

Only the **current** occurrence is marked, and only the characters that matched:
the product's solid accent with its paired foreground, drawn inside the value
the cell already shows. A source pane and the preview mark theirs the same way.
Every other match receives no second highlight,
because a second kind of highlight is a second visual language and [§1](../design-system.md#1-the-design-line) commits to
one. The mark is presentation and nothing else: the cell's accessible value, its
native tooltip, and every copy path still see one unbroken value, and which
occurrence it is comes from the written count rather than from the colour.

Select every matching cell turns the result into an ordinary grid selection,
one area per cell rather than per occurrence, which hands it straight to the
operations that already act on a selection: clear, copy, delete, alignment. It
counts coverage like every other selection, so a cell holding the query twice is
still one cell, and the grid's own extent announcement says how many, so nothing
is announced twice. The cell the bar was on stays the focused one.

Replace acts through the ordinary cell and header edit path, so one replacement
is one history step and Replace all is exactly one, whatever it touched.
Replaced text is written back as a string: a projection that was rewritten is
text, and nothing reads a type off it. A replacement equal to what was already
there writes nothing at all, so a native value keeps its type. Replace resumes
past what it just wrote, so a replacement containing the query cannot press back
on top of itself. The whole of it is transient: the query, the match list, and
the position never reach the document, the history timeline, or `localStorage`,
and the list is recomputed after every document change rather than having its
offsets patched.

**Operations that need one place to act say so.** Insert above, below, left and
right, the four moves, fill, and paste each need a single insertion point or
origin, and several areas name several. Fill additionally requires data cells
only. These actions are disabled with the reason written out, never hidden, per
[§4](4-interaction-states.md). Copy, cut, clear, delete, duplicate, alignment and width all act on the
union of the areas.

The announcement states the total across every area, not the extent of the last
one: two selected columns announce as two.

Cursor shape confirms the interaction before a click: buttons, menu actions,
checkboxes, radio controls, and clickable row or column labels use `pointer`;
editable text uses `text`; cells use `cell`; split and column handles use the
matching resize cursor; a row number or column letter whose row or column is
selected, and so would move, uses `grab`, and `grabbing` while held;
the fill handle uses `crosshair`; disabled controls use `not-allowed`. Do not
apply a pointer cursor to passive labels or read-only content.

### The source-editor keyboard model

A source editor is a text editor first, so it keeps CodeMirror's own editing
keys, and the table above does not apply inside it. What it adds is decided per
view by the registry, never per format in the editor: each editable source view
declares what `Tab` does (`sourceTab` in its capabilities), and a view that
moves between fields reads them from its codec's own grammar. Decided on #54.

**`Tab` never leaves a source editor.** A `Tab` that moved focus to the next
pane mid-typing is the one thing a table editor must not do, and in TSV it is
the delimiter the user was about to type. So every source editor consumes it,
whatever its view declares, and `Escape` is the exit, exactly as in the grid:
it returns focus to the pane frame, from where `Tab` walks the workspace ring.
The editor is therefore not a keyboard trap, and the exit is one key.

**Grid-shaped formats move between fields.** Markdown, CSV, TSV, Jira, and
Records declare `next-field`. `Tab` puts the caret at the start of the next
field's content, `Shift`+`Tab` at the previous one, and both wrap at the ends of
the text. A field is what the format's parser reads as one, so a delimiter or
a line break inside a quoted CSV value, an escaped pipe in Markdown or Jira, and
an escaped separator in a Records label are never stops. The separator is the
one the view parses with, so a semicolon in the CSV view is data (#217). A
field's content starts inside a quoted value's quotes, after a Markdown cell's
padding, and after a Records label: only values are stops, and nothing is
inserted to make one. The caret belongs to the field it is in, or to the one it
follows when it sits on a delimiter or padding. A draft that does not parse
still moves, over whatever fields its text spells; the stop only moves the
caret and never changes the text. In these views `Enter` inserts a plain line
break: their whitespace is data or padding, so nothing is copied from the line
above and nothing after the caret is removed.

**Nesting formats indent.** JSON and HTML declare `indent`. `Tab` indents the
line by one unit and `Shift`+`Tab` outdents it; the unit is two spaces, the
indentation the serializer writes. `Enter` continues the new line at the
syntactic depth, and typing a closing bracket or tag re-indents its line. Each
indentation is one ordinary edit: one step of local undo, then the document
timeline beyond it (ADR 0003), and a draft like any other typing.

**`Alt`+`ArrowUp` and `Alt`+`ArrowDown` move the table row, as in the grid,
wherever the format can say which row the caret is in** (owner, 2026-09-18).
Whether it can is the codec's position mapping (`mapsSourceRows`, ADR 0005),
never the view's name: Markdown, CSV, TSV, and Jira map a caret to a row and
column, so there the chord runs the grid's row move on the row under the caret,
as one document step. A text line move would break a Markdown divider or split
a quoted CSV row, which is why one key means one thing in every tabular view.
The caret follows the moved row into the same cell. Like any document change
the pane's own typing did not make, the move clears the pane's keystroke
history, so the next undo there reverses the move rather than older typing;
nothing is lost, because every committed parse is already a step of the
document timeline (ADR 0003). A move the grid would refuse (the header
row, the first row upward, the last row downward) is refused here with the
same written reason, and so is a caret outside the table and any draft that
does not parse: its text names no row the document has read, and acting on the
last valid parse would move a row the user is not looking at. The source pane's
context menu offers the same two commands as Move up and Move down, under Move,
disabled with that reason. Decided on #255. HTML, JSON, and Records map their
rows as blocks too (#402, amending #255, which had left them the text line
move), so every editable source view now moves the table row; a view whose
codec mapped no rows would keep CodeMirror's text line move and a menu with
no row commands.

**The rest of the grid's structure is in the same menu** (owner, 2026-09-19,
option A on #255). Beside the two row moves, a pane that maps rows offers
Insert row above and below, Insert column left and right, Duplicate row, Move
left and right under Move, Sort ascending and descending under Sort, and
Delete row and column, each acting on the row or column under the caret as
one document step with the pane's keystroke history cleared, like the row
move. **The inserts take the grid's four insert chords** (owner, 2026-09-19):
`Mod`+`Enter` and `Mod`+`Shift`+`Enter` insert a row below and above the
caret's, `Alt`+`Enter` and `Alt`+`Shift`+`Enter` a column right and left of
its cell, with the same refusals as the menu items, which show those legends.
`Mod`+`Enter` replaces CodeMirror's blank line below there; a view whose codec
maps no rows keeps it. The other commands are menu-only: a new chord would
compete with the editor's own text bindings for commands used far less often.
A column move in particular has none, because `Alt`+`ArrowLeft` and
`Alt`+`ArrowRight` are the editor's word motion on macOS. The refusals are the grid's
and the row move's, each written out on the disabled item: a draft that does
not parse, a caret outside the table, or, for a column command, outside any
cell; nothing inserted above the header row; the last row or column kept;
sorting needs two rows. Deleting the header row promotes the first data row
into it in the same step. The caret then lands where the user would look: in
the new row or column after an insert, in the row or column that took the
removed one's place after a delete, and in the same cell, wherever it went,
after a column move or a sort.

**The line numbers and the column letters are the grid's axes** (#395). In a
pane that maps rows, the column letters (see Column markers below) and the
line number of every line holding a table row's cells behave as the grid's
column letters and row numbers do, and reach the same commands through the
same position mapping, never by counting text lines. Where a row is a block
(#402), a JSON object, a Records entry, or an HTML `<tr>`, every line of it
is that row's line number, its brackets and tags included, however the user
spread it; those views have no header line of cells, so they show no letters
and their header row, spelled as keys or as a `<tr>` of its own, is reached
from the caret, and from the header `<tr>`'s line numbers in HTML; their
column commands stay in the text menu wherever the caret is in a cell. In
every pane that maps rows:

- **Right-click** on a letter opens that column's menu: its expected type,
  its alignment where the format spells it (Markdown; the codec's
  `columnAlignment` reconciliation is `carried`), insert left and right, Move
  left and right, Sort ascending and descending, and delete. The
  grid-only preferences (width, fit, wrapping, pinning) stay in the grid. On
  a row's line number it opens that row's menu: insert above and below,
  duplicate, Move up and down, and delete. Both are named as the grid's are,
  `Column actions: <column>` and `Row actions: Row N`, and each command is one
  document step that leaves the caret in the row or column it acted on. An
  expected type some cells cannot follow asks first, in the grid's dialog. The
  alignment divider, a blank line, and text outside the table (a JSON array's
  `[` and `]`, HTML's `<table>` and section tags) name no row, so their line
  numbers offer nothing, and while a draft does not parse no line names a row:
  a right-click there says why and opens nothing.
- **A click** selects what the label names: the row's text, or every cell of
  the column as one range each (inside a quoted field's quotes, past a
  Markdown cell's padding), with the header's first, so typing edits them all.
  Opening a label's menu selects it the same way.
- **A selected row or column looks like the grid's** (owner, 2026-09-19),
  whatever text the selection holds. A column is one `--selection-fill` band
  per text line, from the delimiter before its cell to the delimiter after it,
  padding, alignment room, and empty-value placeholders included, on every
  line from the header's to the last row's: a line between two rows (the
  Markdown divider) and a line inside a row that holds no cell of the column
  (a CSV record's quoted line break) carry the band on, so it has no gap. A
  row is one band per text line of the row, from its first cell's opening
  delimiter to its last cell's closing one, never the text selection's ragged
  shape. Nothing is drawn over the band: the grid marks one focused cell
  because a grid cell is where editing goes, while here typing goes to every
  selected cell at once through its carets, one per cell, so a focus mark on
  one of them named a target that is not there (owner, 2026-09-19). The text
  band does not draw these selections a second time, and a selected row or
  column is not a search: the pane header shows no match count for it, even
  when its cells read alike. Where rows are blocks (#402), a JSON object, a
  Records entry, or an HTML `<tr>`, their lines do not line up in cell slots,
  so a selected row or column there keeps the text band, which shows exactly
  the text it holds; it is still no search and shows no match count.
- **One current line.** The active-line fill and its number's lift follow the
  main selection alone, as the grid has one focused cell however many are
  selected; a column no longer tints every row it crosses. Every other line a
  selection reaches marks its number the way the grid marks a reached row
  number, semibold foreground with no surface, and a selected column's letter
  takes the same weight. A lone caret marks only its current line.
- **A drag** from a label whose row or column is already selected moves it,
  with the grid's gesture: the threshold, the one line marking the gap it will
  land in, one document step on drop, and `Escape`, a lost pointer, or a drop
  where it already stands changing nothing. Moving the pointer past the
  text's edge along the dragged axis scrolls the text. The moved row or
  column stays selected. The header row only selects.
- **From the keyboard**, the selection decides, as it does in the grid: with a
  selection that is exactly one row's text or one column's cells, `Shift`+`F10`
  or `ContextMenu` opens that row's or column's menu, and otherwise the text
  menu. The text menu's Select row and Select column make that selection from
  the caret, so every label command is reachable without a pointer, and no
  label is a focus stop: `Tab` never leaves a source editor.

| Key | Field views | Indent views |
| :--- | :--- | :--- |
| `Tab` | Next field, wrapping to the first | Indent the line one unit |
| `Shift`+`Tab` | Previous field, wrapping to the last | Outdent the line one unit |
| `Enter` | A plain line break | A line break at the current depth |
| `Alt`+`ArrowUp` / `Alt`+`ArrowDown` | Move the table row, where the codec maps rows; otherwise move the text line | Move the table row, where the codec maps rows (#402); otherwise move the text line |
| `Mod`+`Enter` / `Mod`+`Shift`+`Enter` | Insert a table row below or above the caret's, where the codec maps rows; otherwise `Mod`+`Enter` keeps CodeMirror's blank line below | The same |
| `Alt`+`Enter` / `Alt`+`Shift`+`Enter` | Insert a column right or left of the caret's cell, where the codec maps rows | The same |
| `Shift`+`F10` / `ContextMenu` | The selected row's or column's menu when the selection is exactly one, where the codec maps rows; otherwise the text menu | The text menu |
| `Escape` | Return focus to the pane frame | Return focus to the pane frame |

### Naming inside the grid

A cell is named by **its value**, never by its coordinates. Row and column
headers carry the context around it, so a screen reader composes the
announcement itself and stays quiet about the parts that did not change as the
user moves along a row.

That means header cells name themselves after what they contain, not after the
controls they hold: the header row is visibly numbered 1, the first data row is
"Row 2", and each column header is its own text. The header row sits on the
content surface in semibold, matches the body row height, and paints the
selection fill whenever selected. Its text position reflects left, centre, or
right alignment; the editable cell carries no separate alignment or menu icon.
An `aria-label` on a gridcell is a defect: it replaces the content with
coordinates and repeats them on every arrow key.

The real type supplements that content instead of replacing it (#200). Every native
number, boolean, and null, plus any string that diverges from its column
expectation, includes visually hidden full type text inside the gridcell.
The visible compact mark appears only for divergence, and is the same symbol
the Cell type menu shows for that type rather than an abbreviation. An empty
string never counts as divergence: a blank cell is blank, whatever its column
expects (owner, 2026-09-19). A null cell therefore
has a written accessible value even though its `cellText` projection is empty.
Opening its editor retains the native-value typeface and includes the real type
in the editor's accessible name. Neither treatment adds another focus target.

Grid entry follows the column expectation without turning it into inference
(#201).
Text columns store every character as a string, including leading zeroes,
exponents, boolean words, and apostrophes. Number and boolean columns accept
canonical input as that native type. One leading apostrophe explicitly stores
the remainder as a string, so `'hello` stores `hello` and `''hello` stores
`'hello`. Representation-changing valid input and invalid input use the decision
dialog above; neither changes the document until the user chooses. Merely
opening and committing an unchanged editor preserves the existing real type.

**A header cell holds editable text and nothing else.** It is a cell for every
purpose the user can observe: it is selectable, it answers Enter, F2, and
typing, and `Backspace` clears it. Deleting its row is not a refusal either (#140):
`Mod`+`Backspace` and the Delete rows menu item remove it and promote the first
surviving row into the header, so the table passes from one header row to one
header row and the gesture means the same thing on row 1 as on any other row.
Everything that acts on the column as a whole (selecting it, its menu, its
resize handle) belongs to the column index strip, not to the header cell.

**The grid is the modern table** (owner, 2026-09-19): it draws row lines and
nothing else, with no vertical dividers and no chrome bands, and a line's kind
never changes with state.

- Between two rows runs `--line-subtle`, from the row's first cell on: the
  row-number gutter draws no line under its numbers (owner, 2026-09-19), though
  it keeps the line's room so every row stays one pitch. Nothing divides two
  columns, two letters on the column index strip, or two header cells.
- The header row is told apart by its semibold weight and the `--line-strong`
  line under its cells, which likewise stops at the gutter. The strip has no
  line under it.
- A pinned row or column takes the strong line on its pinned edge, always, for
  its whole length, strip and header included: that edge is the non-colour cue
  that it is pinned.
- The row-number gutter's trailing edge takes the same strong line only while
  table content is scrolled sideways under it, so text never runs into the row
  numbers, and draws nothing at rest. Where a pinned column stands beside the
  gutter, that column's own edge does the job and the gutter draws none. The
  hairline is always there and only its colour changes, so the edge appearing
  moves nothing.

Selection, focus, and copying never recolour a line. They draw their own marks
over the grid, which is what keeps every divider legible in every state.

Because it is sticky, **its fill is opaque**. Body rows scroll under the header,
so at rest it wears the content box's own `--surface-code`, and selected it
wears `--selection-fill` composited over that surface by the
`bg-sticky-selection-fill` utility in `index.css`, because the bare tint is
translucent and would let the scrolling text read through. The tint keeps its
value, so the rendered colour is unchanged and its non-sticky users are
untouched. Any other sticky cell that carries a tint reuses that utility rather
than raising a token to full opacity.

The numbered row gutter and the column index strip are interface chrome, not
selected data, but they show where the selection is. A row number or column
letter that any selected area reaches turns from muted normal weight to
semibold foreground, with no surface of its own (owner, 2026-09-19); under
forced colours it takes the system highlight pair. The header row's number
takes part like any other. It never takes `--selection-fill`: that colour means
selected data, and chrome painted the same way reads as part of the selection.
Two other treatments were tried and rejected on #291: an edge line on the side
facing the table read as a stray fragment of the focus outline, and a lighter
fill swallowed the grid lines until they had to be redrawn in another colour.

The mark is derived from the selection on every render and is never stored as a
second record of it. It is presentation only: `aria-selected` and the selection
announcement stay on the cells, and an axis that merely contains selected cells
is not exposed as if the whole row or column were selected. At rest every
number is right-aligned and normal weight, including row 1, matching source and
read-only view line gutters. Row 1 opens the same row menu as every data row;
actions that cannot apply to the required header remain disabled and explain
why.

Cell wrapping is a persisted workspace preference per column, keyed by the
column's stable id and off by default. It never changes the document, codecs,
clipboard output, or undo timeline. A wrapped column preserves spaces and line
breaks, wraps long text inside the authoritative column width, and lets each
row grow to its tallest cell while `--grid-row-h` remains the floor. Row numbers
stay on the first visual line of that variable-height row, and arrow keys still
move one cell rather than one visual line. The semantic checked item in the
column menu is the per-column control for this preference; the grid pane menu's
checked Wrap all columns item sets every column's preference at once, reads as
mixed when only some columns wrap, and is not a second record (#360). Fit is disabled while the
column wraps, with a written reason to turn wrapping off first.

**An empty header stays empty.** Nothing generates a name for a column the user
has not named. An unnamed column is identified by its letter on the index strip,
and that letter is what its accessible name falls back to, so the announcement
is never silent and no invented text ever reaches the document.

That one letter is the column's identity in three places (#145), from one shared
helper so they can never disagree: the index strip shows it, the accessible name
falls back to it, and the JSON view keys an unnamed column by it. The last is a
deliberate format-local exception, not generated document content: the header
stays empty, no other format ever sees a letter, and the cost is that reading
that JSON back produces a column actually named after the letter.

### The column index strip

A row of column letters (`A`, `B`, ... `Z`, `AA`) sits above the header row and
mirrors the row-number gutter on the other axis. Both are chrome:

- It is **not part of the table at all.** It is a sibling of `<table
  role="grid">` inside the shared grid surface, not a row inside it. `grid` may
  own nothing but `row` and `rowgroup`, and the strip holds real controls, so
  every arrangement that kept it inside the table was a workaround: `aria-hidden`
  put the controls out of reach, and `role="presentation"` was discarded by
  ARIA's own conflict resolution precisely because the row holds controls,
  re-parenting them onto the grid and failing `aria-required-children`. Outside
  the table the question does not arise, and the header row is still row 1. The
  row-number gutter is different and stays where it is: its cell is a
  `rowheader` inside a data `row`, which is true, and its controls are owned
  correctly.
- **One width model, two mechanisms.** The strip is a CSS grid whose tracks and
  the table's `colgroup` are generated from the same ordered columns, the same
  resolved widths, and the same pane zoom. There is no second width store, no
  measurement observer, and no scroll synchronisation: both siblings sit in the
  one scrolling surface, so they scroll together by construction.
- **The strip sticks as one element**, at the top of the scroller, rather than
  cell by cell. Only its corner and a pinned first column stick sideways as
  well, joining the corner layer.
- Like the gutter, it **keeps its size at every zoom level** (`--grid-strip-h`).
  At 100% it is exactly one table-row baseline tall, so the strip, header row,
  and body begin on one vertical rhythm.
- **It owns the column.** Clicking a letter selects the whole column, header
  included. The letter is paired with the compact mark for the column's
  expected type. The select control and the column menu both include the full
  expected type in their accessible names, so the same metadata is available
  by keyboard without another tab stop. The letter is the cell's only control
  ([§6](../design-system.md#6-icons)): the column menu is the grid context menu opened on it, and the resize
  handle is its trailing edge.
- **A per-column property follows the selection.** Alignment, expected type,
  and width applied to a column that is selected as a column apply to every
  selected column, adjacent or not. Applied to any other column they stay there,
  so dragging an
  unrelated edge never resizes something elsewhere. For the same reason a menu
  opened on a target already inside the selection keeps the selection instead of
  collapsing onto it: collapsing would silently discard the rest of what the
  user picked and leave the menu acting on one column of several.
- **Sorting is the exception to that rule, deliberately.** Sort ascending and
  Sort descending act on the column whose menu is open and never on every
  selected column: sorting by several columns at once is not a thing the
  document can express, so an action reached from column C's menu orders the
  table by C. They are two immediate commands beside alignment rather than a
  submenu or a stored choice, because the sort reorders the document once and
  nothing stays applied afterwards for a radio group to read back. They are
  written inline in the column menu for the same reason alignment and expected
  type are: the shared action list acts on the selection, and these act on one
  named column. Below two rows they are disabled with the reason written out,
  and sorting a table already in that order says so rather than claiming rows
  moved.
- It is never itself selected and never takes `--selection-fill`. Selecting a
  column paints the header and body cells it represents, while this metadata
  strip remains chrome.
- Its leftmost cell, where the letters meet the row numbers, is a dead corner:
  an empty box, never a control.

Four sticky layers now overlap, and their order is deliberate rather than
accidental: body cells paint under the row gutter (`z-10`), which paints under
the strip and header cells (`z-20`), which paint under the two corners that
stick on both axes (`z-30`). The strip carries `z-30` as a whole, so it is the
one layer nothing in the table paints over. A sticky cell must not also be
`relative`: the later rule wins and turns the sticky offset into a static shift,
which is why only an unpinned strip cell adds `relative` for its resize handle.

### Column markers in a source view

A source view whose codec maps its header cells as a line of columns
(`mapsSourceColumns`, ADR 0005) shows the same letters above its text, one
over each header cell (decided on #368; widened to every such view by the
owner, 2026-09-19). A format with no header line of cells does not declare it,
even where it maps its rows as blocks (JSON, Records, HTML, #402), so its pane
shows no strip; the registry declaration decides, never the view's name.

- **The header line places the letters.** Each letter stands at the measured
  position where its header cell's text begins, from the cells the codec's
  parse mapped (#255), never at a character count, so a wide character, the
  pane's zoom, or a longer header name moves it with the text. When a body row
  has drifted out of line with the header after typing, the letters still
  follow the header (owner, 2026-09-18): the header names the columns, and
  following the caret's line would make every letter jump on a line change.
  A format that does not pad its cells, such as CSV, lines up only its header
  line under the letters, and that is the intended reading.
- **It wears the grid strip's look**: the fixed `--grid-strip-h` at every zoom,
  the code surface with no band or line under it, the index face at `text-xs`
  in the muted tone, and a dead corner above the line numbers.
- **It is an overlay across the top of the scroller, not a line of the
  text.** The scroller, and so its vertical scrollbar, runs the pane's full
  height, and its text starts the strip's height further down, so at rest the
  strip covers nothing (owner, 2026-09-19); text scrolled up passes under it.
  It spans the text area and never the scrollbar, it follows horizontal
  scrolling on the browser's own scroll (`follow-scroll.ts`), a press on it
  does nothing, a scroll over it scrolls the text, and the pinned header
  (#252) stacks directly under it. A draft that does not parse, or has no mapped header,
  keeps the strip and draws no letters, so a draft that stops parsing mid-word
  does not move every line by the strip's height. Wrapping never removes the
  strip (owner, 2026-09-19): with wrapping on, the letters stand over the
  header cells that begin on the header's first visual line, and a cell that
  wraps onto a later visual line has no letter.
- **It is never text, and each letter is its column's label** (#395, replacing
  "presentation only" from #368). Each letter is drawn from an attribute, so
  it is not text in the page, and the strip is hidden from assistive
  technology like the line numbers: it reaches no text, clipboard, download,
  search, or draft. A letter takes the pointer over its header cell's span,
  as the grid's does over its column, with the grid's cursors and the
  foreground tone while hovered or selected; what a press, a click, and a
  right-click on it do is the source-editor keyboard model's axes paragraph
  above. A wheel over a letter scrolls the text, and a press between two
  letters still does nothing.

### Pinning the first data row and column

The chrome above is always sticky. Two data layers are sticky **only when the
user asks for them** (#160), from a checkbox in the menu of the first data row and
of the first data column, which are the only row and column either preference can
reach. There is no freeze boundary of N rows or N columns: that is the
spreadsheet shape the product declines, and two booleans answer the same need
without a boundary to place, a control to place it with, or a number to explain.

- Both are **workspace display preferences**, stored beside per-column wrapping.
  Neither reaches the document, a codec, the clipboard, a download, or the undo
  timeline, and neither is per-pane: each view appears at most once, so there is
  one grid to pin.
- They **slot between the existing layers** rather than beside them. A pinned
  cell takes `--z-grid-pinned` (5), above ordinary cells and below the row
  gutter; the one cell belonging to both layers renders their intersection once,
  at `--z-grid-pinned-corner` (6). Both are named in `index.css`. The rule
  against pairing `sticky` with `relative` applies here too, so a pinned cell
  drops the `relative` its clipboard mark would otherwise resolve against and
  uses the sticky containing block instead.
- The **fill handle belongs to its cell's layer.** It takes the stacking level
  of the cell it sits on and follows the table, so it paints over that cell and
  its neighbours but passes under a pinned row or column, the header row, and
  the gutter exactly as the cell does, rather than floating over the layer that
  hides the cell.
- A pinned cell **paints an opaque fill**, for the reason the header row already
  does: live rows and columns pass underneath it, and a translucent selection
  tint would let their text read through. The unselected fill is the pane
  surface and needs nothing; the selected one is the sticky composition.
- The **non-color cue is the boundary line.** A pinned edge takes the strong line
  the grid already draws around chrome, against the subtle line every interior
  boundary carries. No new token, and it survives forced colours.
- **Pinning the only row or the only column draws nothing.** There is nothing for
  it to hold position against. The preference is still recorded and still shown
  as checked, so it becomes effective by itself once the table grows.

The pane body is the grid's scroll container. Its optimal viewing region uses
`scroll-padding-top` equal to the strip plus one content line box and
`scroll-padding-left` equal to the gutter. The strip and gutter remain fixed
chrome while the content line box follows pane zoom, so the compensation derives
from the same tokens as the layers it reserves. That declaration governs every
scroll the browser starts on its own.

A pinned layer extends that region by its own size, and its size is not a token:
the header row grows when a header wraps, and a pinned row grows with its tallest
cell. The grid measures each pinned layer and publishes it as a custom property,
which the declaration adds when present and ignores when absent. Absent means
unpinned, so the fallback is zero rather than a size.

**The grid moves its own focus, though, and does not rely on it** (#139).
Chrome
honours only part of `scroll-padding-left` when it reveals a focused cell,
delivering roughly half, so the clearance shrank as the gutter grew and the
contract survived on a few pixels of slack. The grid therefore focuses with
`preventScroll` and performs the smallest scroll itself. It measures the two
boundaries from the elements that draw them, the gutter's trailing edge and the
header row's bottom edge, or a pinned layer's edge where one stands in front of
them, rather than recomputing them from tokens: a sticky
cell's own rectangle already is its stuck position, so those are the boundaries
the contract is written about at any zoom and any gutter width, with nothing to
keep in step. The remainder is rounded outwards, because a cell left a fraction
of a pixel under the gutter has still failed.

When a cell is wider or taller than the region the chrome leaves over, both
edges cannot be satisfied at once and the leading edge wins. That is where the
value starts, so aligning the trailing edge would scroll the beginning of the
content out of sight to reveal an end the reader has not reached. A column can
be set to 64rem against a pane a fraction of that wide, so this is an ordinary
arrangement, not an extreme one.

Dragging a cell, row number, or column letter past the pane edge autoscrolls the
grid (#141) on the axes that gesture owns and continues extending the selection. A
reorder drag autoscrolls the same way and keeps moving the drop line instead,
while a fill handle extends its preview. One controller owns every grid drag,
clamps velocity, and stops at the document edge; reorder and fill gestures
consume it rather than creating parallel frame loops. Reduced motion keeps the
capability but advances in discrete rows or columns. `Shift` plus the arrow keys
is selection drag's keyboard equal; reordering and fill use the chords recorded
in the keyboard table above.
