Part of the [Tabelo Design System](../design-system.md). Its entry point lists every part.

## 4. Interaction states

Every interactive element defines all of these. A missing state is a defect,
not a polish item.

| State | Treatment |
| :--- | :--- |
| Rest | No background |
| Hover or keyboard highlight | Shared `bg-accent` interaction background |
| Focus | One treatment everywhere (owner, 2026-09-19): a 0.125rem `--focus-ring` outline drawn outside the control with a 0.125rem gap, from the base-layer `:focus-visible` rule; components add no ring, border, or shadow of their own for focus. A pane frame that fills its container draws it inset. Menu rows show the highlight instead. A grid cell draws the same line as a cell mark instead of an outline (see below). Never remove it |
| Selected | `bg-selection-fill`, plus the focus mark when it is the focused cell |
| Copied | 0.125rem dashed `--selection-edge` border on the range's own outer edges. A focused cell inside the range draws focus and copy as one static two-tone border: the solid focus line on all four sides with `--foreground` dashes over it on the outer sides |
| Carried cell type | Strings use the editable header row's plain foreground; numbers, booleans, and null use the cross-view semantic value token selected by `cellValueType`, reinforced by the value typeface, italics for null, numeric spacing, literal shape, and the accessible type name. No typed value is bold in the grid (owner, 2026-09-19) |
| Divergent cell type | Compact textual `CellTypeMark` inside the cell, never alignment or colour alone |
| Disabled | `opacity-50`, no hover or highlight state, `not-allowed` on the actual hit layer, and a tooltip explaining why. Never hide a disabled action |
| Invalid | Red wavy underline; written diagnostic on hover and in the editor description |
| Warning | Yellow dotted underline; written diagnostic on hover and in the editor description |

Disabled actions stay visible so the interface does not reflow as the selection
changes. Every disabled control must expose a concise reason through the shared
disabled-tooltip pattern. Layout stability outranks tidiness.

The copied state marks where the clipboard was filled from, so the user can go
and find the paste destination without losing track of the source. It outlives
the selection, which is the only reason it exists as a state of its own, and it
is drawn by the cells themselves rather than by a floating rectangle over the
table: the cells already resolve per-pane zoom, column width, wrapped row
height, and the sticky chrome layers. Only the sides on the boundary of the
range are drawn, so it reads as one outline rather than a grid of dashes.

