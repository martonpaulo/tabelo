# Tabelo Design System

The binding rules for how Tabelo looks and behaves. This document is normative:
if code and this file disagree, one of them is a defect.

Read this before writing or changing any UI.

---

## 0. Pattern-break protocol — read this first

**Committing to one design line matters more than any individual improvement.**
There is always a prettier layout, a nicer colour, a more interesting control.
Chasing them is what destroys consistency, so the answer is no by default.

Before you write UI, check whether a pattern for it already exists — in this
document, then in `apps/web/src/ui/primitives/`, then in `packages/ui`.

**If a pattern exists, use it.** Do not build a local variant because the
existing one is "almost" right. Extend the shared component instead.

**If no pattern exists, or the existing one genuinely does not fit, stop.** Do
not invent one silently and do not force the current one. Report to the user:

1. what you are building and where it will live;
2. the closest existing pattern, and precisely why it does not fit;
3. the new pattern you propose, with its tokens and states;
4. what else would need to change if this new pattern is adopted;
5. your recommendation — extend the existing pattern, or add a new one.

Then wait for a decision. Once decided, record it here in the same edit that
introduces the code.

**Also report, do not silently fix, when you find an existing pattern break** —
a raw hex value, a one-off spacing, a control that does not match its family, a
second way of doing something this document already covers. Say what it is,
where, and which rule it breaks. Fixing it may be out of scope for the current
task; deciding that is the user's call, not yours.

---

## 1. The design line

Tabelo is a **calm, compact, lightly warm table utility**. It follows the
shadcn `base-lyra` style already configured in `packages/ui/components.json`
without importing card-heavy dashboard styling.

- **Structured.** Grid cells, row and column headers, resize affordances, pane
  edges, and major workspace divisions are rectilinear. The table remains the
  visual anchor.
- **Friendly.** Buttons, fields, menus, notices, empty states, and other
  interactive or floating surfaces share one small radius. There are no pills
  or arbitrarily rounded containers.
- **Quietly warm.** Low-chroma warm neutrals distinguish surfaces before lines
  do. Exactly one restrained accent colour means *selection or focus*. Status
  colours are the only other colours and always have written meaning.
- **Compact, not tiny.** Controls remain 28–32px tall. Critical labels stay at
  14px; space comes from removing repetition and progressive disclosure, never
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

### Rule: never write a raw value

No hex colours, no `oklch()` outside the token file, and no arbitrary pixel
sizes. `rounded-interactive` is the only radius utility on product surfaces;
structural table and workspace geometry stays square. If you need a value that
has no token, that is a pattern break — follow §0.

### Surfaces

| Token | Utility | Use |
| :--- | :--- | :--- |
| `--surface-app` | `bg-surface-app` | The page behind the panes |
| `--surface-panel` | `bg-surface-panel` | A pane's content area |
| `--surface-header` | `bg-surface-header` | Pane headers, grid column headers |
| `--surface-gutter` | `bg-surface-gutter` | The grid's row-number gutter |

Order matters: app is furthest back, gutter and header sit above panel. Use
these low-chroma warm tones to group related content before adding a line.

### Lines

| Token | Utility | Use |
| :--- | :--- | :--- |
| `--line-subtle` | `border-line-subtle` | Grid cell borders, control separators |
| `--line-strong` | `border-line-strong` | Boundaries between panes, and the app header |

Borders are always 1px. Use them for the table grid, pane boundaries, the app
header boundary, or an explicit state. Prefer tonal separation for buttons,
notices, empty states, and pane headers; never use a border to decorate.

### Selection — the only accent

| Token | Utility | Use |
| :--- | :--- | :--- |
| `--selection-fill` | `bg-selection-fill` | Background of selected cells |
| `--selection-edge` | `outline-selection-edge` | The focused cell's outline, focus rings, resize affordance |

Do not use the accent for anything that is not selection or focus. Buttons are
not accent-coloured. Links are not accent-coloured.

### Status

| Token | Utility | Meaning |
| :--- | :--- | :--- |
| `--status-ok` | `bg-status-ok` | Source and table are in sync |
| `--status-pending` | `bg-status-pending` | Edit not yet read back |
| `--status-invalid` | `bg-status-invalid` | Source does not parse |

**Colour never carries meaning alone.** Every status dot has a text label
beside it. This is not optional.

### Theme

