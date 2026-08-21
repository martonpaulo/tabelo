# Tabelo: Agent Policy

Durable root policy for Tabelo. Follow it for all coding, UI, documentation,
validation, git, and deployment work in this repository. A more specific
`AGENTS.md` inside a subtree overrides this one for that subtree.

> This file documents **patterns and contracts**, not the current file layout.
> Describe responsibilities, not exact file or folder names: names drift, and
> stale structure docs are worse than none.

## Project identity and policy

Stable, one-time decisions. Change an established identifier, license,
visibility, versioning model, localization strategy,
landing-page contract, or release policy only through an explicit task that
describes the migration and its downstream effects.

- Project and public name: `Tabelo`
- Description: edit one table visually or through synchronized text formats, entirely in your browser
- Repository: `martonpaulo/tabelo` (public)
- Public identifiers: workspace app `web`; internal packages `@tabelo/ui` and
  `@tabelo/config`. All workspace packages are private and are
  never published to a registry
- Landing page: the application itself, at
  `https://martonpaulo.github.io/tabelo/`, built from `apps/web` and published
  to GitHub Pages by CI. There is no separate marketing site. `/tabelo/` is the
  canonical production path; any deeper application path redirects to it. The
  equivalent canonical path in local development is `/`
- License: `MIT`, © 2026 Marton Paulo
- Development language: English (code, comments, commits, filenames, tests,
  configuration, developer docs)
- Product copy: English only, single locale, no i18n framework. Dates and
  numbers inside table cells are never localized or reformatted
- Supported browser: **Chromium only.** Chrome and other Chromium-based
  browsers are the single target the product is developed against, tested in,
  and verified on. Nothing deliberately blocks another engine, and the app may
  well work in one, but no other engine is tested, no behaviour is verified
  there, and a defect that reproduces only outside Chromium is not a blocker.
  This is the canonical statement of that policy: everything else, the
  Playwright configuration, the CI matrix, and the testing rules below, is a
  consequence of it rather than a second owner. Do not add a browser-specific
  workaround, a polyfill, or a fallback for a non-Chromium engine, and do not
  keep one whose only reason was such an engine
- Branch workflow: **branch and pull request by default.** A task or issue gets
  its own branch named under the scheme below; direct commits to `main` are
  reserved for quick, low-risk fixes, most often made by the maintainer
  directly. An agent may commit straight to `main` only for that kind of
  fix, or when the user explicitly asks for the work to happen on `main`
- Commit policy: commit automatically on task completion, one concern per
  commit, on whichever branch the branch workflow above selects
- Push policy: push automatically after committing. On a task branch, push the
  branch and open the pull request automatically once validation passes; on
  `main`, push `origin/main` directly
- Product versioning: **unversioned**. The deployed site is always the current
  version. No version number, tag, or release name ever appears anywhere in
  the product. The `0.0.0` in workspace manifests is a package-manager
  placeholder, not a product version, and is never bumped as if it were a
  release. There is no `CHANGELOG.md`, no tags, and no release process
- Branch naming: `type/agent/issue-number/short-description`. `type` is one of
  `feature`, `hotfix`, `fix`, `chore`, `docs`, `refactor`, `test`. `agent` is
  the acting coding agent (for example `claude`, `codex`), or `perso` for
  branches created directly by the maintainer. `issue-number` is the GitHub
  issue number as `issue-NNN`, zero-padded to three digits. `short-description`
  is a kebab-case summary. Examples:
  `hotfix/codex/issue-083/gutter-alignment-across-pane-zoom-levels`,
  `feature/claude/issue-024/two-level-keyboard-navigation`
- Commit subject: a commit made for an issue ends with `(#<issue number>)`, for
  example `feat: add the export button (#54)`. It is the issue number, never
  the pull request's, and a commit belonging to no issue carries no suffix
