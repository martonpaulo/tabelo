# Tabelo Design System

The binding rules for how Tabelo looks and behaves. This document is normative:
if code and this file disagree, one of them is a defect.

Read this before writing or changing any UI.

---

## 0. Pattern-break protocol: read this first

**Committing to one design line matters more than any individual improvement.**
There is always a prettier layout, a nicer colour, a more interesting control.
Chasing them is what destroys consistency, so the answer is no by default.

Before you write UI, check whether a pattern for it already exists: in this
document, then in `apps/web/src/ui/primitives/`, then in `packages/ui`.

**If a pattern exists, use it.** Do not build a local variant because the
existing one is "almost" right. Extend the shared component instead.

**If no pattern exists, or the existing one genuinely does not fit, stop.** Do
not invent one silently and do not force the current one. Report to the user:

1. what you are building and where it will live;
2. the closest existing pattern, and precisely why it does not fit;
3. the new pattern you propose, with its tokens and states;
4. what else would need to change if this new pattern is adopted;
5. your recommendation: extend the existing pattern, or add a new one.

Then wait for a decision. Once decided, record it here in the same edit that
introduces the code.

**Also report, do not silently fix, when you find an existing pattern break**:
a raw hex value, a one-off spacing, a control that does not match its family, a
second way of doing something this document already covers. Say what it is,
where, and which rule it breaks. Fixing it may be out of scope for the current
task; deciding that is the user's call, not yours.

---

## 1. The design line

Tabelo is a **calm, compact, neutral table utility**. It follows the shadcn
`base-lyra` style already configured in `packages/ui/components.json` without
importing card-heavy dashboard styling.

