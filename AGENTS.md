# Tabelo — Agent Policy

Durable root policy for Tabelo. Follow it for all coding, UI, documentation,
validation, git, and deployment work in this repository. A more specific
`AGENTS.md` inside a subtree overrides this one for that subtree.

> This file documents **patterns and contracts**, not the current file layout.
> Describe responsibilities, not exact file or folder names — names drift, and
> stale structure docs are worse than none.

## Project identity and policy

Stable, one-time decisions. Change an established identifier, license,
visibility, branch policy, versioning model, localization strategy,
landing-page contract, or release policy only through an explicit task that
describes the migration and its downstream effects.

- Project and public name: `Tabelo`
- Description: edit a table visually, as Markdown, or as CSV — always in sync,
  entirely in your browser
- Repository: `martonpaulo/tabelo` (public)
- Public identifiers: workspace app `web`; internal packages `@tabelo/ui`,
  `@tabelo/env`, `@tabelo/config`. All workspace packages are private and are
  never published to a registry
- Landing page: the application itself, at
  `https://martonpaulo.github.io/tabelo/`, built from `apps/web` and published
  to GitHub Pages by CI. There is no separate marketing site
- License: `MIT`, © 2026 Marton Paulo
- Development language: English (code, comments, commits, filenames, tests,
  configuration, developer docs)
- Product copy: English only, single locale, no i18n framework. Dates and
  numbers inside table cells are opaque text and are never reformatted
- Branch policy: work only on `main`; never create, switch, or rename branches
- Commit policy: commit automatically on task completion, one concern per commit
- Push policy: push to `origin/main` automatically after committing
- Product versioning: **unversioned**. The deployed site is always the current
  version. No version in the UI, no tags, no `CHANGELOG.md`. The `0.0.0` in
  workspace manifests is a package-manager placeholder, not a product version —
  never bump it as if it were a release
- Delete branches after merge: enabled
- Release, signing, and secret storage: **not applicable**. Nothing is
  downloaded, installed, or signed. Deployment is GitHub Pages via GitHub
  Actions using the built-in `GITHUB_TOKEN`; this project stores no secrets

## Product

Tabelo is a browser-based table editor. The same table is always available
through three synchronized representations: a visual grid, Markdown source, and
CSV source. Two panels: the grid is the primary editing surface, and the text
panel shows either Markdown or CSV.

**Simple by design.** No accounts, no backend, no cloud sync, no collaboration,
no analytics, no telemetry. No formulas, calculations, multiple sheets, charts,
or macros. The product is a focused editor, not a spreadsheet — do not import
spreadsheet density or spreadsheet features. New capability is a deliberate
product change, not a default.

The product priority order is fixed:

1. Data preservation — never lose a user's table content silently
2. Predictable synchronization between the three representations
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
  row 1 down. CSV export offers an "include header row" option — that is an
  output preference, never document state.
- **Markdown serialization is lossless.** Escape `|` as `\|` and newlines as
  `<br>`; the parser reverses both. A value must survive
  CSV → Markdown → CSV byte-exact. Never flatten or drop content to make
  Markdown look cleaner.
- **The grid holds the last valid parse and stays editable.** When text does not
  parse, keep displaying the last successful parse, surface the error inline in
  the text panel, and leave the grid fully editable. A grid edit then wins and
  regenerates the text; the superseded draft must remain recoverable through
  undo and is never silently destroyed.
- **Undo is layered.** Inside the text panel, undo is the editor's own
  keystroke-level history. When that history is exhausted, or when focus is on
  the grid, undo walks a single document timeline in which each committed parse
  and each grid operation is one step.
- **Column alignment is document state.** Alignment is Markdown-specific
  metadata but belongs to the document, so it survives time spent in CSV mode
  and round-trips back into Markdown unchanged.
- **Target scale is roughly 200 rows.** Do not add virtualization, Web Workers,
  or IndexedDB. Oversized input must degrade gracefully with a clear message,
  never by freezing the tab.

## Frozen technical direction

Use the scaffolded versions unless a task explicitly requires an upgrade.

- React 19, TypeScript in strict mode, Vite
- TanStack Router with file-based routing, SPA only
- Tailwind CSS v4
- shadcn/ui on Base UI primitives, in `@tabelo/ui`
- CodeMirror 6 for the Markdown and CSV source panel
- A hand-built DOM grid with no grid library — see `docs/adr/0004`
- Zustand for the document store
- Zod for persisted, imported, and pasted data validation
- Papa Parse for CSV parsing and serialization
- Biome for formatting and linting
- Vitest for unit tests. There is no end-to-end suite yet; when one is added,
  use Playwright and cover the cross-panel flows in the success criteria
- pnpm workspaces
- `vite-plugin-pwa` in `generateSW` mode for offline capability

Do not add without an explicit, demonstrated need:

- a backend, server runtime, database, ORM, or authentication
- a spreadsheet or data-grid component (Handsontable, AG Grid, Glide, Monaco)
- a headless table or drag-and-drop library — both were considered and rejected
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

- **Table document** — the internal representation. Columns, rows, cell values,
  stable identifiers, alignment, schema version. Plain data, no framework
  imports.
- **Table operations** — pure functions over the document: insert, delete,
  duplicate, move, resize, set cell, edit header, clear range. No React, no DOM.