- Merge policy: **rebase merge**, `gh pr merge <number> --rebase
  --delete-branch`. Every commit of the branch reaches `main` intact, so the
  one-concern-per-commit history and each issue suffix survive. Never squash:
  squashing collapses them into one subject and discards every issue reference
  but one. The repository's GitHub settings allow rebase only
- Delete branches after merge: enabled
- Release, signing, and secret storage: **not applicable**. Nothing is
  downloaded, installed, or signed. Deployment is GitHub Pages via GitHub
  Actions using the built-in `GITHUB_TOKEN`; this project stores no secrets

## Product

Tabelo is a browser-based table editor. One table document is shown through
several synchronized views: a visual grid, Markdown, CSV, TSV, HTML source,
Jira syntax, JSON, and a rendered preview, arranged in a configurable workspace
of one to four panes.

**Simple by design.** `docs/product.md` is canonical for who the product
serves, what it does, and what it will never do, each non-goal with the reason
it was decided. Read it before proposing or accepting a feature: new capability
is a deliberate product change, not a default. The product is a focused editor,
not a spreadsheet, so do not import spreadsheet density or spreadsheet
features.

The product priority order is fixed:

1. Data preservation: never lose a user's table content silently
2. Predictable synchronization between every open view
3. Fast keyboard interaction and accessibility
4. Calm, minimal, immediately understandable interface
5. Runtime performance
6. Implementation speed and maintainability
7. Additional features

Do not trade a higher-priority item for a lower-priority item.

## Domain rules

These are normative and were resolved deliberately. See `CONTEXT.md` for
vocabulary and `docs/adr/` for the reasoning.

- **Every table has exactly one header row.** There is no headerless mode and no
  `hasHeader` document state. Header presence is an **import-time** fact: formats
  that identify a header declare it, and CSV, TSV, or plain text asks whether row
  1 is the header before replacing the document. Choosing data creates empty
  headers; nothing infers from cell values. Paste into an existing selection is
  a matrix write and never asks. CSV export offers an "include header row"
  option. That is an output preference, never document state.
- **Escaping is reversible in every codec that owns it.** Markdown escapes `|`
  as `\|` and newlines as `<br>`, and encodes meaningful boundary whitespace
  before adding readable alignment padding. Jira escapes pipes, newlines,
  backslashes, and literal ampersands. Each parser reverses only the grammar its
  serializer emits, exactly once and without recursive decoding. A value must
  survive a round trip through either codec byte-exact. Never flatten or drop
  content to make serialized text look cleaner.
- **Every other view holds the last valid parse and stays editable.** When a
  draft does not parse, keep displaying the last successful parse everywhere
  else, surface the error in the owning pane, and leave the grid fully editable.
  A grid edit then wins and regenerates the text; the superseded draft must
  remain recoverable through undo and is never silently destroyed.
- **Undo is layered.** Inside a source view, undo is the editor's own
  keystroke-level history. When that history is exhausted, or when focus is on
  the grid, undo walks a single document timeline in which each committed parse
  and each grid operation is one step.
- **A cell's type is carried, never derived.** A cell holds a string, a number,
  a boolean, or null, and a column declares the type it expects for editing. The
  expectation guides entry and never constrains the data, so one column may hold
  values that disagree with it. A value becomes typed only because a typed source
  stated the type or the user chose it: no codec, view, paste, or migration may
  read text and conclude a type from it. A format that cannot express a type
  serializes the projected text and parses strings back. During source
  reconciliation, an unchanged string projection retains the existing cell
  value; changed or newly inserted text stays a string. `null` and the empty
  string project alike and stay distinct only when the previous document
  supplies that distinction. See `docs/adr/0008`.
- **Column alignment is document state.** Alignment is Markdown- and
  HTML-specific metadata but belongs to the document, so it survives time spent
  in CSV, TSV, or Jira. None of those formats can express it, and it round-trips
  back unchanged.
- **Target scale is roughly 200 rows.** Do not add virtualization, Web Workers,
  or IndexedDB. Refuse oversized input with a clear, actionable message before
  it can freeze or crash the tab. An engine limit or allocation failure is a
  defect, not an acceptable oversized-input path.
