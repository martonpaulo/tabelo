# Build an accessible DOM grid instead of adopting a spreadsheet component

## Context

The grid is the primary editing surface. It needs cell editing,
range/row/column selection, add, delete, duplicate, reorder, header editing,
column resizing, clipboard operations, and a complete keyboard model.

That list resembles a mature grid component's feature set, and Handsontable,
AG Grid, and Glide Data Grid remain credible projects. Their existence is not
enough to make one a fit for Tabelo, however. The application targets roughly
200 rows, owns document mutation and cross-view synchronization, and already
has a working custom grid whose selection, focus, history, and accessibility
contracts are tested together.

The candidate-specific tradeoffs are:

- AG Grid is DOM-based and [documents ARIA grid roles, keyboard navigation, and
  screen-reader support](https://www.ag-grid.com/react-data-grid/accessibility/).
  Accessibility is not a sound reason to reject it. The interactions closest to
  Tabelo's grid contract, however, are [cell
  selection](https://www.ag-grid.com/react-data-grid/cell-selection/) and
  [clipboard operations](https://www.ag-grid.com/react-data-grid/clipboard/),
  and AG Grid documents both as Enterprise features.
- Handsontable's current distribution uses [commercial and non-commercial
  licenses](https://handsontable.com/docs/javascript-data-grid/license-key/).
  Its last MIT release was
  [6.2.2](https://github.com/handsontable/handsontable/releases/tag/6.2.2),
  published in 2018, so the permissive version is not a maintained candidate.
- Glide Data Grid is [MIT, canvas-based, accessibility-aware, and designed for
  millions of rows](https://github.com/glideapps/glide-data-grid). It delegates
  sorting, filtering, storage, and mutation to the application. Its scale and
  rendering model would move Tabelo's rendering and focus contracts into
  canvas without removing the application-owned document operations.

Virtualization-first architecture does not benefit the recorded scale. A
replacement also has to remove enough Tabelo-specific state and interaction
code to repay the migration and regression cost of replacing the grid that now
exists.

Two accepted decisions amended the original reasoning on 2026-08-03.
[Issue #143](https://github.com/martonpaulo/tabelo/issues/143) brought sorting
into scope as a canonical document mutation rather than a view order.
[Issue #139](https://github.com/martonpaulo/tabelo/issues/139) decided that
pointer drag reordering will ship beside the keyboard and menu paths. Neither
change gives a headless table model or generic drag layer ownership of Tabelo's
document, selection, synchronization, or history.

## Decision

Keep the custom DOM grid. Selection, focus, the keyboard model, pointer
interactions, and clipboard behaviour remain Tabelo's own code, written against
native table semantics with `role="grid"`.

Sorting changes the order of `document.rows`, is one history step, and appears
immediately in every projection. A headless model that computes view order over
immutable data does not own that operation. Pointer reordering complements the
keyboard and menu paths, but both routes commit through the same application
action. Adding those interactions does not by itself justify a grid,
headless-table, or drag-and-drop library.

Reopen this decision only when a concrete backlog cluster shows that a named
candidate removes more product-specific interaction and state code than it
introduces. Record that measured comparison as an amendment to this ADR.

CodeMirror 6 remains the source editor. It was chosen over Monaco for bundle
size, mobile behavior, and its transaction and annotation model, which ADR 0001
and ADR 0003 depend on. That choice is independent of the grid implementation.

## Consequences

- Selection, keyboard navigation, pointer interactions, and clipboard are code
  Tabelo owns and must test. This remains the largest single implementation
  cost in the project.
- Accessibility is explicit rather than assumed: the custom grid uses real
  focusable elements, ARIA grid semantics, focus rings, and keyboard paths. The
  roles must be stated because the computed accessibility tree reported cells
  as `generic` when they were left implicit.
- Owning focus means owning its failure modes. Two were found only by driving
  the real app: default `mousedown` handling moved focus to `<body>` after a
  cell click, and the `Enter` that committed an edit bubbled to the grid and
  immediately reopened the editor.
- The visual language stays aligned with Tabelo instead of inheriting a dense
  spreadsheet interface or a third-party theme.
- The project avoids a commercial grid feature tier, a proprietary grid
  license, and a large grid dependency at its recorded scale.
- The decision is conditional, not absolute. A future backlog cluster may
  justify a maintained dependency, but only through the comparison required
  above. Wanting tens of thousands of rows separately means revisiting the
  no-virtualization product boundary.
