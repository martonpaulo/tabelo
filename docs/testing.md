# Testing

Canonical for what each automated test layer owns, how the suites are selected,
and the execution budgets that keep feedback useful. `AGENTS.md` remains
normative for required validation, test style, and repository process.

## Baseline

Measured on 2026-08-24 at `dd637ae`, before the configuration changes in
#282 and #302.

Local unit measurements used an Apple M1 with 8 GB RAM, macOS 26.5.2,
Node 24.18.0, pnpm 11.7.0, and no other Tabelo test process running:

| scope | files | tests | runner duration | wall time |
| --- | ---: | ---: | ---: | ---: |
| complete Vitest gate | 66 | 1,230 passed, 4 skipped | 5.32 s | 6.19 s |
| ordinary unit project | 63 | 1,186 passed, 4 skipped | 5.80 s | 6.63 s |
| property project | 3 | 44 passed | 4.83 s | 5.68 s |

The two focused project rows were measured concurrently after the split. They
prove the scopes and their individual cost, but their durations must not be
added to estimate the complete gate.

Recent GitHub-hosted runs put the complete Vitest gate at 13.99 to 14.97
seconds for the same 66 files. It is not a CI bottleneck. The browser suite is:

| selection | current count | observed CI job time |
| --- | ---: | ---: |
| level 3 smoke | 1 | below the fixed runner setup cost |
| level 3 smoke and visual system | 22 | below the fixed runner setup cost |
| full suite, one shard | 412 to 419 | 6:24 to 8:12 |
| full suite, two shards | 206 per shard | 4:02 and 4:33 |

The hosted comparison uses the successful [single-shard pull request
run](https://github.com/martonpaulo/tabelo/actions/runs/32736124571) and the
[two-shard main run](https://github.com/martonpaulo/tabelo/actions/runs/32734145080).
The browser process started about 45 seconds after each shard job began, so the
figures include the fixed checkout, install, and browser-install cost.

## Execution budgets

The target is a browser shard job below five minutes, including its fixed setup
cost. `.github/workflows/ci.yml` owns one `TESTS_PER_SHARD` constant, currently
250. The Check job lists the selected Chromium tests, counts the JSON report,
and derives `ceil(test count / TESTS_PER_SHARD)`. Both the 419-test baseline and
the audited 414-test suite produce two balanced shards. A third runner is not
paid for until the suite exceeds 500 tests.

Playwright's `fullyParallel: true` is the balancing mechanism. It lets
Playwright distribute individual tests across shards, so a hand-maintained
domain-to-shard map would be less balanced and would drift whenever a spec
changes size.

Change the cap only after measuring comparable CI jobs. Include setup time in
the decision. A lower number is not an improvement when extra runners spend
more time installing than testing.

## Suite ownership

Use the narrowest seam that observes the behavior:

- Pure document rules, operations, parsing, serialization, validation,
  migrations, and deterministic state transitions belong in Vitest.
- Generated properties are for broad invariants with many meaningful input
  combinations, especially data preservation and codec round trips. They do
  not replace worked examples that explain a contract.
- A behavior that crosses the running interface belongs in Playwright. Do not
  duplicate pure logic there merely to increase the browser count.
- Benchmarks measure runtime and never assert a duration. They are instruments,
  not tests and not browser-triggering application changes.

Do not keep a weaker duplicate when a stronger seam already owns the contract.
In particular, do not assert literal copy, CSS class strings, generated IDs, or
thin re-exports in unit tests when a browser test observes the resulting
semantics or presentation. Combine assertions that share the same setup and
action, and keep one browser wiring example when a pure test exhaustively owns
the permutations.

The 2026-08-24 audit applied those rules without reducing generated coverage.
It removed 16 redundant Vitest cases and five duplicate Playwright scenarios.
The resulting gate has 64 Vitest files with 1,214 passing and four skipped
tests, plus 414 Chromium tests in 50 files. The 44 property tests are unchanged.

The detailed rules for stable seams, selectors, waits, synthetic data, and
required browser coverage stay in `AGENTS.md` rather than being copied here.

## Vitest projects

`pnpm test` remains the complete gate. Focused commands are:

```sh
pnpm test:unit
pnpm test:property
```

The `unit` project includes ordinary `*.test.ts` files and keeps Vitest's
five-second timeout. The `property` project includes exactly
`*.property.test.ts`, keeps `PROPERTY_RUNS = 100`, and has a finite 15-second
timeout. The separate budget covers the observed 7.747-second property under
host contention without weakening its generated cases or delaying every
ordinary unit failure.

Property checks that are cheap enough to live in an ordinary test file stay in
the unit project. Move a file to the property project only when it represents a
broad invariant and measurements justify the larger budget.

## CI selection

Selection is risk-based. It is not a source-domain shortcut:

- Tests, fixtures, Vitest configuration, and non-shipping benchmark files stay
  within the Check job and need no browser run.
- Product identity and interface copy use the smoke selection. The global
  stylesheet adds the visual-system selection.
- Application changes, unknown paths, pushes to `main`, and manual runs use the
  full browser suite.
- Workflow and Playwright harness changes use that same full selection. The
  dynamic cap determines their shard count like every other browser run.

A source-directory-to-spec map was rejected. Tabelo's format, state, and UI
boundaries converge in synchronization, import, clipboard, persistence, and
workspace flows, so a directory name is not evidence that unrelated browser
specs are safe to skip. Unmapped application work therefore continues to run
the full suite. Renames and mixed changes retain the classification rules in
`AGENTS.md`.

When the complete suite grows, improve its balance through the measured cap or
remove duplicate tests at their real seam. Do not create a manual domain shard
list to hide growth.