- **Exactly one draft can be pending at a time.** The view being typed into owns
  it; every other view is a pure projection of the document. There is never a
  question of which pending edit wins.
- **Each view appears at most once in the workspace.** A workspace may contain
  one visual table, one Markdown view, one CSV view, and so on. View choices
  already present in another pane stay visible but disabled; persisted workspace
  data that violates this invariant is invalid.
- **Formats and views are registry data, never branching.** Nothing outside
  `formats/index.ts` and `views/registry.ts` may enumerate formats. Render by
  `kind`, decide behaviour by `capabilities`, and never switch on a view id.
  Adding a format is one file plus one registry line: see `docs/adr/0005`.
- **Backspace clears contents; the modifier removes structure.** `Backspace`
  empties the selected cells, `Mod+Backspace` deletes the selected rows or
  columns. Neither may fire while text is being edited in a cell or a source
  view.
- **New table is destructive only when work exists.** Confirm before replacing a
  non-empty document or any pending draft, including an invalid draft. Skip the
  confirmation only when the document is empty and no draft exists.

## Frozen technical direction

Use the scaffolded versions unless a task explicitly requires an upgrade.

- React 19, TypeScript in strict mode, Vite
- No router: one page, mounted directly, SPA only. See `docs/adr/0007`
- Tailwind CSS v4
- shadcn/ui on Base UI primitives, in `@tabelo/ui`
- CodeMirror 6 for every source view, lazily loaded
- A hand-built DOM grid with no grid library: see `docs/adr/0004`
- Zustand for the document store
- Zod for persisted, imported, and pasted data validation
- Papa Parse for CSV parsing and serialization
- Biome for formatting and linting
- Vitest for unit tests, with happy-dom for the codec that uses `DOMParser`
- Playwright for the browser suite, covering the cross-view, history,
  persistence, import, responsive, and keyboard contracts that unit tests
  cannot reach. One project, Chromium, locally and in CI, per the supported
  browser policy above
- pnpm workspaces
- `vite-plugin-pwa` in `generateSW` mode for offline capability

Do not add without an explicit, demonstrated need:

- a backend, server runtime, database, ORM, or authentication
- a second source-editor implementation such as Monaco
- a grid, headless-table, or drag-and-drop library. It is not the current
  architecture. Reopen the decision only when a concrete backlog cluster shows
  that a named candidate removes more product-specific interaction and state
  code than it introduces, and record that comparison as an amendment to
  `docs/adr/0004`
- a CRDT or collaboration layer
- a router: removed in `docs/adr/0007` once the product settled on one page, so
  adding one back means naming the second page it serves
- React Query, Axios, or Redux
- a second component library, state library, validation library, or formatter
- an animation library, CSS-in-JS, or Storybook
- analytics or telemetry of any kind
- Turborepo or Nx

## Architecture boundaries

Keep these concerns independent. The dependency direction points inward: UI may
depend on the core, never the reverse.

- **Table document**: the internal representation. Columns, rows, cell values,
  stable identifiers, alignment, schema version. Plain data, no framework
  imports.
- **Workspace**: the slot model, layout presets, and pane placement. Knows
  about view ids and nothing else about views.
- **Table operations**: pure functions over the document: insert, delete,
  duplicate, move, resize, set cell, edit header, clear range. No React, no DOM.
- **Codecs**: one `parse`/`serialize` pair per format behind a shared
  contract, plus the file facts needed to download it. Format-specific escaping
  rules live here and nowhere else.
- **View registry**: what the workspace can display, described by capability.
  It may import codecs; it must never import the editor or any component.
- **Synchronization**: owns the text draft buffer, debouncing, parse
  scheduling, structural diffing that preserves identifiers, and loop
  prevention. Every editor transaction carries an origin annotation;
  sync-originated transactions never re-trigger a parse.
