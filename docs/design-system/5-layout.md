Part of the [Tabelo Design System](../design-system.md). Its entry point lists every part.

## 5. Layout

- The workspace is a 2×2 slot grid holding one to four panes, arranged by
  preset: see `docs/adr/0006`. One pane is the floor and two is what a fresh
  visit opens. Never build a free slot editor.
- The app surface remains visible as a 0.5rem inset and a 0.5rem gap between panes.
  Each pane is a 0.5rem-radius surface with a subtle outline. With two or more
  panes, the active pane adds a thicker blue edge. A one-pane workspace has no
  persistent active edge because there is no competing pane to distinguish;
  keyboard focus remains visible. This framing applies at every supported width.
- The page never scrolls. Panes scroll independently. Every pane's content
  ends the same way whatever its view (owner, 2026-09-19): `--pane-end-room`
  below the last row (see the floating action button below) and
  `--pane-trailing-room` after the widest line, so a pane scrolled fully
  sideways shows one small gap past its last column, never a band. A source
  view forgets the widths it measured at another zoom level, which is what
  left that band after zooming in and back out.
- Below 56.25rem panes stack; the chosen layout is remembered, not discarded.
  Stacked, the workspace grows to two panes at most: Add view is disabled with
  its reason and edge splits disappear, but no open pane is ever closed. See
  `docs/adr/0006`.
  Stacking **abandons** the tiling rather than narrowing it: the grid becomes a
  single column, panes stop naming slots, each keeps `min-h-pane-stack` so it
  stays worth scrolling to, and the workspace, not the page, scrolls between
  them. Resizers are not rendered, because neither axis splits. An inline
  `grid-area` naming a second column is the trap here: CSS will create that
  column even when the template says there is one, so the placement has to stop
  being emitted rather than be overridden.
- Pane headers are one row, `h-panel-header`, never wrapping or scrolling. A
  narrow pane shortens its labels rather than wrapping them.
- A pane's height must not change with its state: source diagnostics decorate
  the text and use tooltips rather than inserting a feedback row.
- The notice area is one labelled region floating over the workspace, fixed to
  the viewport's top trailing corner rather than placed in the layout. It takes
  no space, so showing or dismissing a notice moves nothing: the earlier
  in-layout band was itself the reflow this section forbids, because an idle
  notice area renders nothing and the first notice pushed every pane down. The
  top trailing corner is the one the floating action button does not own, and
  the region keeps the panes' own 0.5rem inset with no gutter reserved for what
  lies under it. It stays put while a stacked
  workspace scrolls under it, and its layer is `--z-notice` in `index.css`,
  above the floating action button and below menus, tooltips, and dialogs.
- A notice is not a dialog: no modal semantics, no focus trap, nothing blocked.
  Only the notices themselves take pointer events, so everything beside them
  stays operable. What is under a notice, though, is covered: the pane header
  it lands on, that pane's actions trigger included, and below the stacking
  width the column index strip as well. That is the accepted cost of a layer
  flush in the corner. Dismissal frees it, the trigger stays reachable from the
  keyboard while it is covered, and no notice that is on screen for long is
  undismissable.
- Each notice is only as wide as its content needs, up to a cap. The cap is a
  ceiling, not a width: a one-line message never draws a band across the table.
- A notice's anatomy is fixed. Dismissal holds the top trailing corner. The
  message and its actions share the column beside it, with the actions on their
  own row below the message, aligned to the same trailing edge as the message
  rather than running under the dismissal. Nothing in it moves with the message
  length. A floating notice adds the opaque surface, outline, and single shadow
  every floating layer here carries; the same component inside a dialog stays
  flat.
- A notice's actions carry no outline, because they are the quiet way out of a
  condition rather than a decision the surface is asking for. Weight, not
  colour, separates them from the message: the action is the body-strong style,
  never blue, never capitalised, never italic. Blue belongs to focus and
  selection, and capitals and italics cost legibility for the readers who can
  least afford it.
- The area holds every notice the app currently has, oldest first, with
  conditions ahead of one-off messages. Notices are never ranked against each
  other and never replace each other: something worth saying is worth showing,
  and a message that loses a contest is a message the user never gets. Each
  carries its own dismissal where dismissal makes sense.
