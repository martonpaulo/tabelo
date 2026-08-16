---
name: domain-model
description: Resolve consequential ambiguity in Tabelo terminology, entities, states, transitions, ownership, and rules. Use when an issue, code, `AGENTS.md`, `CONTEXT.md`, an ADR, or the design system describes incompatible models or when a change alters a durable table, draft, history, workspace, view, codec, import, or persistence contract.
---

# Domain Model

Clarify only the ambiguity required by the current issue. Tabelo has one product context and one canonical table document; do not introduce bounded contexts or architecture ceremony without evidence.

## Sources

- `CONTEXT.md` owns canonical vocabulary.
- `AGENTS.md` owns current normative product and process rules.
- ADRs explain accepted structural tradeoffs.
- `docs/design-system.md` owns visual and interaction contracts.
- Source and tests prove current behavior.
- An accepted issue or direct instruction may define desired behavior that deliberately replaces a current contract.

Do not silently pick one source when they diverge. Label current behavior, current contract, and desired contract, then update the canonical owner with the implementation.

## Workflow

1. Identify the exact overloaded term, invalid state, rule conflict, or ownership question.
2. Inspect the relevant documents, types, state transitions, operations, persistence schema, codecs, UI projections, and tests.
3. Distinguish:
   - canonical data, reconstructible projections, transient state, and local preferences;
   - entities, values, states, transitions, rules, and relationships;
   - current state from desired state.
4. Prefer existing Tabelo terms. Split a term only when it currently hides materially different concepts.
5. Validate the model with concrete cases: empty and non-empty tables, invalid drafts, undo and redo, import and paste, duplicated views, persistence recovery, keyboard focus, and unsupported input as applicable.
6. Keep one owner for every rule and mapping. Remove obsolete vocabulary and code paths when the issue replaces a model.
7. Update `CONTEXT.md` only for durable vocabulary or relationships. Update an ADR only for a consequential structural tradeoff. Update `AGENTS.md` only for a durable normative rule.

## Guardrails

- Every document has exactly one structural header row unless an accepted issue changes that rule and updates its canonical documentation.
- A cell value's type is carried from a typed source or an explicit choice, never derived from text.
- Text views remain derived projections, with at most one pending draft.
- Alignment remains document metadata even when a format cannot express it.
- Stable row and column identifiers are application-owned and never user-visible.
- Workspace behavior remains preset- and registry-driven.

## Completion

The ambiguity is resolved when the terms, valid states, ownership, transitions, edge cases, implementation, tests, and canonical documentation agree, or when the unresolved product decision is stated precisely enough for the user to decide.