- **History**: the document timeline and its interaction with the text editor's
  local history.
- **Persistence**: one current, versioned `localStorage` schema, plus an
  explicit forward-only migration chain from every version that has shipped.
  Each step transforms only what changed, validates its result with Zod, and
  carries a stored fixture of the payload it migrates. A payload that fails to
  migrate or to validate is preserved raw and reported, never coerced into the
  current shape, and a version newer than the current one stays unreadable
  rather than being guessed at. Shipping a schema change without its migration
  step is data loss caused by the product, which priority 1 forbids. This
  current-schema policy does not narrow the valid syntax accepted by import
  codecs.
- **Clipboard**: format sniffing for paste and payload construction for
  copy/cut, independent of both the grid and the text panel. It owns one
  private payload schema, versioned separately from persistence because the two
  have different owners and compatibility windows, and validated at paste like
  any other untrusted input. It carries what the interoperable flavours cannot
  spell and never overrides what they visibly say.
- **Visual grid**: selection, focus, keyboard model, and rendering. Presentation
  only; it calls table operations rather than mutating the document itself.

A cell value is a string, a number, a boolean, or null, and its type is always
carried rather than derived: a typed source stated it or the user chose it.
Tabelo does not infer a type from text, coerce numbers, or reformat content.
One core function projects a value to text, and every view, codec, and export
reads a cell through it. See `docs/adr/0008`.

## Build and validate

Prefer the smallest relevant check.

- `pnpm dev`: run the app locally. The dev and preview ports are derived from
  the worktree path so parallel checkouts cannot serve or test each other's
  build; `TABELO_DEV_PORT` and `TABELO_PREVIEW_PORT` override them, and
  `.claude/launch.json` is generated from the same value on install
- `pnpm build`: production build for every workspace
- `pnpm check-types`: TypeScript across the workspace
- `pnpm check`: Biome format and lint with `--write`
- `pnpm check:dead-code`: Knip, reporting unused files, exports, dependencies,
  and catalog entries. It needs an installed workspace, because without
  `node_modules` it cannot load the Vite, Vitest, and Playwright configuration
  and every test file turns into a false positive. Advisory and deliberately
  not in CI: run it when removing code or changing a manifest
- `pnpm test`: unit tests, `pnpm test:watch` to re-run on change
- `pnpm test:e2e`: the Playwright suite in Chromium. It builds and serves the
  app itself, so it needs no running dev server. First run only:
  `pnpm test:e2e:install`. Iterate with `pnpm test:e2e:changed` after an edit
  and `pnpm test:e2e:failed` after a fix, or narrow with a spec name or
  `-g "<title>"`; neither is a gate, so run the suite whole before reporting.
  `pnpm test:e2e:serve` keeps a warm preview server across those rounds
- Pass a focused spec path or Playwright option directly after the root script.
  Never add a standalone `--` after `pnpm test:e2e`: it ends option parsing and
  can turn a focused command into the configured project matrix. Before a new
  focused selection, list its resolved scope and confirm the files, projects,
  and test count match the intent:

  ```sh
  pnpm test:e2e e2e/import.spec.ts --list
  ```

  Then run the focused spec, or one named behavior explicitly:

  ```sh
  TABELO_E2E_WORKERS=1 pnpm test:e2e e2e/import.spec.ts
  pnpm test:e2e e2e/import.spec.ts -g "<title>"
  ```

  If execution announces a materially larger test count than the intent,
  interrupt it immediately and correct the command. Do not let a focused run
  silently become a full gate
- Several worktrees share one machine. Set `TABELO_E2E_WORKERS=1` when another
  checkout is running its own suite. Before a full browser gate, check whether
  another worktree is already running Playwright; wait or keep one worker rather
  than creating resource contention and unrelated timeout failures

