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
- Public identifiers: workspace app `web`; internal packages `@tabelo/ui`,
  `@tabelo/env`, `@tabelo/config`. All workspace packages are private and are
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
  numbers inside table cells are opaque text and are never reformatted
- Commit policy: commit automatically on task completion, one concern per commit
- Push policy: push to `origin/main` automatically after committing
- Product versioning: **unversioned**. The deployed site is always the current
  version. No version number, tag, or release name ever appears anywhere in
  the product. The `0.0.0` in workspace manifests is a package-manager
  placeholder, not a product version, and is never bumped as if it were a
  release. Exception, decided in #94: the app may show the current build's
  timestamp and a short, build-time-generated list of recent user-facing
  changes. That list is generated from commit history, never hand-authored,
  so there is still no `CHANGELOG.md`, no tags, and no release process
- Branch naming: `type/agent/issue-number/short-description`. `type` is one of
  `feature`, `hotfix`, `fix`, `chore`, `docs`, `refactor`, `test`. `agent` is
  the acting coding agent (for example `claude`, `codex`), or `perso` for
  branches created directly by the maintainer. `issue-number` is the GitHub
  issue number as `issue-NNN`, zero-padded to three digits. `short-description`
  is a kebab-case summary. Examples:
  `hotfix/codex/issue-083/gutter-alignment-across-pane-zoom-levels`,
  `feature/claude/issue-024/two-level-keyboard-navigation`
- Delete branches after merge: enabled
- Release, signing, and secret storage: **not applicable**. Nothing is
  downloaded, installed, or signed. Deployment is GitHub Pages via GitHub
  Actions using the built-in `GITHUB_TOKEN`; this project stores no secrets

## Product

Tabelo is a browser-based table editor. One table document is shown through
several synchronized views: a visual grid, Markdown, CSV, TSV, HTML source,
Jira syntax, JSON, and a rendered preview, arranged in a configurable workspace
of one to four panes.

**Simple by design.** No accounts, no backend, no cloud sync, no collaboration,
no analytics, no telemetry. No formulas, calculations, multiple sheets, charts,
or macros. The product is a focused editor, not a spreadsheet: do not import
spreadsheet density or spreadsheet features. New capability is a deliberate
product change, not a default.

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
  `hasHeader` document state. Header detection is an **import-time** decision
  only: when pasting or importing, a heuristic decides whether row 1 becomes the
  header, and an undoable correction generates `Column 1..N` headers and pushes
  row 1 down. CSV export offers an "include header row" option. That is an
  output preference, never document state.
- **Markdown serialization is lossless.** Escape `|` as `\|` and newlines as
  `<br>`; the parser reverses both. A value must survive
  CSV → Markdown → CSV byte-exact. Never flatten or drop content to make
  Markdown look cleaner.
- **Every other view holds the last valid parse and stays editable.** When a
  draft does not parse, keep displaying the last successful parse everywhere
  else, surface the error in the owning pane, and leave the grid fully editable.
  A grid edit then wins and regenerates the text; the superseded draft must
  remain recoverable through undo and is never silently destroyed.
- **Undo is layered.** Inside a source view, undo is the editor's own
  keystroke-level history. When that history is exhausted, or when focus is on
  the grid, undo walks a single document timeline in which each committed parse
  and each grid operation is one step.
- **Column alignment is document state.** Alignment is Markdown- and
  HTML-specific metadata but belongs to the document, so it survives time spent
  in CSV, TSV, or Jira. None of those formats can express it, and it round-trips
  back unchanged.
- **Target scale is roughly 200 rows.** Do not add virtualization, Web Workers,
  or IndexedDB. Oversized input must degrade gracefully with a clear message,
  never by freezing the tab.
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
- TanStack Router with file-based routing, SPA only
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
  cannot reach. Chromium and Firefox both run locally and in CI
- pnpm workspaces
- `vite-plugin-pwa` in `generateSW` mode for offline capability

Do not add without an explicit, demonstrated need:

- a backend, server runtime, database, ORM, or authentication
- a spreadsheet or data-grid component (Handsontable, AG Grid, Glide, Monaco)
- a headless table or drag-and-drop library: both were considered and rejected
  in `docs/adr/0004`; reopening that needs a reason, not a preference
- a CRDT or collaboration layer
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
- **Persistence**: one current, versioned `localStorage` schema with validation
  on read and no migration chain. A corrupt or unsupported-version payload falls
  back safely and is never coerced into the current shape. This current-schema
  policy does not narrow the valid syntax accepted by import codecs.
- **Clipboard**: format sniffing for paste and payload construction for
  copy/cut, independent of both the grid and the text panel.
- **Visual grid**: selection, focus, keyboard model, and rendering. Presentation
  only; it calls table operations rather than mutating the document itself.

Cell values are opaque strings. Tabelo does not infer types, coerce numbers, or
reformat content.

## Build and validate

Prefer the smallest relevant check.

- `pnpm dev`: run the app locally on port 3001
- `pnpm build`: production build for every workspace
- `pnpm check-types`: TypeScript across the workspace
- `pnpm check`: Biome format and lint with `--write`
- `pnpm test`: unit tests
- `pnpm test:e2e`: the Playwright suite in Chromium and Firefox. It builds and
  serves the app itself, so it needs no running dev server. First run only:
  `pnpm test:e2e:install`. Narrow it with `--project=chromium`, a spec name, or
  `-g "<title>"` while iterating, and run it whole before reporting

CI and Pages deployment are skipped only when every changed path is known not
to affect the built site or its pipeline: root Markdown files, `docs/**`,
`LICENSE`, and `.scratch/**`. Any other path runs the full pipeline;
`apps/web/src/product.ts` is a build input even though it contains product copy.

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

## Agent skill paths

- Repository-local skills: `.agents/skills/`. These are the complete skill
  source for Tabelo work in local and cloud agents; do not require or reference
  a machine-local skills checkout.
- GitHub issue implementation starts with
  `.agents/skills/implement-issue/SKILL.md`, which routes to the smallest
  applicable local specialist for debugging, domain modelling, module design,
  research, prototypes, UI contracts, codec contracts, or conflict resolution.
- Domain glossary: `CONTEXT.md`
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
- Resolve product copy from its canonical owner or through semantic IDs in
  tests. Do not repeat literal UI wording in selectors or assertions.
- Do not assert exact rendered dimensions. Test token ownership, shared values,
  relative changes, supported ranges, and minimum interaction targets instead.
- Run the complete browser suite in Chromium. Reserve Firefox for flows that
  are genuinely sensitive to browser-engine differences, such as clipboard and
  download APIs, keyboard focus, persistence, responsive layout, and source
  editor synchronization. Keep that selection centralized in the Playwright
  configuration instead of duplicating the full suite across browsers.
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

- Follow the recorded commit and push policies above.
- Name every new branch following the branch naming policy above.
- Check status and branch before editing and before the final report.
- Use Conventional Commits in English. One commit per concern.
- Inspect the diff before committing. Never commit secrets, caches, generated
  logs, temporary artifacts, or unrelated formatting churn.
- If commit or push fails, report the exact failure without claiming success.

## Completion report

Lead with the outcome and include what changed and why, files touched,
validation commands and actual results, warnings and remaining risks, temporary
artifacts kept or removed, commit and push status, and final worktree status.
