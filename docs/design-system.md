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

Tabelo is a **square, compact, monochrome utility**. It follows the shadcn
`base-lyra` style already configured in `packages/ui/components.json`.

- **Square.** Radius is zero. There are no rounded cards, pills, or buttons.
- **Monochrome.** Greys carry the entire interface. Exactly one accent colour
  exists, and it means *selection*. Status colours are the only other colour,
  and they are always paired with text.
- **Compact.** Controls are 28–32px tall. Type is small. Density comes from
  tight control sizing, not from cramming more onto the screen.
- **Quiet.** Borders are 1px and low contrast. There are no shadows except on
  floating layers, no gradients, and no decorative elements at all.
- **Still.** Transitions are for orientation only, never for delight.

The table is the loudest thing on screen. Everything else recedes.

---

## 2. Tokens

All tokens live in `apps/web/src/index.css`. Product-wide primitives inherit
shadcn's tokens from `packages/ui/src/styles/globals.css`.

### Rule: never write a raw value

No hex colours, no `oklch()` outside the token file, no arbitrary pixel sizes,
no `rounded-*` on product surfaces. If you need a value that has no token,
that is a pattern break — follow §0.

### Surfaces

| Token | Utility | Use |
| :--- | :--- | :--- |
| `--surface-app` | `bg-surface-app` | The page behind the panes |
| `--surface-panel` | `bg-surface-panel` | A pane's content area |
| `--surface-header` | `bg-surface-header` | Pane headers, grid column headers |
| `--surface-gutter` | `bg-surface-gutter` | The grid's row-number gutter |

Order matters: app is furthest back, gutter and header sit above panel.

### Lines

| Token | Utility | Use |
| :--- | :--- | :--- |
| `--line-subtle` | `border-line-subtle` | Grid cell borders, control separators |
| `--line-strong` | `border-line-strong` | Boundaries between panes, and the app header |

Borders are always 1px. Never use a border to decorate.

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

### Spacing rhythm

Use Tailwind's scale, restricted to: `0.5`, `1`, `1.5`, `2`, `3`, `4`, `6`.
Anything else is a pattern break. Gaps inside a control group are `1` or `1.5`;
padding inside a pane header is `3`; cell padding is `2` horizontal, `1.5`
vertical.

### Typography

| Role | Classes |
| :--- | :--- |
| Pane title | `text-xs font-medium uppercase tracking-wider text-muted-foreground` |
| Control label | `text-xs font-medium` |
| Table cell | `text-sm` |
| Source editor | `text-sm font-source` |
| Helper / status | `text-xs text-muted-foreground` |

There is no `text-base` and nothing larger in the product interface. There are
no headings above `h2` — the app has one screen.

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
  icon-only buttons.
- Each pane header shows a stable, non-interactive view identity. View changes
  and other low-frequency pane actions share one visibly labelled Pane menu;
  the grid's contextual Table actions may remain beside it.
- Nothing may reflow because of a selection change or a status change.

---

## 6. Icons

Lucide only, `size-4` inside `control-md` and `size-3.5` inside `control-sm`.
Always `aria-hidden`, because the accessible name comes from the button.

Icon-only buttons are limited to universally recognised history actions in the
app header and the grid's per-row and per-column affordances, where a label
would not fit. File, layout, pane, and other unfamiliar controls keep a visible
label and never depend on a tooltip for identification.

---

## 7. Motion

Transitions are limited to `colors` and `opacity`, at 100ms. Nothing moves
position. Nothing animates in on mount. `prefers-reduced-motion` is honoured
globally in `index.css` and must not be re-enabled locally.

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

- The grid is fully operable from the keyboard, including reordering.
- Every control has an accessible name; icon-only controls use `aria-label`.
- Focus is always visible and never trapped.
- Status is conveyed by text as well as colour.
- Contrast meets WCAG AA against the surface the element actually sits on.
- Nothing depends on hover alone — hover-revealed affordances also appear on
  keyboard focus.