**Cell marks sit on the grid lines** (#365). Focus, the copied mark, and the
fill preview are all marks on a cell's edges, and all of them are placed by one
rule: a mark covers the grid lines around its cells, not the space just inside
them. A cell owns the lines to its right and below, so a mark always covers
those, and it reaches one hairline back over the lines above and to the left,
which its neighbours own. Two marks on the same line therefore overlap on it,
and a focused cell beside a copied one reads as sharing an edge. The exception
is a line owned by sticky chrome (the header row above the first data row, the
index strip above the header, the gutter beside the first column, a pinned row
or column): chrome paints over anything that reaches under it, so there the
mark stays inside the cell and keeps its full width. The open cell editor is
not a cell mark: it can outgrow its cell, so it draws its own frame and the
focus mark stands down while it is open.

**It is static.** It never becomes marching ants: [§7](../design-system.md#7-motion) puts grid geometry and cell
selection outside motion, and a status that pulses is exactly what that rule
forbids. The dash pattern, not the colour, separates it from the solid focus
line, so it carries meaning without colour. Where a cell is both focused and
copied the two share one band, and a cell's own outline would be painted over
anything its children draw, which is one reason focus is a mark rather than an
outline. That cell draws both as one static two-tone marquee: the solid focus
line on all four sides and light dashes over it on the range's outer sides, on
the cell's real edge. Stepping the mark inside the focus outline was tried on
#223 and read as doubled when focused and detached when not; #349 replaced it.

**Copy marks; cut does not.** Cut empties the cells at once rather than on
paste, so there is no pending move to describe and a mark would outline blank
cells. Cut clears an existing mark instead, as does a source or preview copy:
both replace what is on the clipboard. Beyond that the mark is cleared by
pasting, by `Escape`, and by any document change, since an insert, a move, or a
delete leaves its coordinates describing cells the clipboard never held. It is
transient: never document state, never a history step, never persisted.

A dialog confirm is disabled when it would produce no state change. The shared
confirm wrapper owns its required disabled tooltip, so feature dialogs cannot
create an unexplained inactive primary button. It is **explained unavailable**
rather than natively disabled (#151): the button keeps its place in the tab order,
reports `aria-disabled`, and swallows pointer click, `Enter`, and `Space`, so
the written reason opens from focus and not from hover alone. A native
`disabled` attribute is for a control that promises no interaction and carries
no reason to read; the moment a reason exists, it must be reachable without a
pointer. This applies to the current layout in Layout and the current pane
view in Change view, and to the find bar's buttons while there is nothing to
step through (#376). Download remains enabled because producing a file is an
action even when its format choice did not change; destructive New table and
first-visit creation also still perform real actions.

Destructive menu actions use one shared state treatment. Their label, icon, and
any secondary anatomy inherit the same destructive foreground at rest, on
hover, and on keyboard focus; the generic accent foreground never leaks into a
destructive row.

An unchecked checkbox remains visibly identifiable as a control. Its shared
primitive owns a contrasting outline and transparent interior against the one
palette (#289); the absence of a checkmark must never make the control disappear into
its parent surface or turn it into a heavy filled square.

Unavailable selection options distinguish two causes. An option already used
elsewhere is an informative `in-use` state with a neutral status label and an
eye icon. An option blocked by the current document or another precondition is
an `unavailable` state with an alert icon and the concise `Unavailable` status. Both
are actually disabled, both keep their identity icon, and both expose the full
reason in a tooltip. The written status and different icon shapes keep the
distinction from depending on colour alone. `Unavailable` uses an attenuated
destructive tone so it communicates a precondition without competing with the
selected option.

A view or download format whose codec cannot represent the current document
stays listed and disabled with the format rule that causes the block, why that
rule exists, and the corrective action. For example, JSON explains that headers
become unique object keys rather than merely saying that a column is invalid.
An already-open pane that becomes
blocked replaces its content with one keyboard-focusable written status. The
status is announced to assistive technology and identifies affected rows or
columns without relying on the grid being visible. It says so the way the choosers
do (owner, 2026-09-19): the same alert icon and `Unavailable` status above the
reason, and the same `Go to cell` recovery command below it whenever the
refusal names a position.

**A view that fails stays in its pane.** Each pane catches an exception from
the view it shows, whether React meets it while rendering or the source editor
meets it inside CodeMirror, and replaces only its content with the blocked
pane's anatomy: the alert and `Unavailable` status, a reason that says the
table and any unsaved text are safe, and `Reload view` and `Change view` below
it. The header, the other panes, the document, the pending draft, and autosave
keep working, because none of them lives in the view. Focus moves to
`Reload view` only when the failure took it from inside the pane.

**A refusal that names a position offers the correction beside it** (#146). The
refused choice stays natively disabled with its reason, and an ordinary enabled
`Go to cell` command sits immediately after it as a sibling: never nested inside
the disabled option, its label, or its full-row overlay. A control must not
report itself as disabled while answering to activation, and an enabled control
must not perform a command other than the one its label states. The correction
takes the user to the first offending header or cell, raises the same reason
through the notice channel, and closes the surface it was invoked from without
changing the view, the panes, or the document. Several refused choices in one
list each get their own command, so the accessible name opens with the label
and names the refused choice. A refusal that names no position offers no
command: the choice stays disabled with its reason rather than gaining a
control that would do nothing.

The pane frame owns focus for a source view. CodeMirror never draws a second
inner rectangle: its caret and selection remain visible, while the pane's 0.125rem
inset edge supplies all four focus sides. The source caret is a 0.125rem accent line
aligned to the editor's line metrics; native text editors use the same accent
through `caret-color`.

A source pane measures its logical lines and number gutter when it first becomes
visible and whenever wrapping or pane geometry changes, before the user can see
or focus it. Opening, replacing, or rearranging a view must not leave line
numbers on stale geometry and rely on a click to repair them. In wrapped mode,
each number stays on the first visual line of the logical line it identifies.
Focus changes interaction state; it is never a layout trigger.

Healthy source panes are silent: do not render repeated "In sync" or "Editing"
labels. A transient parse failure also stays silent during its short grace
period. Persistent diagnostics decorate the affected source range without
changing layout: a blocking error uses a red wavy underline and a non-blocking
warning uses a yellow dotted underline. Hover reveals the written diagnostic in
a tooltip; keyboard and screen-reader users receive the same text through the
editor's accessible description. There is no separate Details control and no
automatic cursor movement. Underline shape and written text ensure colour is
not the only signal.

The description element the editor points at exists whether or not there is a
diagnostic; only its text changes. It carries no `aria-live`: the accessible
description is the channel, and a live region on the same node reads the
diagnostic twice.

### Notice severity

A notice's appearance, its announcement, and whether it may expire are all
derived from one declared severity. None of them may be derived from which
part of the app produced the message.

| Severity | Surface | Announced | Expires |
| :--- | :--- | :--- | :--- |
| `info` | `bg-surface-header` | Polite | After 4s with no action; after 8s when its only action is Undo |
| `warning` | `bg-destructive/10` | Polite | Never |
| `error` | `bg-destructive/10` | Polite, or assertive when the table is at risk | Never |

Warning and error share the one status surface this design line has. They
differ in how they are announced and in whether they may clear themselves, not
in how loud they look. A failure never renders as `info`.

Only a plain confirmation may expire unattended. A failure, or anything
carrying an action, stays until it is dismissed: a recovery instruction that
disappears after four seconds is not a recovery path. The timer belongs to the
notice on screen, never to the notice area, so nothing can expire unseen.

The one exception is a confirmation whose only action is `Undo`, which a
whole-table command raises (#235). Its action repeats the document undo that
Mod+Z and the menu keep, so expiring removes no way back, and it stays 8s so
the button can be reached. The offer holds only while the command's result is
still the document: any later change removes the button, because it would then
undo something the message does not name, and the plain confirmation that
remains expires as usual. Choosing `Undo` runs that undo and removes the
notice. The notice is the command's only announcement; its text reaches the
polite region once.

### Announcing

Two live regions, one `role="status"` and one `role="alert"`, are mounted for
the lifetime of the app and start empty. Notice text is written into them.
A live region inserted at the same moment as its text is not reliably
announced, so a region that appears with a message in it is a defect.

Assertive interrupts whatever is being said and is reserved for a storage
failure or a refused import: the cases where the user's table is at risk.
Everything else, including a plain "Copied", is polite.

Only what has not been announced yet is written, so dismissing one notice never
reads the remaining ones out again, and a batch arriving together becomes one
utterance rather than a burst. The visible notice bar carries no live
semantics of its own.

The polite region also carries text that has no visible counterpart, currently
the grid's selection extent. It shares that one region rather than getting a
third: two status regions would compete for the same moment of speech. The most
recent polite writer wins.

**Announce a change, not a state.** The extent is written only when it changes,
never when the focused cell moves inside an unchanged selection: the cell
announces its own value as focus lands on it, and repeating the extent over
that would double-speak. It is also written only once the extent settles, so
holding `Shift`+`Down` says where the user stopped rather than one utterance
per keystroke.
