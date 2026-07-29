---
name: ui-contract
description: Implement or review a Tabelo UI, UX, accessibility, interaction, responsive-layout, design-token, or product-copy change. Use for work affecting panes, menus, dialogs, notices, the grid, source editors, preview, keyboard and focus behavior, screen-reader semantics, zoom, themes, or visible copy.
---

# UI Contract

Treat `docs/design-system.md` as normative and read it before editing UI. An accepted issue may deliberately revise it, but the new decision and code must land together.

## Workflow

1. Read the controlling issue, the affected design-system sections, relevant ADRs, canonical copy, existing primitives, implementation, and Playwright coverage.
2. Inspect the rendered behavior when appearance, focus, keyboard interaction, accessibility semantics, responsive layout, or geometry determines correctness. Source alone is insufficient for those claims.
3. Reuse in order: existing product component, browser or native element, `packages/ui` primitive, then an existing dependency. Do not create a local variant of an established pattern.
4. If no pattern fits, follow the design-system pattern-break protocol. Do not invent or silently normalize a new visual pattern.
5. Define the complete affected state set: rest, hover, focus, selected, disabled with reason, loading, empty, invalid, warning, destructive, narrow layout, system theme, pane zoom, and reduced motion as applicable.
6. Preserve interaction ownership and keyboard equality. A pointer-only affordance needs a keyboard path. Focus must remain visible, escape routes must work, and screen-reader state must be perceivable without color.
7. Use shared tokens and `rem` for authored geometry. Treat browser pixel measurements as boundary data and test relationships or supported ranges rather than exact dimensions.
8. Keep visible strings in `ui/copy.ts` or `product.ts` as required. Tests resolve wording through the canonical owner or semantic IDs.
9. Add behavior-focused Playwright coverage with accessible roles and labels, isolated storage, no arbitrary waits, and no pixel snapshots.

## Tabelo-specific checks

- The table remains the strongest visual surface; avoid cards, ornamental borders, gradients, and animation.
- Pane changes preserve the user's view, draft, focus, zoom, and workspace context.
- Grid cells use native table and ARIA-grid relationships; do not replace cell values with coordinate labels.
- Source diagnostics remain written, keyboard-accessible, and non-color-only without changing pane height.
- The interface works at supported narrow layouts, system themes, pane zoom extremes, and reduced motion.
- A dialog is used only for a user-issued command whose choice cannot fit a menu, unless the controlling issue explicitly updates that contract.

## Completion

The change is complete when the current and revised contracts agree with the implementation, every affected interaction state and accessibility path is covered, runtime behavior is verified, and relevant Playwright checks pass.
