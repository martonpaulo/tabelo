---
name: module-design
description: Design or improve Tabelo module boundaries, interfaces, dependency direction, cohesion, ownership, and stable test seams. Use when an issue changes responsibilities across the table document, operations, codecs, registries, synchronization, history, persistence, clipboard, workspace, grid, or product UI.
---

# Module Design

Use the architecture boundaries in `AGENTS.md` as the starting contract. Apply this skill when the correct owner or interface is genuinely unclear, not for a local helper with an obvious home.

## Workflow

1. Inspect callers, implementation, tests, data flow, lifecycle, and existing patterns across every affected boundary.
2. State the behavior one module should own and the knowledge its callers should not need.
3. Map dependencies and policy direction. UI may depend on core behavior; core behavior must not depend on React, DOM, copy, or presentation.
4. Consider two plausible designs when the boundary is consequential. Compare interface size, cohesion, coupling, locality, invalid states, dependency direction, testability, migration risk, and fit with current Tabelo contracts.
5. Choose the smallest design that establishes one owner and one stable behavioral seam.
6. Keep behavior with the state or rules it governs. Do not create pass-through abstractions, duplicate registries, parallel mappings, or framework-independent layers with no current need.
7. Put tests at the stable seam, with UI-boundary behavior in Playwright and pure transformations in unit tests.

## Tabelo ownership checks

- Table operations are pure and own structural document changes.
- Codecs own format syntax and escaping, not UI or document policy.
- Registries enumerate formats and views; consumers dispatch by `kind` and `capabilities`, never view id.
- Synchronization owns drafts, parse scheduling, reconciliation, and loop prevention.
- History owns timeline coordination, including editor-history fallthrough.
- Persistence validates one current schema at the storage boundary.
- Clipboard sniffing and payload construction stay independent of grid rendering.
- Workspace owns layouts, pane identity, and view placement, not view behavior.
- Product primitives do not import the store.

## Completion

A design is ready when ownership, interface, dependency direction, invalid states, test seam, migration scope, tradeoffs, and documentation impact are explicit. Implement only the issue-scoped part of the chosen design.