The neutral palette, system sans-serif stack, and 0.25rem/0.5rem radius scale are
inspired by [petrroll/markdown-to-teams](https://github.com/petrroll/markdown-to-teams).
This is visual direction, not a template: Tabelo keeps its own blue accent,
stronger element hierarchy, and explicit editable/read-only distinction. No
source code or visual asset from that project is copied into Tabelo.

- **Structured.** Grid cells, row and column headers, resize affordances, pane
  edges, and major workspace divisions are rectilinear. The table remains the
  visual anchor.
- **Friendly.** Buttons and fields use a 0.25rem control radius. Panels, menus,
  dialogs, notices, and other contained or floating surfaces use a 0.5rem surface
  radius. There are no pills or arbitrarily rounded containers.
- **Neutral with one blue accent.** Neutral greys distinguish surfaces before
  lines do. Blue marks focus, selection, and checked or active controls. Status
  colours are the only other colours and always have written meaning.
- **Compact, not tiny.** Controls remain 1.75–2rem tall. Critical labels stay at
  0.875rem; space comes from removing repetition and progressive disclosure, never
  from shrinking essential text.
- **Quiet.** Shadows belong only to floating layers. Borders communicate
  structure or state, never decoration. There are no gradients or decorative
  elements.
- **Still.** Transitions orient the user, never decorate or flash.

The table is the loudest thing on screen. Everything else recedes.

---

## 2. Tokens

All tokens live in `apps/web/src/index.css`. Product-wide primitives inherit
shadcn's tokens from `packages/ui/src/styles/globals.css`.

### Rule: use tokens and relative units

No hex colours, no `oklch()` outside the token file, and no arbitrary sizes.
Author interface geometry, spacing, radii, typography, and breakpoints in
`rem`; do not write `px` in product CSS or component styles. This keeps the
interface proportional when the user changes the browser's base font size.
Use `rounded-interactive` for controls and `rounded-surface` for panels
and contained or floating surfaces. Structural table geometry stays square. If
you need a value that has no token, that is a pattern break: follow §0.
Platform metadata and standalone SVG assets are the narrow exception because
they cannot consume CSS variables; they repeat an existing token exactly and
must never introduce another palette value.

Browser APIs are another boundary exception: pointer coordinates, viewport
fixtures, and raster dimensions are expressed in CSS or image pixels by those
APIs. Convert pointer measurements to `rem` before storing presentation state,
and never treat an API's pixel result as the authored unit or a value worth
pinning in a test.

### Surfaces

| Token | Utility | Use |
| :--- | :--- | :--- |
| `--surface-app` | `bg-surface-app` | The page behind the panes |
| `--surface-panel` | `bg-surface-panel` | A pane's content area |
| `--surface-header` | `bg-surface-header` | Pane headers, grid column headers |
| `--surface-gutter` | `bg-surface-gutter` | The grid's row-number gutter |
| `--surface-readonly` | `bg-surface-readonly` | A pane body that cannot be edited |
| `--surface-floating` | `bg-surface-floating` | Menus, tooltips, and dialogs above panes |

Order matters: app is furthest back, gutter and header sit above panel. Use
these neutral tones to group related content before adding a line. Editable
pane bodies use `--surface-panel`; a read-only pane uses
`--surface-readonly` and a written "Read only" cue in its header.

### Lines

| Token | Utility | Use |
| :--- | :--- | :--- |
| `--line-subtle` | `border-line-subtle` | Grid cell borders, control separators |
| `--line-strong` | `border-line-strong` | Boundaries between panes |

Borders are always 0.0625rem. Use them for the table grid, pane boundaries, or an
explicit state. Prefer tonal separation for buttons,
notices, empty states, and pane headers; never use a border to decorate.

### Accent

| Token | Utility | Use |
| :--- | :--- | :--- |
| `--selection-fill` | `bg-selection-fill` | Background of selected cells |
| `--selection-edge` | `outline-selection-edge` | The focused cell's outline, focus rings, resize affordance |
| `--text-selection-fill` | CSS selection | Native and source-editor text selection |
| `--active-line-fill` | Source editor theme | Current source line without competing with selected text |

The accent family is blue in both themes. Use its solid tone only for focus,
selection, and checked or active controls; use the pale tone for hover or
selection fills. Text selection is intentionally stronger than an active line
and is a separate token from structural cell selection, so the two meanings do
not accumulate into a muddy block in dark mode. Ordinary neutral buttons and
links do not become blue merely for decoration.

### Status

| Token | Utility | Meaning |
| :--- | :--- | :--- |
| `--status-warning` | `bg-status-warning` | Source parses with a non-blocking warning |

**Colour never carries meaning alone.** A source diagnostic combines underline
shape with written tooltip text. This is not optional.

### Theme

Tabelo follows `prefers-color-scheme` on first paint and whenever the operating
system changes. CSS media queries own theme selection; no React state, root
class, persistent toolbar control, or stored manual override may compete with
the system.

Tabelo never reads a stored theme preference. System theme is the only current
contract, so obsolete storage is ignored and never participates in startup or
paint.

### Geometry

| Token | Utility | Value |
| :--- | :--- | :--- |
| `--control-h-sm` | `h-control-sm` | 1.75rem: dense toolbars, menu triggers |
| `--control-h-md` | `h-control-md` | 2rem: default control height |
| `--panel-header-h` | `h-panel-header` | 2.75rem: every pane header |
| `--grid-gutter-w` | `w-grid-gutter` | 2.75rem: row-number column |
| `--grid-row-h` | `h-grid-row` | 2rem: one table row |
| `--grid-col-w` | `w-grid-col` | 10.5rem: default column width |
| `--grid-col-w-min` | `w-grid-col-min` | 4.5rem: resize floor |
| `--control-radius` | `rounded-interactive` | 0.25rem: buttons, fields, menu items, badges |
| `--surface-radius` | `rounded-surface` | 0.5rem: panes, menus, dialogs, notices, empty states |

The two radii communicate hierarchy rather than decoration. Grid cells, row or
column headers, resize tracks, and layout glyphs stay square because their
geometry communicates table structure.

### Per-pane content scale

One pane can scale what it displays without touching the rest of the app.

| Token | Utility | Use |
| :--- | :--- | :--- |
| `--pane-zoom` | inline on the pane body | The pane's scale factor, 0.5–2 |
| `--text-content` | `text-content` | Any text that is pane *content* |
| `--spacing-content-line` | `h-content-line` | A one-line clip box that scales with it |

`--pane-zoom` is set on the pane body and nowhere else. At 100% both utilities
resolve to exactly `text-sm`, so the default rendering is unchanged.

**Only content scales.** Pane headers, titles, controls, hit targets, focus
rings, the grid's row-number gutter, and menu text keep their size at every zoom
level: a pane zoomed out must not become harder to operate. Use `text-content`
for table cells, source text, and the rendered preview; use `text-sm` for
everything that frames them.

Do not implement scale as a transform on the pane. That breaks hit testing and
text rendering. Scale the type, and scale measured geometry such as the grid's
column widths in the component that owns it. Zoom is a local preference belonging to
the pane, never document state and never a history step; it is bounded, and
browser zoom remains the way to scale the whole interface. `Mod`+`+` and
`Mod`+`-` step the active pane; `Mod`+`0` resets it.

### Syntax and table structure

Every editable source view uses the existing CodeMirror integration for syntax
highlighting. Markdown uses its installed language support; CSV and TSV share
the existing delimiter-aware tokenizer; HTML keeps its existing table-focused
tokenizer; Jira uses the same small project-owned `StreamLanguage` approach
because its grammar is narrow and domain-specific; JSON uses CodeMirror's
official JSON language package. The first row is visually distinct as the table
header in Markdown, CSV, TSV, Jira, and JSON, while HTML receives element,
attribute, and text treatment. Highlighting must preserve source text
exactly and must not become another parser or source of truth.

The visual table mirrors structure rather than source punctuation: its header
row has a contrasting surface and a discreet alignment indicator, while body
cells keep the normal content treatment. Do not colour-code columns or infer
cell types.

### Spacing rhythm

Use Tailwind's scale, restricted to: `0.5`, `1`, `1.5`, `2`, `3`, `4`, `6`.
Anything else is a pattern break. Gaps inside a control group are `1` or `1.5`;
padding inside a pane header is `3`; cell padding is `2` horizontal, `1.5`
vertical.

### Typography

Interface text uses `"Segoe UI", Aptos, Calibri, -apple-system,
BlinkMacSystemFont, sans-serif`. The source editor keeps the existing
`ui-monospace`, `SF Mono`, `Cascadia Mono`, `Menlo`, `monospace` stack.

| Role | Classes |
| :--- | :--- |
| Pane title | `text-sm font-medium` |
| Control label | `text-sm font-medium` |
| Table cell | `text-sm` |
| Source editor | `text-sm font-source` |
| Helper / status | `text-xs text-muted-foreground` |

Critical control, pane, menu, notice, onboarding, and error labels never fall
below `text-sm` (0.875rem). `text-xs` is reserved for optional descriptions,
shortcuts, file extensions, and secondary status detail. There is no
`text-base` and nothing larger in the product interface. There are no headings
above `h2`: the app has one screen.

---

## 3. Components

### Composition over configuration

Build compound components that share a namespace and slot together, rather than
one component with many boolean props.

```tsx
// Yes: composition
<Panel>
  <Panel.Header>
    <PaneIdentity view={pane.view} />
    <Panel.Spacer />
    <PaneMenu pane={pane} />
  </Panel.Header>
  <Panel.Body>…</Panel.Body>
</Panel>

// No: configuration
<Panel view={pane.view} compact={compact} actions={paneActions} />
```

A prop that only exists to toggle a piece of layout is a signal the piece
should be a slot instead.

### Do not rebuild what exists

Before writing a control, check `packages/ui/src/components/`: it holds the
shadcn primitives (button, dropdown-menu, badge, toggle-group, separator,
tooltip, input, and more). Compose those. A bare `<button>` in product code is
a pattern break unless it is a grid cell affordance, which the grid owns.

Add a missing primitive with the shadcn CLI rather than hand-writing it:

```bash
pnpm dlx shadcn@latest add <name> -c packages/ui
```

### Menus that carry a choice

A menu option that is one of several **mutually exclusive current states**
(the layout, a pane's view, or a column's alignment) is a `DropdownMenuRadioItem`
inside a `DropdownMenuRadioGroup`, never a plain item wearing a tick or a tint.
The primitive supplies `menuitemradio`, `aria-checked`, and the arrow-key
behaviour; the visible check stays as redundant confirmation.

The checked value is read from the state that owns it, not from the last click,
so a change the product refuses leaves the menu telling the truth. Pass
`closeOnClick` on these items: Base UI keeps radio menus open by default, which
is right for a stepper and wrong for a choice that is finished once made.

A group whose items are *actions* rather than states, such as zoom, add, and
close, stays a plain `DropdownMenuGroup` of `DropdownMenuItem`s.

Every dropdown and context menu uses the shared primitive's one spacing rhythm:
0.25rem outer padding, 2rem minimum item height, 0.5rem horizontal padding, and
0.375rem vertical padding. Primary option labels are 0.875rem; a genuine
description or shortcut may use 0.75rem. Floating menus are translucent over a
backdrop blur when the browser supports it, with the opaque popover colour as
the fallback. Their floating surface, strong boundary, and shadow must remain
visibly distinct from the pane beneath.

### Empty workspace

After hydration, an initially empty document with no source draft presents the
existing Start with surface in the centre of the workspace. The normal workspace
stays visible only as blurred context and is inert; the global action button is hidden
until the user chooses an empty table, pastes, or imports. This is an onboarding
surface, not a dialog: it does not claim modal semantics and never appears over
saved content, an unfinished draft, or a table the user emptied during the
current visit. A trusted `Mod`+`V` paste event starts the table directly while
this surface is open.

### Dialog

A dialog is allowed **only as the direct result of a command the user issued**,
and only when the command has a choice to make that a menu cannot hold: a
choice with its own options, or one that needs stating before it happens. The
download chooser holds format-specific output choices. New table also uses a
dialog when the current document or a pending draft would be lost; an already
empty document with no draft clears without interruption.

A dialog is never used to announce something. Notices belong in the notice bar,
which sits in the layout instead of covering the table.

| Rule | Treatment |
| :--- | :--- |
| Surface | `rounded-surface`, `bg-popover`, one shadow: a floating layer |
| Body text | `text-sm`; the same 0.875rem floor as everywhere else |
| Title | `DialogTitle`, `text-sm font-medium` |
| Supporting copy | `DialogDescription`, one sentence saying what to choose |
| Dismissal | Escape and an explicit Cancel; focus returns to what opened it |
| Button hierarchy | Confirm uses the default filled accent; destructive confirm uses `destructive`; Cancel uses the borderless `ghost`; all use the default size |
| Confirmation | One primary verb naming the operation: "Download", not "OK" |

Compose `packages/ui`'s `Dialog`; do not build a second modal. Prefer the
explicit Cancel and Confirm pair over the primitive's corner close button, so
the two ways out are both visible and both labelled.

### Layer ownership

| Layer | Location | Holds |
| :--- | :--- | :--- |
| Primitives | `packages/ui/src/components/` | Generic, product-agnostic shadcn components |
| Product primitives | `apps/web/src/ui/primitives/` | Tabelo's shared Panel frame |
| Features | `apps/web/src/ui/{grid,source,preview,workspace}/` | Components that know about the table document |

Actions are described once and rendered many times. `ui/grid/table-actions.ts`
is the single list of table operations; the axis menus and context menu are
renderers over it. Never write an action inline in a
menu. That is how a menu and a toolbar drift apart.

A component in `primitives/` must not import from the store. If it needs
document state, it belongs in a feature folder.

Related controls use the shared radius and spacing to read as a family. Do not
wrap an existing control group in another card or add a border merely to make
the relationship visible.

---

## 4. Interaction states

Every interactive element defines all of these. A missing state is a defect,
not a polish item.

| State | Treatment |
| :--- | :--- |
| Rest | No background |
| Hover | `hover:bg-muted` |
| Focus | 0.125rem `--selection-edge` outline, inset. Never remove it |
| Selected | `bg-selection-fill`, plus outline when it is the focused cell |
| Disabled | `opacity-50`, blocked cursor, and a tooltip explaining why. Never hide a disabled action |
| Invalid | Red wavy underline; written diagnostic on hover and in the editor description |
| Warning | Yellow dotted underline; written diagnostic on hover and in the editor description |

Disabled actions stay visible so the interface does not reflow as the selection
changes. Every disabled control must expose a concise reason through the shared
disabled-tooltip pattern. Layout stability outranks tidiness.

A view or download format whose codec cannot represent the current document
stays listed and disabled with that reason. An already-open pane that becomes
blocked replaces its content with one keyboard-focusable written status. The
status is announced to assistive technology and identifies affected rows or
columns without relying on the grid being visible.

The pane frame owns focus for a source view. CodeMirror never draws a second
inner rectangle: its caret and selection remain visible, while the pane's 0.125rem
inset edge supplies all four focus sides. The source caret is a 0.125rem accent line
aligned to the editor's line metrics; native text editors use the same accent
through `caret-color`.

Healthy source panes are silent: do not render repeated "In sync" or "Editing"
labels. A transient parse failure also stays silent during its short grace
period. Persistent diagnostics decorate the affected source range without
changing layout: a blocking error uses a red wavy underline and a non-blocking
warning uses a yellow dotted underline. Hover reveals the written diagnostic in
a tooltip; keyboard and screen-reader users receive the same text through the
editor's accessible description. There is no separate Details control and no
automatic cursor movement. Underline shape and written text ensure colour is
not the only signal.

---

## 5. Layout

- The workspace is a 2×2 slot grid holding two to four panes, arranged by
  preset: see `docs/adr/0006`. Never build a free slot editor.
- The app surface remains visible as a 0.5rem inset and a 0.5rem gap between panes.
  Each pane is a 0.5rem-radius surface with a subtle outline; the active pane adds
  a thicker blue focus edge. This framing applies at every supported width.
- The page never scrolls. Panes scroll independently.
- Below 56.25rem panes stack; the chosen layout is remembered, not discarded.
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
- There is no app header. One floating action button is the document-level
  command surface at every viewport width. Its menu contains the Tabelo identity
  and description, Undo, Redo, New table, Import, Download, Layout, and a link to
  the GitHub repository. The trigger has a stable accessible name and never
  replaces visible menu labels with unexplained icons.
- A ready service-worker update adds one static accent dot to the FAB and a
  written "Reload to update" action to its menu. The trigger's accessible name
  also states that an update is available, so colour is never the only signal.
  Nothing moves, pulses, opens automatically, or interrupts editing. Applying
  the update first flushes the current document and pending draft to durable
  storage; a failed save leaves the current worker active.
- Pane-level actions live in that pane's header. Row and column actions live on
  the row or column and in the context menu. The grid has no redundant Table
  actions menu in its pane header.
- Each pane header shows a stable, non-interactive view identity. View changes
  and other low-frequency pane actions share one visibly labelled Pane menu.
- Editable pane bodies use the main panel surface. A non-editable pane uses the
  read-only surface and the written "Read only" label. Never rely on a muted
  background alone to communicate editability.
- The Pane menu is flat. Changing the view, adding a view, closing the view, and
  zooming are all plain items in it: never a submenu of formats. Add view grows
  the workspace and hands the new pane's menu the focus, so the second half of
  the intent is one keystroke rather than a nested level to open.
- A view already open in another pane remains listed but disabled, with a
  tooltip explaining that it is already open. The current
  pane's own view remains selected and enabled. No workspace may show two
  instances of the same registered view.
- Add view and Close view are disabled, not hidden, at four panes and at two.
- Nothing may reflow because of a selection change or a status change.
- Two-pane layouts may breathe, but do not enlarge controls or introduce an
  otherwise absent card. Four-pane layouts keep the same 0.875rem critical labels,
  focus treatment, and action ownership; labels shorten only through the
  registry's explicit short label and optional descriptions may disappear.
- Four-pane density is recovered by hiding healthy status, removing empty
  reserved rows, and grouping low-frequency actions. Never shrink critical
  text, focus targets, or state cues to make four panes fit.

---

## 6. Icons

Lucide only, `size-4` inside `control-md` and `size-3.5` inside `control-sm`.
Always `aria-hidden`, because the accessible name comes from the button.

Icon-only buttons are limited to the globally stable floating action trigger
and the grid's per-row and per-column affordances, where a label would not fit.
Those axis affordances stay visually quiet with a small icon at rest, but their
target is grown to the 1.75rem control minimum with an `::after`
box rather than by taking layout the row gutter does not have. They appear on
hover, on `focus-within` of the row or column, while the menu is open, and for
whichever row and column the selection is currently in: the last of those is
what teaches the relationship without putting an icon on every row at once.
The floating trigger has a stable accessible name, and every command inside its
menu keeps a visible label. It displays the project mark rather than a generic
menu glyph. The mark is a small table grid whose blue header row and two active
centre cells form a compact T. `logo.svg` is the transparent, theme-adaptive
browser and interface source; `logo-maskable.svg` supplies a full blue field
and safe-area geometry for generated installable icons. Both must remain
legible at 1rem, use only product tokens, and keep the grid silhouette intact.

---

## 7. Motion

Transitions are limited to `colors` and `opacity`, at 100ms. Nothing moves
position, flashes, pulses, or animates in on mount. `prefers-reduced-motion` is
honoured globally in `index.css` and must not be re-enabled locally.

---

## 8. Copy

Product identity and browser metadata live in `apps/web/src/product.ts`; all
other user-visible strings live in `apps/web/src/ui/copy.ts`. A string literal
in a component is a pattern break. Stable domain IDs, user-entered values, and
generated document content are data rather than copy and remain owned by their
domain modules.

Tests choose commands, layouts, and views by semantic IDs and resolve their
accessible names through the canonical copy or registry. They never repeat a
product string just to locate or assert its UI. This keeps accessibility under
test without turning wording into a second source of truth. A deliberately
forbidden third-party error string may remain literal when the behavior under
test is precisely that it must not leak to the interface.

Voice: plain, calm, present tense. Say what happened and what the user can do.
Never blame, never exclaim, never use humour in an error. Prefer "The source
does not parse yet" to "Oops! Something went wrong".

Labels are sentence case. Actions are verbs: "Add row", not "New row".

Never use the Unicode em dash character (U+2014) in product copy, metadata,
comments, or documentation. Choose punctuation that states the relationship
clearly instead.

---

## 9. Accessibility floor

These are requirements, not aspirations:

- The grid is fully operable from the keyboard, including reordering. The model
  below is the contract, not a summary of it.
- Every control has an accessible name; icon-only controls use `aria-label`.
- Focus is always visible and never trapped.
- Interface chrome is not text-selectable. Source text and rendered view
  content remain selectable; line numbers, pane titles, controls, and menu copy
  do not.
- Status is conveyed by text as well as colour.
- Contrast meets WCAG AA against the surface the element actually sits on.
- Nothing depends on hover alone: hover-revealed affordances also appear on
  keyboard focus.
- Use progressive disclosure for low-frequency actions, but keep the owning
  scope and menu label explicit. Do not require users to decode unfamiliar
  icons or remember hidden locations.
- Keep visible copy short, literal, and stable. Do not move controls or resize
  panes when selection or status changes.
- The design may reduce common cognitive barriers, but Tabelo must not claim
  suitability for dyslexia, ADHD, or another condition without task-based
  sessions with representative participants. Record participants, tasks,
  outcomes, and changes before making such a claim.

### The grid keyboard model

One rule shapes the rest: **arrows are internal navigation, and Tab is how you
get out.** A widget that answers every key is a trap.

| Key | Effect |
| :--- | :--- |
| Arrows | Move the focused cell. They stop at the edges and never leave the grid |
| `Shift`+Arrows | Extend the selection from the anchor |
| `Alt`+Arrows | Reorder the row or column instead of navigating |
| `Tab` / `Shift`+`Tab` | Move one cell in reading order, wrapping at row ends. At the very first and very last cell the key is **not** taken, so focus leaves the grid |
| `Home` / `End` | First or last column of the row; with the modifier, the first or last cell of the table |
| `Enter` / `F2` | Edit the focused cell. On a column header, rename it |
| `Space` | On a column header, select the column: activating a button does what buttons do |
| `Escape` | Leave the editor without committing; from a cell, collapse the selection |
| `Backspace` | Clear the contents of the selection |
| `Mod`+`Backspace` | Remove the selected rows or columns |
| `Mod`+`Enter` | Add a row below |
| Any printable character | Replace the cell and start editing |

While a cell or header editor is open it owns every key, and the grid's own
handler stands down: a `Backspace` in an editor must never delete the row the
editor is sitting in.

**Every pointer affordance needs a keyboard equal.** Column width is the case
that proves it: the drag handle stays pointer-only and `aria-hidden`, and the
column menu carries the same widen, narrow, and reset. That is what makes
hiding the handle honest rather than a way of avoiding the problem.

Cursor shape confirms the interaction before a click: buttons, menu actions,
checkboxes, radio controls, and clickable row or column labels use `pointer`;
editable text uses `text`; cells use `cell`; split and column handles use the
matching resize cursor; disabled controls use `not-allowed`. Do not apply a
pointer cursor to passive labels or read-only content.

### Naming inside the grid

A cell is named by **its value**, never by its coordinates. Row and column
headers carry the context around it, so a screen reader composes the
announcement itself and stays quiet about the parts that did not change as the
user moves along a row.

That means header cells name themselves after what they contain, not after the
controls they hold: the header row is visibly numbered 1, the first data row is
"Row 2", and each column header is its own text. The header row uses its own
contrasting surface and each column header carries a discreet, non-colour-only
alignment indicator for default, left, centre, or right. An
`aria-label` on a gridcell is a defect: it replaces the content with
coordinates and repeats them on every arrow key.
