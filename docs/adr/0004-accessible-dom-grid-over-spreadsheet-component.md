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

Build the grid from DOM elements, using **TanStack Table** headlessly for the
column and row model and **dnd-kit** for reordering. Selection, focus, the
keyboard model, and clipboard behavior are Tabelo's own code, written against
native table semantics.

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
  real ARIA grid semantics, real focus rings.
- The visual language is entirely ours, with no spreadsheet defaults to override
  and no third-party theme to fight.
- No licensing constraints and no large grid dependency in the bundle.
- The design is valid only at the recorded scale. Wanting tens of thousands of
  rows means virtualization, which means revisiting this ADR rather than
  patching around it.