Tabelo follows `prefers-color-scheme` on first paint and whenever the operating
system changes. CSS media queries own theme selection; no React state, root
class, persistent toolbar control, or stored manual override may compete with
the system.

The retired `tabelo.theme` preference is removed during startup. Its value must
never influence paint, so old Light, Dark, System, malformed, or inaccessible
storage all resolve deterministically to the current system theme without a
wrong-theme flash.

### Geometry

| Token | Utility | Value |
| :--- | :--- | :--- |
| `--control-h-sm` | `h-control-sm` | 28px — dense toolbars, menu triggers |
| `--control-h-md` | `h-control-md` | 32px — default control height |
| `--panel-header-h` | `h-panel-header` | 44px — the app header and every pane header |
| `--grid-gutter-w` | `w-grid-gutter` | 44px — row-number column |
| `--grid-row-h` | `h-grid-row` | 32px — one table row |
| `--grid-col-w` | `w-grid-col` | 168px — default column width |
| `--grid-col-w-min` | `w-grid-col-min` | 72px — resize floor |
| `--interactive-radius` | `rounded-interactive` | 6px — every interactive, contained, or floating surface |

`--interactive-radius` applies to buttons, fields, menus, tooltips, notices,
empty-state containers, and source feedback overlays. It never applies to grid
cells, row or column headers, pane frames, pane divisions, or layout glyphs.

### Per-pane content scale

One pane can scale what it displays without touching the rest of the app.

| Token | Utility | Use |
| :--- | :--- | :--- |
| `--pane-zoom` | inline on the pane body | The pane's scale factor, 0.8–1.5 |
| `--text-content` | `text-content` | Any text that is pane *content* |
| `--spacing-content-line` | `h-content-line` | A one-line clip box that scales with it |

`--pane-zoom` is set on the pane body and nowhere else. At 100% both utilities
resolve to exactly `text-sm`, so the default rendering is unchanged.

**Only content scales.** Pane headers, titles, controls, hit targets, focus
rings, the grid's row-number gutter, and menu text keep their size at every zoom
level — a pane zoomed out must not become harder to operate. Use `text-content`
for table cells, source text, and the rendered preview; use `text-sm` for
everything that frames them.

Do not implement scale as a transform on the pane: that breaks hit testing and
text rendering. Scale the type, and scale measured geometry — the grid's column
widths — in the component that owns it. Zoom is a local preference belonging to
the pane, never document state and never a history step; it is bounded, and
browser zoom remains the way to scale the whole interface.

### Spacing rhythm

Use Tailwind's scale, restricted to: `0.5`, `1`, `1.5`, `2`, `3`, `4`, `6`.
Anything else is a pattern break. Gaps inside a control group are `1` or `1.5`;
padding inside a pane header is `3`; cell padding is `2` horizontal, `1.5`
vertical.

### Typography

| Role | Classes |
| :--- | :--- |
| Pane title | `text-sm font-medium` |
| Control label | `text-sm font-medium` |
| Table cell | `text-sm` |
| Source editor | `text-sm font-source` |
| Helper / status | `text-xs text-muted-foreground` |

Critical control, pane, menu, notice, onboarding, and error labels never fall
below `text-sm` (14px). `text-xs` is reserved for optional descriptions,
shortcuts, file extensions, and secondary status detail. There is no
`text-base` and nothing larger in the product interface. There are no headings
above `h2` — the app has one screen.

---

## 3. Components

### Composition over configuration

Build compound components that share a namespace and slot together, rather than
one component with many boolean props.

```tsx
// Yes — composition
<Panel>
  <Panel.Header>
    <PaneIdentity view={pane.view} />
    <Panel.Spacer />
    <PaneMenu pane={pane} />
  </Panel.Header>
  <Panel.Body>…</Panel.Body>
</Panel>

// No — configuration
<Panel view={pane.view} showSpacer headerRight={<StatusPill … />} />
```

A prop that only exists to toggle a piece of layout is a signal the piece
should be a slot instead.

### Do not rebuild what exists

Before writing a control, check `packages/ui/src/components/` — it holds the
shadcn primitives (button, dropdown-menu, badge, toggle-group, separator,
tooltip, input, and more). Compose those. A bare `<button>` in product code is
a pattern break unless it is a grid cell affordance, which the grid owns.

Add a missing primitive with the shadcn CLI rather than hand-writing it:

```bash
pnpm dlx shadcn@latest add <name> -c packages/ui
```

