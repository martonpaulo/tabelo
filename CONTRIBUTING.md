# Contributing to Tabelo

Thanks for taking the time. Tabelo is a small, deliberately narrow project, so the most useful
contribution is usually a precise bug report.

## Reporting a bug

Open an issue at
[github.com/martonpaulo/tabelo/issues](https://github.com/martonpaulo/tabelo/issues) and include:

- What you did, what you expected, and what happened instead.
- The **table that reproduces it**, pasted as Markdown or CSV, if the bug involves specific content.
- Which views were open, and your Chromium browser and version.

Tabelo is Chromium only. It is developed, tested, and verified in Chrome and other Chromium-based
browsers, so a bug that only appears in another engine is not something this project fixes.

Your data never leaves your browser, so nothing is logged anywhere: a reproduction is the only
evidence there is.

<br />

## Proposing a change

Open an issue first and describe the change before writing code. Tabelo says no to a lot on purpose,
and [`README.md`](README.md) lists what it deliberately does not do: formulas, extra sheets, charts,
macros, pivot tables, accounts, cloud sync, collaboration, and analytics.

Before changing anything, read the decision records in [`docs/adr/`](docs/adr/),
[`docs/design-system.md`](docs/design-system.md), which is binding for anything visual,
[`CONTEXT.md`](CONTEXT.md), which defines the vocabulary, and [`AGENTS.md`](AGENTS.md), which holds
the working agreements this repository actually follows.

<br />

## Branches, commits, and pull requests

Work happens on a branch and arrives through a pull request. The conventions are recorded in
[`AGENTS.md`](AGENTS.md):

- **Branch name**: `type/agent/issue-number/short-description`, where `type` is one of `feature`,
  `hotfix`, `fix`, `chore`, `docs`, `refactor`, `test`, `agent` identifies who is working (use
  `perso` for the maintainer), and `issue-number` is `issue-NNN`, zero-padded to three digits — for
  example `feature/perso/issue-024/two-level-keyboard-navigation`.
- **Commit subject**: a Conventional Commits subject; one made for an issue ends with the issue
  number, for example `feat: add the export button (#54)`. A commit belonging to no issue carries no
  suffix. One concern per commit.
- **Pull request title**: a Conventional Commits subject ending in the issue numbers it closes, for
  example `feat(grid): add the export button (#54)` or `fix: normalize carriage returns (#54, #61)`.
- **Pull request body**: it starts with one `Closes #<n>` line per issue the pull request closes,
  and that set must match the title's numbers exactly.
- Pull requests are **squash merged** and the branch is deleted afterwards.

Nothing enforces the title automatically, so a wrong one is corrected in the GitHub UI before merge.

<br />

## Running the validation gate locally

```bash
pnpm install
pnpm check && pnpm check-types && pnpm test
```

Add `pnpm test:e2e` when the change crosses a UI boundary, which is the coverage CI selects for you
anyway; the first run needs `pnpm test:e2e:install` to fetch Chromium.

`pnpm check:dead-code` runs Knip, which is strict here: an unused file, export, or dependency is a
finding, so remove what your change orphaned rather than leaving it behind.

[`README.md`](README.md) lists every command.

<br />

## Conduct

Be decent and assume good faith; anything else gets moderated without ceremony.