CI and Pages deployment are skipped only when every changed path matches the
non-build path list owned by their workflows. For pull requests that run CI,
the Check job always runs and browser coverage is selected by the highest-risk
changed path: unit tests, fixtures, and unit-test tooling need no browser run;
product identity and interface copy run the Chromium smoke suite; the global
stylesheet runs the smoke and visual-system suites; all other application
changes and unknown paths run the full Chromium suite; workflow or Playwright
configuration runs that same suite sharded across two runners, which is what
proves sharding still works when the harness itself changed. Pushes to `main`
and manual runs also use that sharded matrix. Renames classify both the old and
new path, so moving a file cannot reduce coverage. Mixed changes always use the
highest applicable level.

Never claim a check passed unless it ran successfully.

A behaviour that crosses a UI boundary belongs in the browser suite, not only
in a unit test. Keep it behavioural: stable roles and labels, no arbitrary
sleeps, no pixel snapshots, and storage isolated per test.

## Agent instruction files

- `AGENTS.md` is the source of truth.
- Keep a root `CLAUDE.md` symbolic link pointing to `AGENTS.md`.
- Add folder-specific `AGENTS.md` files only when a subtree genuinely requires
  different rules, each with a sibling `CLAUDE.md` symbolic link.
- Do not duplicate the same rules across instruction files.

## Skills

Skills this repository owns, all under `.agents/skills/`. These are the
complete skill source for Tabelo work in local and cloud agents; do not require
or reference a machine-local skills checkout. Keep one line each: what it owns,
when it applies, what it defers to. Remove an entry when its skill is gone, and
add one when a new skill is written.

- `implement-issue`: owns GitHub issue implementation end to end, from the
  scope contract through code, tests, commit, push, and handoff. Entry point
  for any named issue number. Defers to: the specialists below for the part of
  the work each one owns.
- `codec-contract`: owns parsing, serialization, format sniffing, import,
  paste, clipboard, download, output options, and round-trip preservation.
  Defers to: `domain-model` when the ambiguity is vocabulary, not encoding.
- `ui-contract`: owns UI, UX, accessibility, interaction, responsive layout,
  design tokens, and visible copy, with `docs/design-system.md` normative.
  Defers to: `module-design` when the question is ownership, not presentation.
- `debug`: owns diagnosis of a non-trivial bug or regression whose cause is
  still a hypothesis. Defers to: `codec-contract` or `ui-contract` for the fix
  once the cause is established.
- `domain-model`: owns terminology, entities, states, transitions, and rule
  ownership, with `CONTEXT.md` canonical. Defers to: `docs/adr/` for decisions
  already made.
- `module-design`: owns boundaries, interfaces, dependency direction, cohesion,
  and stable test seams inside the architecture boundaries recorded above.
- `research`: owns external primary-source research for this stack: React,
  CodeMirror, Base UI, Playwright, Vite, PWA, browser and web-standard
  behavior. Defers to: the repository itself for anything answerable locally.
- `prototype`: owns disposable experiments that answer one executable
  question, written under `.scratch/prototypes/`.
- `resolve-conflicts`: owns an in-progress Git merge, rebase, cherry-pick, or
  revert conflict. Applies only when Git is already conflicted.
- `copilot-review`: owns validating exactly one pull request against its
  linked issue and this policy. Invoked by GitHub Copilot review through
  `.github/copilot-instructions.md`. Read-only: it never commits, merges, or
  changes repository settings.

Six of these (`debug`, `domain-model`, `module-design`, `research`,
`prototype`, `resolve-conflicts`) share a name with a general skill an agent
may also carry. The Tabelo one wins in this repository: it knows the ADRs, the
codec and view registries, `CONTEXT.md`, and the validation commands, and the
general one does not.

Precedence: when a project skill and a general one both cover a task, the
project skill owns the project-specific procedure and the general skill keeps
the process around it. A task no project skill claims follows normal skill
triggering. Two skills claiming the same job is a defect to resolve, not a
preference to exercise per task.

## Reference paths

