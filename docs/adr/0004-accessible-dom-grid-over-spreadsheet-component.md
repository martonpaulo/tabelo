# Build an accessible DOM grid instead of adopting a spreadsheet component

## Context

The grid is the primary editing surface. It needs cell editing, range/row/column
selection, add, delete, duplicate, reorder, header editing, column resizing,
clipboard operations, and a complete keyboard model.

That list reads like a spreadsheet component's feature page, and the mature
options are tempting: Handsontable, AG Grid, and canvas-rendered grids such as
Glide Data Grid all ship most of it.

Two product constraints rule them out. First, Tabelo must *not* look or feel
like a spreadsheet — the requirement is a calm, focused editor, and these
components bring their own dense visual language and interaction model that
would have to be fought rather than configured. Second, accessibility is a
first-class requirement: real focus states, screen-reader semantics, and full
keyboard operability. A canvas-rendered grid paints pixels and has no
accessibility tree to speak of, so that requirement cannot be met by styling it
later. Licensing is a further constraint for parts of the commercial options.

The target scale of roughly 200 rows removes the usual reason to accept those
costs — there is no virtualization or rendering-throughput problem to solve.

## Decision

Build the grid from DOM elements. Selection, focus, the keyboard model, and
clipboard behaviour are Tabelo's own code, written against native table
semantics with `role="grid"`.

No grid library is used. The original plan named TanStack Table for the row and
column model and dnd-kit for reordering; both were dropped once the grid was
actually designed. There is no sorting, filtering, or pagination for a headless
table model to own — the model is two arrays — and reordering turned out better
as an explicit action (`Alt`+arrow, plus menu items) than as drag, because that
path is keyboard-native rather than keyboard-adapted. Pointer drag remains for
column width only.

This also settles the framework question. The decisive factor is not React
itself but the surrounding ecosystem for *accessible interaction*: headless
table modelling, keyboard-operable drag and drop, and Base UI primitives for
menus and focus management. CodeMirror 6 — chosen for the text panel over Monaco
on bundle size, mobile behavior, and its transaction/annotation model, which
ADR 0001 and ADR 0003 both depend on — is framework-agnostic and integrates
cleanly either way.

## Consequences

- Selection, keyboard navigation, and clipboard are code Tabelo owns and must
  test. This is the largest single implementation cost in the project.
- Accessibility is achievable rather than bolted on: real focusable elements,
  real ARIA grid semantics, real focus rings. It also has to be asserted rather
  than assumed — the roles have to be stated explicitly, because the computed
  accessibility tree reported cells as `generic` when they were left implicit.
- Owning focus means owning its failure modes. Two were found only by driving
  the real app: the browser's default `mousedown` handling moved focus to
  `<body>` after a cell click, and the `Enter` that committed an edit bubbled to
  the grid and immediately reopened the editor. Neither was visible to types,
  lint, or unit tests.
- The visual language is entirely ours, with no spreadsheet defaults to override
  and no third-party theme to fight.
- No licensing constraints and no large grid dependency in the bundle.
- The design is valid only at the recorded scale. Wanting tens of thousands of
  rows means virtualization, which means revisiting this ADR rather than
  patching around it.