- Every notice is app-level. There is no per-pane or per-view notice area: a
  failure belongs to the document the whole workspace is showing, and the same
  message repeated in four panes would be four interruptions. A source pane's
  own parse diagnostics are not notices; they decorate the text and use
  tooltips, as above. The plain projection disclosure (#306) follows the same
  rule: one warning names every open view that shows a formatted table as
  text, rather than one per pane, and a dismissal holds until another such
  view opens. The download chooser repeats it inline, below the formats, for a
  chosen format that cannot spell the table's formatting.
- There is no app header. One floating action button is the document-level
  command surface at every viewport width. It rests flush with the workspace, with no surface, border, or shadow of its
  own, and takes the floating surface and shadow only on hover (2ba36ed,
  d9f4322). Because it stays flush, the pane beneath it keeps its corner clear instead
  (owner, 2026-09-19): every pane, in any position and whatever its view,
  leaves the same `--pane-end-room` below the content of its scroller (the
  grid, every source view, and the rendered preview alike), and that room is
  the button's `--fab-safe-area`, so the last row can always scroll out from
  under it. The pane whose area reaches the workspace's bottom trailing
  corner, decided from the layout and never from its view (the last pane when
  stacked), also pads its find bar's trailing edge by `--fab-safe-area`, so no
  control has to stay under the button. Its menu contains the Tabelo identity and description, the current
  table name with a Rename command, Undo, Redo, the whole-table commands
  Transpose table and Delete empty rows and columns (#235), New table, Import,
  the `Copy as` submenu (#149), Download, Add view, Layout, Settings, and a
  link to the GitHub repository. The whole-table commands live here because
  they act on the document rather than on a row, a column, or a pane: an axis
  menu is named for the axis it acts on, and a pane menu for its pane. They are
  one untitled group of plain items after Undo and Redo, each disabled with a
  written reason when it cannot apply, and each reports its result in an
  `info` notice offering `Undo` (see `4-interaction-states.md`, Notice
  severity), with no confirmation before it. Transpose turns the first column into the header
  row, which holds text only, so when that column holds any number, boolean,
  or null it first asks in the same dialog shape as the column type change,
  naming how many values will become text, with `Cancel` (nothing changes) and
  `Transpose anyway`; with none it runs at once. The dialog opens after the
  menu has closed and returns focus to the menu trigger, and the transpose is
  one undo step either way (owner, 2026-09-19, #235). The trigger has a stable accessible name
  and never replaces visible menu labels with unexplained icons. Global Add
  view chooses the first valid split in workspace reading order and opens the
  same view chooser as the pane-edge command. It does not ask for placement or
  maintain a second placement policy. Keyboard focus on the trigger uses the
  shared focus treatment.
- A ready service-worker update adds one static accent dot to the FAB and a
  written "Reload to update" action to its menu. The trigger's accessible name
  also states that an update is available, so colour is never the only signal.
  Nothing moves, pulses, opens automatically, or interrupts editing. Applying
  the update first flushes the current document and pending draft to durable
  storage; a failed save leaves the current worker active.
- Pane-level actions live in that pane's header. Row and column actions live on
  the row or column and in the context menu. The grid has no redundant Table
  actions menu in its pane header.
- Each pane header carries one trigger and nothing else that acts. The view name
  and icon are static identity inside the pane heading, with no chevron or
  hidden click behavior. The trailing chevron, right-aligned, opens the pane
  actions menu. `Change view` is one entry in that menu and opens the shared
  choice dialog; it never opens a selector from the title.
- The space between the identity and the trailing trigger is the pane's status
  slot. What sits there is text: no role, no focus, nothing to press, and never
  a third action. It reports a temporary condition of the pane's content, such
  as how many occurrences an incremental selection has gathered, and a healthy
  idle pane leaves it empty. It grows leftward, so the trigger never moves, and
  it uses tabular figures so a rising count does not resize itself. Width
  pressure is absorbed by the identity's own truncation, an ellipsis on the
  view's one name, never by shrinking status text below [§2](2-tokens.md)'s floor. No state owns
  the slot exclusively: two conditions present at once still keep the header
  one row, with both meanings readable and no control displaced.
- The `Read-only` badge sits beside the view identity because it reports state.
  The actions trigger names the view it belongs to, because with four panes open
  the view is what says which pane the command affects: "Pane actions:
  Markdown", never a bare "Pane".
- Editable pane bodies use the main panel surface. A non-editable pane uses the
  read-only surface and the written "Read-only" label. Never rely on a muted
  background alone to communicate editability.
- The pane actions menu is flat and follows one semantic reading order (#70).
  An applicable capability-driven Copy command comes first, and zoom follows as
  its own group. Every pane then adds Find in its own group (#144, #280),
  named Find and replace where the view is editable and Find where it is not. A
  grid pane adds Wrap all columns (#360) in its own group; a source pane adds
  Wrap lines, followed in the same
  group by the checked Smart editing item when the view's format
  declares a structural-assistance feature (#297). Both are ordinary checked
  menu items, reached and toggled from the keyboard like every other pane
  command, with their state exposed through native checked semantics. Change
  view and the
  structural pane actions form the final group. Separators communicate those groups without
  visible titles. Changing a view opens one dialog; zooming and closing remain
  plain menu items. A command that does not apply is absent when capability
  decides it, while a temporarily unavailable structural command remains in
  place, disabled with a written reason.
- Download and Layout remain document-level commands in the floating menu and
  keep their dialogs. Add view remains in the floating menu and on splittable
  pane edges; it never moves into the pane actions menu.
- Layout offers only the arrangements of the pane count that is open (#72): two
  columns or two rows at two panes, the four asymmetric splits at three. It
  never adds or closes a pane, which Add view and Close view own. At one and
  four panes there is a single arrangement, so the command stays in place,
  disabled with a written reason, rather than disappearing.
- Move pane sits between Change view and Close view in the final pane group (#73). It
  opens the spatial destination dialog and offers every other occupied position
  in the current preset. Choosing a destination swaps positions while pane id,
  view, zoom, wrap, draft ownership, and active state move together. The pane
  array returns to visual reading order, the preset and pane count stay fixed,
  and the operation is persisted workspace presentation rather than document
  history. At one pane, Move pane stays visible and disabled with a written
  reason.
- A view already open in another pane remains listed but disabled, with a
  tooltip explaining that it is already open. The current
  pane's own view remains selected and enabled. No workspace may show two
  instances of the same registered view.
- Add view, in the floating menu, is disabled, not hidden, at four panes, and
  at two while the workspace is stacked (#219). Close view is disabled, not
  hidden, at one pane. Both expose the shared written disabled reason
  (9aa08dc). Pane-edge controls exist only where a split is possible.
- Nothing may reflow because of a selection change or a status change.
- Two-pane layouts may breathe, but do not enlarge controls or introduce an
  otherwise absent card. Four-pane layouts keep the same 0.875rem critical labels,
  focus treatment, and action ownership. A view keeps its one name at every
  width: a narrow pane truncates it with an ellipsis rather than switching to
  a shorter second name (owner, 2026-09-19), and optional descriptions may
  disappear.
- Four-pane density is recovered by hiding healthy status, removing empty
  reserved rows, and grouping low-frequency actions. Never shrink critical
  text, focus targets, or state cues to make four panes fit.