- Product definition: `docs/product.md`
- Domain glossary: `CONTEXT.md`
- Sample people for fixtures, examples, and manual checks:
  `apps/web/src/core/sample-data.ts`
- ADRs: `docs/adr/`
- Research notes: `docs/research/` (create only when persisting research)
- Handoffs: `.scratch/handoffs/`
- Prototypes: `.scratch/prototypes/`

## Instruction hierarchy and sources of truth

- Follow the direct task, the most specific applicable scoped instructions, this
  root file, then general working agreements, in that order.
- Code is evidence of current behavior. `AGENTS.md` is normative for process. An
  approved specification is normative for desired behavior. Expose divergence
  among them; do not silently resolve every conflict in favor of one source.
- An accepted issue that reverses a rule, decision, or rationale in canonical
  documentation must amend that document in the same implementation. This
  includes ADR decisions and reasoning; do not defer the correction to a
  tracking issue.
- Keep one canonical source for each rule. Secondary documents summarize or link
  to it instead of restating it.
- Be direct and evidence-based. State assumptions, uncertainty, risks, and
  blockers. Ask only when a material decision cannot be discovered safely.
- Do not turn analysis, research, or a read-only audit into implementation
  without authorization.

## Before editing

1. Check applicable instructions, Git status, and the current branch.
2. Search for the behavior, callers, tests, contracts, and nearby patterns
   before adding anything.
3. Read only the files and chunks required to understand the affected behavior.
4. Distinguish verified facts, reasonable inferences, and unknowns.
5. Define the source of truth and ownership before changing data or state.

## Scope, reuse, and implementation

- Keep changes scoped to the requested result. Do not mix unrelated cleanup,
  redesign, dependency updates, broad refactors, or future work.
- Preserve behavior outside the task and preserve unrelated or uncommitted user
  changes.
- Search for existing components, types, helpers, tokens, configuration, and
  tests before creating new ones.
- Reuse before building, and say what you rejected. Check, in order: this
  project's own code, the platform (browser APIs, native elements), the
  primitives already in `packages/ui`, then a maintained dependency. Writing
  something by hand that one of those already does is a defect, not craft; and
  writing a dependency's job by hand needs a stated reason.
- Prefer the smallest correct, readable, reversible solution.
- Maintain one owner and one source of truth for each rule, state, mapping,
  default, and copy value. Derive values instead of storing synchronized copies.
  Model invalid states explicitly.
- Do not add dependencies, layers, caches, observers, timers, polling, or
  background jobs without a current requirement and a clear owner.
- Implement relevant errors, states, accessibility, and tests with the behavior
  rather than as follow-up work.

## Data and destructive operations

- Distinguish canonical data (the table document), reconstructible derivations
  (serialized Markdown and CSV text), transient state (selection, draft buffer),
  and local preferences (active format, column widths).
- Never turn a derived representation into an independent source of truth.
- Use stable application-owned identifiers for rows and columns so reordering
  and diffing preserve identity, selection, and column widths.
- Validate data at input and persistence boundaries: paste, import, and
  `localStorage` reads are all untrusted.
- Resolve an exact target before deletion, overwrite, or another hard-to-recover
  action. Prefer recoverable deletion. Never force-push.
- Keep credentials, tokens, and personal data out of the repository and logs.

## Product interface and accessibility

**`docs/design-system.md` is normative for anything visual.** Read it before
writing or changing UI. It owns the token catalogue, the component layers, the
interaction states, and the copy rules. Two of its rules matter enough to repeat
here:

- Commit to the existing design line. There is always a prettier alternative;
  chasing it is what destroys consistency.
- When no pattern fits, stop and report before inventing one, and report
  pattern breaks you find rather than silently fixing or silently copying them.

- Panes are configured from layout presets, never by free slot assignment. See
  `docs/adr/0006`. Keep each pane's view and sync state visually obvious,
  and preserve the user's context when the layout or a view changes.
- Define layout, hierarchy, controls, loading, empty, error, retry, disabled,
  and destructive states when applicable.
