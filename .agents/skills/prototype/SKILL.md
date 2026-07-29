---
name: prototype
description: Build a small disposable Tabelo experiment when execution is the fastest reliable way to answer one technical, behavioral, performance, state-management, browser, or UI question. Use for unresolved practical fit or mechanism questions, not normal production implementation.
---

# Prototype

Use a prototype only when a narrow executable experiment will produce better evidence than more reading or ordinary implementation.

## Workflow

1. State one question and the observable result that will answer or falsify it.
2. Inspect relevant production code, constraints, fixtures, and tooling without modifying production files.
3. Create the smallest isolated experiment under `.scratch/prototypes/<descriptive-slug>/`. Prefer existing project dependencies and test infrastructure.
4. Use synthetic table content with no personal data. Never require production credentials or third-party writes.
5. Run the experiment and record actual observations, including browser, viewport, zoom, table size, timing method, or state sequence when material.
6. Adjust the experiment only when evidence shows it cannot answer the original question.
7. Report the answer, evidence, limitations, and every disposable path created.
8. Remove the prototype before task completion unless the user explicitly asks to retain it. Never commit or push prototype artifacts by default.

## Useful Tabelo experiments

- DOM geometry and focus behavior across zoom levels or browser engines;
- CodeMirror transaction, selection, gutter, or remount behavior;
- parser and serializer edge cases that are not yet understood well enough for a production test;
- React render and serialization timing at supported limits;
- browser clipboard, download, storage, or service-worker behavior in an isolated fixture.

## Boundaries

Do not modify production code to make an experiment convenient. Do not turn prototype code into production code silently. Adoption is a separate issue-scoped implementation with normal tests and review.

## Completion

The prototype is complete when the observation answers the question or makes the remaining evidence gap precise, and all task-created temporary artifacts are accounted for.
