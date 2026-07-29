---
name: resolve-conflicts
description: Resolve an in-progress Tabelo Git merge, rebase, cherry-pick, or revert conflict by reconstructing issue intent, preserving compatible behavior and canonical documentation, and validating the result. Use only when Git is already conflicted or the user explicitly asks to resolve a known conflict.
---

# Resolve Conflicts

Tabelo normally works only on `main`. Do not create or switch branches as part of conflict resolution unless direct instructions explicitly change that policy.

## Workflow

1. Inspect `git status`, operation metadata, current branch, conflicted paths, staged state, and unrelated worktree changes.
2. Identify the exact issue or commit intent on both sides. Read nearby code, tests, issue text, canonical documents, and relevant commits.
3. Give special attention to shared contract files such as `AGENTS.md`, `CONTEXT.md`, `docs/design-system.md`, ADRs, registries, store state, and Playwright configuration. Preserve the latest compatible decisions rather than concatenating text mechanically.
4. Resolve one coherent unit at a time. Never choose `ours` or `theirs` blindly.
5. When intentions conflict, distinguish current behavior, current contract, and desired issue behavior. Stop only when the product choice cannot be reconstructed safely.
6. Inspect the resolved diff, search for conflict markers, and ensure the index contains only intended resolutions.
7. Run focused tests first, then broader checks appropriate to the merged behavior. Read canonical documents end to end when multiple issues amended the same section.

## Safety

Do not discard unrelated changes, abort the operation, continue it, commit, push, force-push, or rewrite history beyond the user's requested scope. If complete resolution was requested, continue only after validation passes and repeat this workflow for later conflicts. Force-push always requires explicit authorization and is normally incompatible with this repository policy.

## Completion

Report the operation, paths resolved, both intentions preserved, decisions made, validation results, remaining conflict state, and whether Git is paused or explicitly completed.