- Dark mode is the reference interface. Implement, screenshot, verify, and
  audit there first, and confirm light before reporting the work as done. When
  a check, a sample, or a decision has to pick one theme, it picks dark.
- Include keyboard navigation, focus order, screen-reader labels, scalable text,
  contrast, reduced motion, and non-color status cues in the same change. The
  grid must be fully operable from the keyboard. This is not follow-up work.
- Reduce cognitive load: keep visible actions manageable, place them near the
  content they affect, avoid deeply nested menus and unnecessary configuration,
  and use progressive disclosure for less common actions.
- Avoid unexpected layout changes and interruptions. A dialog is allowed only
  as the direct result of a command the user issued, and only for a choice a
  menu cannot hold: see `docs/design-system.md` §3.
- Keep visible copy centralized and consistent.
- Author interface geometry, spacing, radii, typography, and breakpoints in
  `rem`, using the shared tokens whenever one exists. Treat pixel-valued browser
  APIs as boundaries and convert their values before storing presentation state.
- Keep expensive work out of render paths. Measure before claiming a performance
  problem.

## Code, comments, and documentation

- Follow the existing formatter, linter, naming, and architectural conventions.
- Prefer clear types, explicit ownership, and simple control flow over
  cleverness.
- Put comments next to non-obvious constraints: intent, provenance, or a subtle
  external rule, not mechanics. Link official documentation when an external
  rule must stay visible to prevent a regression.
- Write every TypeScript comment with `//`, including multi-line ones. Do not
  use `/** */` or `/* */` blocks, and do not write JSDoc annotation tags.
- Never use the Unicode em dash character (U+2014) anywhere in tracked project
  text, including code, comments, copy, documentation, metadata, and tests. Use
  a comma, colon, parentheses, or a sentence break that matches the meaning.
- Use a relative import only for a sibling in the same directory: `./thing` is
  allowed, `../thing` and `./../thing` are not. Reach anything outside the
  current directory through the `@/` alias.
- Update the smallest canonical documentation section when a durable contract
  changes. Do not create empty documentation for possible future use.
- Keep the README easy to scan. Preserve third-party licenses and notices.
- `biome.json` disables three a11y rules for `packages/ui/src/components/**`
  only. Those are vendored shadcn primitives, and the linter cannot see the
  `htmlFor`, role, and handler wiring that consumers supply. The exemption
  covers vendored primitives exclusively: never widen it to Tabelo's own
  components, where those rules are load-bearing.

## Configuration and repository hygiene

- Ignore secrets, local environments, logs, caches, build output, and generated
  artifacts appropriate to the actual stack.
- This project has no environment variables and therefore no `.env.example`. If
  one is ever introduced, document every supported name with a safe placeholder.
- Do not add placeholder automation.

## Tests and validation

- Add or update focused tests for changed behavior, regressions, persistence,
  validation, and critical accessibility.
- Parser and serializer work requires round-trip tests; this is the project's
  highest-value test surface.
- Test observable contracts at stable seams; avoid tests that only mirror
  implementation details or framework behavior.
- Do not add tests that assert exact user-facing copy.
- Do not compare rendered or generated interface text with the same canonical
  copy or product constant used to produce it. That only proves that a value
  equals itself. Canonical copy may locate a control when the test then asserts
  behavior, semantics, or state; data-derived identifiers remain technical
  contracts rather than editorial copy.
