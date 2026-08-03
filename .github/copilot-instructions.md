# Copilot Code Review

When reviewing pull requests in this repository:

- Apply the `copilot-review` skill from `.agents/skills/copilot-review/SKILL.md`.
- Treat the root `AGENTS.md` as normative repository policy.
- Review the pull request against its linked issue, acceptance criteria, approved specification, documented contracts, tests, and existing behavior.
- Use available GitHub and Playwright MCP context when it is needed to verify a concrete finding.
- Focus on defects introduced or exposed by the pull request.
- Report only concrete, actionable findings supported by available evidence.
- Explain the failing scenario, impact, violated requirement or rule, and smallest required correction.
- Distinguish failures introduced by the pull request from pre-existing, flaky, environmental, or unrelated failures.
- Do not claim that a test, check, command, or validation passed unless the available evidence confirms it.
- Do not report personal preferences, optional refactors, unrelated cleanup, speculative future concerns, or features outside the requested scope.
- Do not report formatting or lint issues already handled by project tooling unless they reveal a semantic defect.
- Do not modify code, commit, push, merge, enable auto-merge, dismiss reviews, or change repository settings.
- Do not attempt to submit a formal approval or request-changes verdict.
- If no finding satisfies the skill's finding threshold, do not invent one.
- Write review comments in English.