- **Format parsers and serializers** — Markdown and CSV, each a pair behind one
  shared `TableFormat` contract so a further format can be added without a
  generic plugin system. Format-specific escaping rules live here and nowhere
  else.
- **Synchronization** — owns the text draft buffer, debouncing, parse
  scheduling, structural diffing that preserves identifiers, and loop
  prevention. Every editor transaction carries an origin annotation;
  sync-originated transactions never re-trigger a parse.
- **History** — the document timeline and its interaction with the text editor's
  local history.
- **Persistence** — versioned `localStorage` document with validation on read
  and an explicit migration chain. A corrupt or unknown-version payload falls
  back safely rather than throwing away user data without warning.
- **Clipboard** — format sniffing for paste and payload construction for
  copy/cut, independent of both the grid and the text panel.
- **Visual grid** — selection, focus, keyboard model, and rendering. Presentation
  only; it calls table operations rather than mutating the document itself.

Cell values are opaque strings. Tabelo does not infer types, coerce numbers, or
reformat content.

## Build and validate

Prefer the smallest relevant check.

- `pnpm dev` — run the app locally on port 3001
- `pnpm build` — production build for every workspace
- `pnpm check-types` — TypeScript across the workspace
- `pnpm check` — Biome format and lint with `--write`

Never claim a check passed unless it ran successfully.

## Agent instruction files

- `AGENTS.md` is the source of truth.
- Keep a root `CLAUDE.md` symbolic link pointing to `AGENTS.md`.
- Add folder-specific `AGENTS.md` files only when a subtree genuinely requires
  different rules, each with a sibling `CLAUDE.md` symbolic link.
- Do not duplicate the same rules across instruction files.

## Agent skill paths

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
  something by hand that one of those already does is a defect, not craft — and
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
- Validate data at input and persistence boundaries — paste, import, and
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
- When no pattern fits, stop and report before inventing one — and report
  pattern breaks you find rather than silently fixing or silently copying them.

- Two-panel layout; the grid is primary. Keep the active format and editing
  state visually obvious, and preserve the user's context when switching.
- Define layout, hierarchy, controls, loading, empty, error, retry, disabled,
  and destructive states when applicable.
- Include keyboard navigation, focus order, screen-reader labels, scalable text,
  contrast, reduced motion, and non-color status cues in the same change. The
  grid must be fully operable from the keyboard — this is not follow-up work.
- Reduce cognitive load: keep visible actions manageable, place them near the
  content they affect, avoid deeply nested menus and unnecessary configuration,
  and use progressive disclosure for less common actions.
- Avoid unexpected layout changes, dialogs, and interruptions.
- Keep visible copy centralized and consistent.
- Keep expensive work out of render paths. Measure before claiming a performance
  problem.

## Code, comments, and documentation

- Follow the existing formatter, linter, naming, and architectural conventions.
- Prefer clear types, explicit ownership, and simple control flow over
  cleverness.
- Put comments next to non-obvious constraints — intent, provenance, or a subtle
  external rule, not mechanics. Link official documentation when an external
  rule must stay visible to prevent a regression.
- Write every TypeScript comment with `//`, including multi-line ones. Do not
  use `/** */` or `/* */` blocks, and do not write JSDoc annotation tags.
- Use a relative import only for a sibling in the same directory: `./thing` is
  allowed, `../thing` and `./../thing` are not. Reach anything outside the
  current directory through the `@/` alias.
- Update the smallest canonical documentation section when a durable contract
  changes. Do not create empty documentation for possible future use.
- Keep the README easy to scan. Preserve third-party licenses and notices.
- `biome.json` disables three a11y rules for `packages/ui/src/components/**`
  only. Those are vendored shadcn primitives, and the linter cannot see the
  `htmlFor`, role, and handler wiring that consumers supply. The exemption
  covers vendored primitives exclusively — never widen it to Tabelo's own
  components, where those rules are load-bearing.

## Configuration and repository hygiene

- Ignore secrets, local environments, logs, caches, build output, and generated
  artifacts appropriate to the actual stack.
- This project has no environment variables and therefore no `.env.example`. If
  one is ever introduced, document every supported name with a safe placeholder.
- Do not add placeholder automation.

## Tests and validation

- Add or update focused tests for changed behavior, regressions, persistence,
  migrations, validation, and critical accessibility.
- Parser and serializer work requires round-trip tests; this is the project's
  highest-value test surface.
- Test observable contracts at stable seams; avoid tests that only mirror
  implementation details or framework behavior.
- Run the smallest relevant check during iteration, then one broader validation
  proportional to risk.
- Report exact skips, blockers, residual risk, and manual gaps.

## Artifacts and processes

- Temporary is the default; retention is an explicit exception.
- Remove only temporary files created by the current task. Never delete
  pre-existing user artifacts, fixtures, baselines, or logs.
- Stop servers, watchers, and browsers started by the task. Do not stop the
  user's pre-existing processes.

## Git

- Follow the recorded branch, commit, and push policies above.
- Check status and branch before editing and before the final report.
- Use Conventional Commits in English. One commit per concern.
- Inspect the diff before committing. Never commit secrets, caches, generated
  logs, temporary artifacts, or unrelated formatting churn.
- If commit or push fails, report the exact failure without claiming success.

## Completion report

Lead with the outcome and include what changed and why, files touched,
validation commands and actual results, warnings and remaining risks, temporary
artifacts kept or removed, commit and push status, and final worktree status.