- Copy changes, additions, and removals do not require new tests by themselves.
- A pull request containing only copy changes may correctly contain no new or modified tests.
- Tests should validate behavior, semantics, state, accessibility, or technical contracts, not editorial wording.
- Do not add meaningless tests merely to claim that a pull request has test coverage.
- When copy is used to locate an element in a test, prefer stable semantic queries or another appropriate selector rather than asserting the copy itself.
- Every test, fixture, example, and default or demo table holds synthetic data
  only. No real person's name, address, email, username, or account may appear,
  and least of all the maintainer's own: sample content is read, copied, and
  screenshotted far more often than it is reviewed. The person-shaped fixtures
  come from the shared roster in `apps/web/src/core/sample-data.ts`, in the
  order it lists them: `Ingrid` in `Rio`, `Paulo` in `Madrid`, then `Mabel`,
  `Felix`, and `Amora` with their own cities, roles, and ages. Take the first
  one or two for a small fixture and more only when the case needs them, and
  add a person to that file rather than inventing one at the call site. The
  roster carries an age column because numeric-looking values are the case
  most likely to be mishandled: it holds real numbers, because the roster
  declares that type and not because the values look like digits. A fixture
  states a type or has none; it never implies one can be read off the text.
  Public identifiers required for the repository link, the licence
  attribution, or deployment configuration are not test data and stay as they
  are.
- A test asserting a platform-dependent result derives its expectation from the
  host, never from a hard-coded guess about which machine runs it. A keyboard
  legend, path separator, or line ending that is correct on a maintainer's
  laptop and wrong on the pipeline is a broken test, not a broken pipeline.
- Do not require NVDA, JAWS, VoiceOver, or another GUI-only assistive application
  as an acceptance, issue-closure, or pipeline criterion. Those tools are not
  available in the CLI pipeline. Validate the accessibility tree, roles, names,
  states, relationships, keyboard paths, focus behavior, and contrast through
  browser automation. A separately arranged manual session may inform product
  research, but it never blocks delivery.
- Do not assert rendered dimensions or visual equality. A narrow tolerance,
  ratio around one target, `toBeCloseTo`, or paired bounding-box equality is an
  exact geometry assertion in disguise and is equally forbidden. Own visual
  equality through one shared token or component and inspect the rendered result
  during implementation. Automated geometry checks are limited to meaningful
  thresholds and direction changes, such as minimum interaction targets,
  overflow, breakpoints, contrast, and a resize action making a column wider.
- Run the complete browser suite in Chromium, the only supported browser. A
  flow that would once have been repeated for a second engine, such as clipboard
  and download APIs, keyboard focus, persistence, responsive layout, and source
  editor synchronization, is covered once. Do not reintroduce a second project
  to the Playwright configuration.
- Run the smallest relevant check repeatedly until it passes. Only then move to
  the next broader relevant validation, and finish with coverage proportional to
  the risk.
- Report exact skips, blockers, residual risk, and manual gaps.

### Issue tracking for unresolved defects

- When work reveals an error, bug, or warning, first search existing GitHub
  issues to avoid duplicates, then prefer fixing it within the current task.
- Do not create an issue for a defect that is fixed immediately. If a defect
  remains at handoff, create or complete one GitHub issue before reporting it as
  remaining.
- A new or updated issue must contain the observed behavior, expected behavior,
  reproduction steps, affected environment and version or commit, severity,
  dependencies, concrete evidence, validation already attempted, and any known
  workaround or blocker. Apply all applicable repository metadata.
- Missing manual validation alone is not a defect and does not require an issue.

## Artifacts and processes

- Temporary is the default; retention is an explicit exception.
- Remove only temporary files created by the current task. Never delete
  pre-existing user artifacts, fixtures, baselines, or logs.
- Stop servers, watchers, and browsers started by the task. Do not stop the
  user's pre-existing processes.

## Git

- Follow the recorded commit, push, and merge policies above.
- Name every new branch following the branch naming policy above.
- Check status and branch before editing and before the final report.
- Use Conventional Commits in English. One commit per concern, and end the
  subject with its issue number when the commit belongs to one.
- Inspect the diff before committing. Never commit secrets, caches, generated
  logs, temporary artifacts, or unrelated formatting churn.
- If commit or push fails, report the exact failure without claiming success.

## Completion report

Lead with the outcome and include what changed and why, files touched,
validation commands and actual results, warnings and remaining risks, temporary
artifacts kept or removed, commit and push status, and final worktree status.
