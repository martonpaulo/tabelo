---
name: copilot-review
description: Validate exactly one GitHub pull request against its linked issue, acceptance criteria, repository instructions, documented contracts, tests, and existing behavior. Use automatically during Copilot code review and whenever reviewing a pull request number or URL.
---

# Code Review

Perform the SDD phase `Validate` for exactly one pull request.

The objective is to determine whether the implementation satisfies its controlling requirements, preserves behavior outside its scope, follows repository policy, has sufficient validation evidence, and introduces no demonstrated blocking defects.

## Operating constraints

- Review only the target pull request.
- Treat this as an audit, not an implementation task.
- Do not edit production code, commit, push, create branches, merge, enable auto-merge, dismiss reviews, or change repository settings.
- Do not claim that evidence was inspected, a command was executed, or a check passed unless that evidence is actually available.
- Use GitHub, CI, Playwright, and other available MCP context only when it materially improves verification.
- Distinguish verified facts, reasonable inferences, and unknowns.
- Write review comments in English.

## Sources of truth

Apply the following precedence:

1. The direct review task
2. The linked issue, approved specification, and acceptance criteria
3. The most specific applicable repository instructions
4. The root `AGENTS.md`
5. Relevant ADRs, design, architecture, domain, API, security, testing, and process documentation
6. Existing code behavior, tests, history, and established patterns

Expose contradictions between these sources. Do not silently resolve a conflict by choosing whichever source is most convenient.

## Workflow

1. Resolve the exact repository and pull request.

2. Record the current pull request head SHA before reviewing.

3. Inspect the available pull request context:
   - title and description
   - base and head branches
   - commit list
   - complete diff
   - changed files in context
   - checks and workflow results
   - existing reviews and inline comments
   - review threads and unresolved conversations

4. Inspect every explicitly linked issue and its available comments.

5. Reconstruct the controlling SDD phases when the evidence exists:
   - `Specify`
   - `Clarify`
   - `Plan`
   - `Tasks`

6. Read the root `AGENTS.md` and any more specific applicable repository instructions made available to the reviewer.

7. Read only the architecture, design, API, domain, security, testing, and process documentation needed to evaluate the change.

8. Inspect relevant callers, consumers, tests, types, configuration, history, blame, and nearby established patterns.

9. Compare the implementation with the controlling requirements:
   - required behavior is present
   - acceptance criteria are satisfied
   - behavior outside the task remains preserved
   - invalid, empty, loading, error, destructive, and recovery states are handled when applicable
   - accessibility and keyboard behavior are preserved
   - security and privacy boundaries are preserved
   - data is not silently lost, corrupted, or reformatted
   - architecture and ownership boundaries remain intact
   - changed behavior has proportionate test evidence

10. Evaluate available validation evidence:
    - inspect successful and failed checks
    - determine whether failures are introduced by the pull request
    - distinguish introduced failures from pre-existing, flaky, environmental, or unrelated failures
    - use local or MCP-based validation only when the current host provides it
    - never infer that an unavailable validation passed

11. Investigate available evidence before asking a question.

12. Ask only when a material ambiguity remains and cannot be safely resolved from the repository, linked issue, pull request, or available tools.

13. Recheck the head SHA before finalizing the review.

14. If the head SHA changed materially, inspect the new changes before publishing findings.

## Finding threshold

Publish a finding only when there is evidence of at least one of the following:

- an unmet requirement or acceptance criterion
- incorrect or missing behavior
- a regression introduced or exposed by the pull request
- silent data loss, corruption, or destructive behavior
- a security or privacy vulnerability
- an explicit repository rule violation with material consequences
- an architecture or ownership violation that creates a concrete defect or regression risk
- missing validation for materially changed behavior
- a concrete accessibility or keyboard regression
- a parser or serializer round-trip failure
- a persistence, import, synchronization, or state-recovery defect
- a material ambiguity that prevents safe validation
- an unresolved review thread representing required work

Do not publish findings for:

- personal preferences
- optional refactors
- unrelated cleanup
- speculative future problems without a concrete failure path
- stylistic differences handled by project tooling
- formatting or lint findings that automated tooling already handles
- dependency upgrades unrelated to the pull request
- features that were not requested
- praise, generic summaries, or restatements of the pull request
- questions answerable from available repository evidence

## Finding requirements

Every finding must include:

1. The affected file and line or the smallest relevant code range
2. The concrete failing scenario or material risk
3. The available evidence supporting the finding
4. The violated requirement, acceptance criterion, repository rule, or established contract
5. The smallest required correction

Make findings independently understandable. Avoid vague statements such as:

- "This may cause problems"
- "Consider improving this"
- "This could be cleaner"
- "You might want to add tests"

Explain exactly what fails, under which conditions, and why it matters.

## Blocking criteria

Treat a finding as blocking when the pull request cannot safely be accepted without correcting it, including:

- a required acceptance criterion is not satisfied
- the implementation produces incorrect externally observable behavior
- user data can be lost or corrupted
- a security or privacy boundary is violated
- the pull request introduces a reproducible regression
- required behavior lacks sufficient validation and cannot be established from available evidence
- an unresolved contradiction prevents determining the intended behavior safely

Do not treat optional improvements as blocking.

## Completion

- Publish only demonstrated, actionable findings.
- Do not invent a finding merely to produce review output.
- If no finding meets the threshold, leave no defect comment.
- Do not attempt to submit a formal `APPROVE` or `REQUEST_CHANGES` verdict.
- Do not attempt to merge the pull request.
- Do not claim that GitHub accepted an action that the reviewer did not perform.
