---
name: debug
description: Diagnose and fix a non-trivial Tabelo bug or regression through reproduction, evidence gathering, falsifiable hypotheses, root-cause analysis, a minimal issue-scoped fix, and regression verification. Use when the cause is not already established by current code and evidence.
---

# Debug

Use this discipline for intermittent failures, browser-specific behavior, accessibility regressions, performance defects, and bugs whose reported cause is still a hypothesis.

## Workflow

1. Read the controlling issue, `AGENTS.md`, the affected contract documents, relevant code, callers, tests, and recent changes.
2. Reproduce the exact symptom or gather the strongest available concrete evidence. Match the issue's input, browser, viewport, zoom, focus state, persistence state, and table size when material.
3. Reduce the scenario while preserving the failure. Record the smallest reliable command or interaction.
4. Separate symptoms from causes. State falsifiable hypotheses and rank them by evidence.
5. Test one hypothesis at a time with a focused test, DOM measurement, controlled input, profiler, or temporary instrumentation. Use [`research`](../research/SKILL.md) when a hypothesis depends on documented browser or library behavior. Use [`prototype`](../prototype/SKILL.md) when an isolated experiment is faster than changing production code.
6. Identify the root cause at the owning boundary and make the smallest correct fix. Do not batch speculative tweaks or adjacent cleanup.
7. Add regression coverage at the closest stable seam. Cross-view, focus, responsive, persistence, clipboard, download, and source-editor behavior belongs in Playwright when unit tests cannot prove it.
8. Run the original reproduction first, then focused tests, then broader checks proportional to the affected contract.
9. Remove all temporary instrumentation and task-created artifacts.

## Evidence rules

- Do not treat an issue's proposed root cause as confirmed until current evidence supports it.
- A failure at 100% zoom does not prove a zoom issue, and a passing default-zoom test does not disprove one.
- A computed style does not prove rendered geometry. Measure the user-visible result when layout or focus is the symptom.
- A TypeScript or unit-test pass does not prove keyboard, accessibility-tree, browser-storage, clipboard, download, or paint behavior.
- If reproduction is impossible, report what was tried and keep the remaining cause explicitly unconfirmed.

## Completion

Claim the bug is fixed only when the original symptom no longer reproduces, focused regression coverage passes, broader relevant checks pass, and temporary debugging work is gone. Report root cause, fix, commands, results, browser coverage, and residual uncertainty.