### Menus that carry a choice

A menu option that is one of several **mutually exclusive current states** —
the layout, a pane's view, a column's alignment — is a `DropdownMenuRadioItem`
inside a `DropdownMenuRadioGroup`, never a plain item wearing a tick or a tint.
The primitive supplies `menuitemradio`, `aria-checked`, and the arrow-key
behaviour; the visible check stays as redundant confirmation.

The checked value is read from the state that owns it, not from the last click,
so a change the product refuses leaves the menu telling the truth. Pass
`closeOnClick` on these items: Base UI keeps radio menus open by default, which
is right for a stepper and wrong for a choice that is finished once made.

A group whose items are *actions* rather than states — zoom, add, close —
stays a plain `DropdownMenuGroup` of `DropdownMenuItem`s.

### Dialog

A dialog is allowed **only as the direct result of a command the user issued**,
and only when the command has a choice to make that a menu cannot hold — a
choice with its own options, or one that needs stating before it happens. The
download chooser is the one today: a format, plus whatever that format declares
about how its file should be written.

A dialog is never used to announce something. Notices belong in the notice bar,
which sits in the layout instead of covering the table.

| Rule | Treatment |
| :--- | :--- |
| Surface | `rounded-interactive`, `bg-popover`, one shadow — a floating layer |
| Body text | `text-sm`; the same 14px floor as everywhere else |
| Title | `DialogTitle`, `text-sm font-medium` |
| Supporting copy | `DialogDescription`, one sentence saying what to choose |
| Dismissal | Escape and an explicit Cancel; focus returns to what opened it |
| Confirmation | One primary verb naming the operation — "Download", not "OK" |

Compose `packages/ui`'s `Dialog`; do not build a second modal. Prefer the
explicit Cancel and Confirm pair over the primitive's corner close button, so
the two ways out are both visible and both labelled.

### Layer ownership

| Layer | Location | Holds |
| :--- | :--- | :--- |
| Primitives | `packages/ui/src/components/` | Generic, product-agnostic shadcn components |
| Product primitives | `apps/web/src/ui/primitives/` | Tabelo's own shared shapes: Panel, ToolbarButton, StatusPill |
| Features | `apps/web/src/ui/{grid,source,preview,workspace}/` | Components that know about the table document |

Actions are described once and rendered many times. `ui/grid/table-actions.ts`
is the single list of table operations; the pane menu, the axis menus, and the
context menu are three renderers over it. Never write an action inline in a
menu — that is how a menu and a toolbar drift apart.

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
| Focus | 2px `--selection-edge` outline, inset. Never remove it |
| Selected | `bg-selection-fill`, plus outline when it is the focused cell |
| Disabled | `opacity-50`, pointer events off. Never hide a disabled action |
| Invalid | `--status-invalid` on the text, plus a written message |

Disabled actions stay visible so the interface does not reflow as the selection
changes. Layout stability outranks tidiness.

Healthy source panes are silent: do not render repeated "In sync" or "Editing"
labels. A transient parse failure also stays silent during its short grace
period. Persistent invalid source uses the invalid treatment and a non-reflowing
editor overlay so colour never carries the error alone and feedback never
resizes the pane.

---

## 5. Layout

- The workspace is a 2×2 slot grid holding one to four panes, arranged by
  preset — see `docs/adr/0006`. Never build a free slot editor.
- The page never scrolls. Panes scroll independently.
- Below 900px panes stack; the chosen layout is remembered, not discarded.
  Stacking **abandons** the tiling rather than narrowing it: the grid becomes a
  single column, panes stop naming slots, each keeps `min-h-pane-stack` so it
  stays worth scrolling to, and the workspace — not the page — scrolls between
  them. Resizers are not rendered, because neither axis splits. An inline
  `grid-area` naming a second column is the trap here: CSS will create that
  column even when the template says there is one, so the placement has to stop
  being emitted rather than be overridden.
- Pane headers are one row, `h-panel-header`, never wrapping. A narrow pane
  shortens its labels rather than wrapping them.
- A pane's height must not change with its state: exceptional source feedback
  overlays the editor and is absent from the layout when healthy.
- Document-level actions live in the app header. Pane-level actions live in that
  pane's header. Row and column actions live on the row or column, and in the
  context menu.
