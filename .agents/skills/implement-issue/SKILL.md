---
name: implement-issue
description: Implement one or more explicitly named Tabelo GitHub issues end to end. Use when asked to resolve, fix, or implement issue numbers in this repository, including dependency checks, decision reconciliation, scoped code and documentation changes, proportional tests, commit, push, and exact issue handoff.
---

# Implement Issue

Treat the requested issue numbers as an exact scope contract. Keep them controlling from discovery through the final report.

## Establish the issue contract

1. Read `AGENTS.md`, then fetch every requested issue from GitHub when access is available. If remote access is unavailable, use issue text supplied by the user and say that live state could not be verified.
2. Assert that the fetched issue-number set equals the requested set. Never substitute a related, newer, easier, or previously discussed issue.
3. Capture each issue's current state, objective, decided behavior, acceptance guidance, tasks, dependencies, coordination notes, and unresolved decisions.
4. Check whether dependencies are actually complete in the current code, not merely closed on GitHub. Check current decision-register and coordination issues when the requested work refers to them. The present backlog uses #80 for decisions and #85 for design-system coordination, but verify live state before relying on those numbers.
5. Separate three kinds of evidence:
   - current behavior: source, tests, and a reproduction;
   - current repository contract: `AGENTS.md`, `CONTEXT.md`, ADRs, and `docs/design-system.md`;
   - desired behavior: the requested issue and direct user instructions.
6. Expose contradictions among those sources. An accepted issue may deliberately change a current contract, but the implementation must update the smallest canonical document in the same change.

Stop for user direction only when a blocking product choice remains unresolved and code, issue discussion, and repository contracts cannot settle it safely.

## Inspect before editing

1. Create or switch to a branch named under `AGENTS.md`'s branch naming
   scheme, `type/agent/issue-NNN/short-description`, from an up-to-date
   `main`. Inspect `git status` and preserve unrelated changes.
2. Search for the named behavior, symbols, callers, tests, copy, registry entries, persistence boundaries, and documentation statements.
3. Read the smallest relevant source slice and its stable test seam. Do not implement from the issue's file list alone because paths and code may have changed.
4. Identify the owner of every changed rule or state. Reject parallel sources of truth.

## Route specialized work

Use the smallest applicable repository-local skill. Read its `SKILL.md` before following it.

- Non-trivial bug or regression: [`debug`](../debug/SKILL.md)
- Ambiguous rules, states, or vocabulary: [`domain-model`](../domain-model/SKILL.md)
- Boundary, ownership, or dependency-direction work: [`module-design`](../module-design/SKILL.md)
- Current framework, browser, standard, or API facts: [`research`](../research/SKILL.md)
- One narrow uncertainty best answered by execution: [`prototype`](../prototype/SKILL.md)
- UI, accessibility, interaction, tokens, or copy: [`ui-contract`](../ui-contract/SKILL.md)
- Codecs, import, clipboard, serialization, or losslessness: [`codec-contract`](../codec-contract/SKILL.md)
- An already-conflicted Git operation: [`resolve-conflicts`](../resolve-conflicts/SKILL.md)

Keep issue ownership here when another skill supplies a method. Do not expand the issue scope merely because a specialist reveals adjacent work.

## Implement

1. Make the smallest coherent change that satisfies the acceptance guidance and preserves higher-priority product contracts.
2. Reuse project code, browser capabilities, `packages/ui` primitives, and existing dependencies in that order.
3. Model invalid states explicitly. Preserve table content, draft recovery, stable identifiers, registry-driven behavior, keyboard access, and centralized copy wherever they are affected.
4. Update tests and canonical documentation with the behavior. Parser and serializer changes require round-trip tests. UI-boundary behavior requires Playwright coverage.
5. If an unrelated defect appears, search GitHub before creating anything. Fix it only when it is required for the requested issue and remains within scope; otherwise follow the repository's unresolved-defect policy.

## Validate and publish

1. Run the narrowest relevant check first. Inspect a failure before rerunning it.
2. Expand to the broader checks required by risk and `AGENTS.md`. Run Chromium for the complete browser suite; use Firefox only for the centrally selected engine-sensitive flows.
3. Inspect the diff, confirm requested issue numbers still control it, and verify no temporary output or unrelated file is included.
4. Commit on the task branch with one Conventional Commit concern per
   commit, each subject ending `(#<issue number>)`, then push the branch and
   open the pull request, per `AGENTS.md`'s branch workflow. Follow the
   executing agent's own GitHub conventions, when it carries one, for the PR
   body and signature; otherwise write a plain body describing the change and
   linking the issue. Do not merge the pull request: merging is the user's or
   the reviewer's call.
5. Mutate, comment on, or close only the exact requested GitHub issues, and only when the task authorizes that issue action. Never target related issues implicitly.

## Completion

Report the requested issue numbers and live state, behavior changed, files touched, exact validation results, documentation updates, warnings and residual risk, commit hashes, the branch and pull request opened, and final worktree status. Do not claim an issue is complete when acceptance guidance or required validation remains unmet.