- The app header keeps Undo and Redo visible. New, Import, and every download
  format share one visibly labelled File menu. Layout remains a visibly labelled
  workspace control. Do not expose those actions as a run of unfamiliar
  icon-only buttons. Those labels are what makes the row wider than the
  narrowest phone, so the header scrolls itself, exactly as a pane header does —
  the page still never scrolls. Anything added there has to keep that true.
- Each pane header shows a stable, non-interactive view identity. View changes
  and other low-frequency pane actions share one visibly labelled Pane menu;
  the grid's contextual Table actions may remain beside it.
- The Pane menu is flat. Changing the view, adding a view, closing the view, and
  zooming are all plain items in it — never a submenu of formats. Add view grows
  the workspace and hands the new pane's menu the focus, so the second half of
  the intent is one keystroke rather than a nested level to open.
- Add view and Close view are disabled, not hidden, at four panes and at one.
- Nothing may reflow because of a selection change or a status change.
- One-pane layouts may breathe, but do not enlarge controls or introduce an
  otherwise absent card. Four-pane layouts keep the same 14px critical labels,
  focus treatment, and action ownership; labels shorten only through the
  registry's explicit short label and optional descriptions may disappear.
- Four-pane density is recovered by hiding healthy status, removing empty
  reserved rows, and grouping low-frequency actions. Never shrink critical
  text, focus targets, or state cues to make four panes fit.

---

## 6. Icons

Lucide only, `size-4` inside `control-md` and `size-3.5` inside `control-sm`.
Always `aria-hidden`, because the accessible name comes from the button.

Icon-only buttons are limited to universally recognised history actions in the
app header and the grid's per-row and per-column affordances, where a label
would not fit. Those axis affordances stay visually quiet — a small icon at
rest — but their target is grown to the 28px control minimum with an `::after`
box rather than by taking layout the row gutter does not have. They appear on
hover, on `focus-within` of the row or column, while the menu is open, and for
whichever row and column the selection is currently in: the last of those is
what teaches the relationship without putting an icon on every row at once. File, layout, pane, and other unfamiliar controls keep a visible
label and never depend on a tooltip for identification.

---

## 7. Motion

Transitions are limited to `colors` and `opacity`, at 100ms. Nothing moves
position, flashes, pulses, or animates in on mount. `prefers-reduced-motion` is
honoured globally in `index.css` and must not be re-enabled locally.

---

## 8. Copy

All user-visible strings live in `apps/web/src/ui/copy.ts`. A string literal in
a component is a pattern break.

Voice: plain, calm, present tense. Say what happened and what the user can do.
Never blame, never exclaim, never use humour in an error. Prefer "The source
does not parse yet" to "Oops! Something went wrong".

Labels are sentence case. Actions are verbs: "Add row", not "New row".

---

## 9. Accessibility floor

These are requirements, not aspirations:

- The grid is fully operable from the keyboard, including reordering. The model
  below is the contract, not a summary of it.
- Every control has an accessible name; icon-only controls use `aria-label`.
- Focus is always visible and never trapped.
- Status is conveyed by text as well as colour.
- Contrast meets WCAG AA against the surface the element actually sits on.
- Nothing depends on hover alone — hover-revealed affordances also appear on
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
| `Space` | On a column header, select the column — activating a button does what buttons do |
| `Escape` | Leave the editor without committing; from a cell, collapse the selection |
| `Backspace` | Clear the contents of the selection |
| `Mod`+`Backspace` | Remove the selected rows or columns |
| `Mod`+`Enter` | Add a row below |
| Any printable character | Replace the cell and start editing |

While a cell or header editor is open it owns every key, and the grid's own
handler stands down — a `Backspace` in an editor must never delete the row the
editor is sitting in.

**Every pointer affordance needs a keyboard equal.** Column width is the case
that proves it: the drag handle stays pointer-only and `aria-hidden`, and the
column menu carries the same widen, narrow, and reset — which is what makes
hiding the handle honest rather than a way of avoiding the problem.

### Naming inside the grid

A cell is named by **its value**, never by its coordinates. Row and column
headers carry the context around it, so a screen reader composes the
announcement itself and stays quiet about the parts that did not change as the
user moves along a row.

That means header cells name themselves after what they contain, not after the
controls they hold: the row header is "Row 3", the column header is its own
text, and the corner above the row numbers is deliberately nameless. An
`aria-label` on a gridcell is a defect — it replaces the content with
coordinates and repeats them on every arrow key.
