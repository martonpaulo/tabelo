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

- Display name: `Tabelo`
- Code name: `Tabelo`
- Slug: `tabelo`
- Identifier name: `tabelo`
- Description: edit one table visually or through synchronized text formats, entirely in your browser
- Repository: `martonpaulo/tabelo` (public)
- Public identifiers: workspace app `web`; optional local helper
  `@tabelo/agent-bridge`; internal packages `@tabelo/ui`, `@tabelo/config`, and
  `@tabelo/agent-protocol` (#405). All workspace packages are private and are
  never published to a registry
- Landing page: the application itself, at
  `https://tabelo.martonpaulo.com/`, built from `apps/web` and published to
  GitHub Pages by CI on its own subdomain (`apps/web/public/CNAME`). There is
  no separate marketing site. `/` is the canonical production path, in local
  development as well; any deeper application path redirects to it
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
- Branch workflow: **commit directly to `main`.** Decided by the owner on
  2026-09-18, replacing the branch-and-pull-request trial that began on
  2026-09-17 (martonpaulo/skill-deck#283): the review round trip cost more time
  than it caught. The `main: pull request and green Check` ruleset is disabled,
  not deleted. Work on several issues at once happens in local worktrees on
  short-lived branches named under the scheme below; each is rebased onto
  `main` and pushed to `main` directly, never through a pull request
- Commit policy: commit automatically on task completion, one concern per
  commit, landing on `main` as the branch workflow above describes
- Push policy: push `main` automatically after committing. No pull request is
  opened, and no automated reviewer is waited for
- Product versioning: **unversioned**. The deployed site is always the current
  version. No version number, tag, or release name ever appears anywhere in
  the product. The `0.0.0` in workspace manifests is a package-manager
  placeholder, not a product version, and is never bumped as if it were a
  release. There is no `CHANGELOG.md`, no tags, and no release process
- Branch naming: [Conventional Branch](https://conventionalbranch.org/),
  `type/<issue numbers>-short-description`. `type` is one of `feature`, `fix`,
  `hotfix`, `chore`, `docs`, `refactor`, `test`, `release`. Issue numbers are
  every issue the branch closes, sorted, without leading zeros; omit them when
  no issue exists. `short-description` is two to four kebab-case words.
  Examples: `fix/83-gutter-alignment-across-zoom`,
  `feature/24-two-level-keyboard-navigation`, `chore/align-repository-layout`.
  Never rename a pushed branch with an open pull request: GitHub closes it.
- Commit subject: a commit made for an issue ends with `(#<issue number>)`, for
  example `feat: add the export button (#54)`. It is the issue number, never
  the pull request's, and a commit belonging to no issue carries no suffix
- Merge policy: **merge commit**, `gh pr merge <number> --merge
  --delete-branch`, so every branch commit reaches `main`. Squash was the
  policy until 2026-09-17, when the owner restored the preference for keeping
  branch commits (martonpaulo/skill-deck#277). The repository's GitHub
  settings allow merge commits only, so the setting and this policy cannot
  drift apart
- Pull request title: a Conventional Commits subject ending in the issue
  numbers it closes, for example `feat(grid): add the export button (#54)` or
  `fix: normalize carriage returns (#54, #61)`. It is a separate rule from the
  commit subject above because the title becomes the merge commit's subject on
  `main`; the two share one grammar so the history reads the same either way. No workflow enforces it: the
  `pr-conventions` check was removed on 2026-09-12 because it failed every bot
  pull request permanently while this repository accepts direct commits to
  `main`. The title's issue set must still match the body's `Closes #<n>` lines
  exactly. One concern per commit still applies on the branch, where it is what
  makes a review readable
- Delete branches after merge: enabled
- Release, signing, and secret storage: **not applicable**. Nothing is
  downloaded, installed, or signed. Deployment is GitHub Pages via GitHub
  Actions using the built-in `GITHUB_TOKEN`; this project stores no secrets
- Skills baseline revision: `0bc967f285693b1589401d00c7fd5f1e1b3e460a`
- Skills baseline applied: `2026-09-18`

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

- **An external agent uses application commands, never a second document**
  (#405; library scope extended by the owner, 2026-09-24). An explicitly paired
  local connection reaches one tab and its browser table library. It may list,
  create, open and rename tables, never delete them; document edits reach only
  the active canonical table, whether or not a grid is visible. Switching tables
  preserves pairing but advances revisions. The browser validates every command against live revisions and input
  state, applies each document batch atomically, and uses the normal timeline.
  Unfinished input is never displaced by an agent; stale requests are refused.
  User undo/redo pauses agent writes. Session credentials and receipts stay in
  memory. Ordinary editing needs neither an agent nor the local helper.

- **A browser holds a library of tables, at most one of them active** (#403).
  Every rule below is about the active table: it is the one document the views
  project, and the only one an edit, a draft, or the history can reach. The
  others are storage until one is opened. There is no limit on how many a
  browser keeps; the app says so once the list stops reading comfortably in
  one menu, and the menu scrolls from there. The library may hold no table:
  deleting the last one leaves nothing active and shows the welcome surface,
  no blank table is regenerated, and content arriving there gets a new table
  first (decided on #466).
- **Every table has exactly one header row.** There is no headerless mode and no
  `hasHeader` document state. Header presence is an **import-time** fact: formats
  that identify a header declare it, and CSV, TSV, or plain text asks whether row
  1 is the header before replacing the document. Choosing data creates empty
  headers; nothing infers from cell values. Paste into an existing selection is
  a matrix write and never asks. Every exported CSV prints the header row: a
  file without it no longer describes the table it came from, so no option,
  menu, shortcut, or preference produces one. A format may still declare output
  options, which are output preferences and never document state. Deleting the
  header row is allowed and preserves the invariant rather than breaking it: the
  first surviving data row is promoted into the header in the same step, so the
  document is never headerless, not even transiently.
- **Escaping is reversible in every codec that owns it.** Markdown escapes `|`
  as `\|` and newlines as `&#10;` (or `<br>` when the reader chooses it, #397), and encodes meaningful boundary whitespace
  before adding readable alignment padding. Jira escapes pipes, newlines,
  backslashes, and literal ampersands. Both also escape an inline-syntax marker
  exactly where their own grammar could read it as syntax, so plain text keeps
  its bytes unless it holds something that parses (`docs/adr/0011`). Each
  parser reverses only the grammar its serializer emits, exactly once and
  without recursive decoding. A value must survive a round trip through either
  codec byte-exact. Never flatten or drop content to make serialized text look
  cleaner.
- **Every other view holds the last valid parse and stays editable.** When a
  draft does not parse, keep displaying the last successful parse everywhere
  else, surface the error in the owning pane, and leave the grid fully editable.
  A grid edit then wins and regenerates the text; the superseded draft must
  remain recoverable through undo and is never silently destroyed.
- **Undo is layered.** Inside a source view, undo is the editor's own
  keystroke-level history. When that history is exhausted, or when focus is on
  the grid, undo walks a single document timeline in which each committed parse
  and each grid operation is one step.
- **A cell's type is carried, never derived.** A cell holds a string (plain or
  with inline content, `docs/adr/0011`), a number, a boolean, or null, and a
  column declares the type it expects for editing. The
  expectation guides entry, and changing it converts the column's cells by the
  user's choice (#392); one column may still hold values that disagree with
  it. A value becomes typed only because a typed source
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
- **Source text is free; structural assistance is narrow** (#294). A source
  view is a text editor first: it never protects a range, rejects a keystroke,
  normalizes a draft in the background, or keeps a hidden canonical source. A
  named structural-assistance feature may rewrite source automatically only
  when it declares its syntax and trigger, derives the change from the current
  draft alone, changes the smallest deterministic range, lands the change in
  the same editor transaction and local undo step as the user edit that
  triggered it, leaves an invalid draft untouched and recoverable, and offers
  a temporary escape mode that makes the buffer plain text again. It is editor
  behaviour, never document state, persistence state, or a second
  representation.
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
- **New table adds a table and replaces nothing** (#403). It creates a table
  beside the others in the library and opens it on the welcome surface, so it
  never asks: no document or draft is replaced. Going back from that welcome
  surface while the new table is still empty deletes it and reopens the table
  the user came from.

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
  (the optional, paired loopback MCP helper approved on #405 is the narrow
  exception; it introduces no hosted backend, account, or table storage)
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
- a second implementation language, including WebAssembly. Measured and
  declined in `docs/adr/0009`: on its measured workload, the tuned TypeScript
  serializer was faster than the floor cost of getting the table across the
  Wasm boundary at all
- Turborepo or Nx

## Architecture boundaries

Keep these concerns independent. The dependency direction points inward: UI may
depend on the core, never the reverse.

Four of these boundaries are executable rather than prose. `biome.jsonc` scopes
`style/noRestrictedImports` to the owning subtree so that the core and the
codecs cannot import React or a UI package, the view registry cannot import
CodeMirror or a UI component, and `packages/ui` cannot import application code.
Each restriction carries the contract it protects as its diagnostic message.
That set is deliberately small: it covers the boundaries whose violation is a
design defect rather than a style slip, and every other boundary below stays
prose. The rules match import specifiers, which is complete here only because
the `@/` alias rule under `## Code, comments, and documentation` leaves no
parent-relative escape; they detect neither cycles nor orphan modules.

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
- **Synchronization**: owns the text draft buffer, the synchronous parse of
  every editor transaction and the grace period before an error shows,
  structural diffing that preserves identifiers, and loop prevention. The
  debounced autosave is a separate concern, not a parse delay. Every editor
  transaction carries an origin annotation; sync-originated transactions never
  re-trigger a parse.
- **History**: the document timeline and its interaction with the text editor's
  local history.
- **Persistence**: one current, versioned `localStorage` schema per stored
  payload: one key per table, one index naming the tables and the active one,
  and one key for the preferences. A save writes the active table alone, so
  its cost does not grow with the library (#403). A payload that fails to
  validate is preserved raw and reported, never coerced into the current
  shape, and a version newer than the current one stays unreadable rather
  than being guessed at. This current-schema policy does not narrow the valid
  syntax accepted by import codecs.
  Every historical schema, its migration step and its fixture were deleted on
  2026-09-20 by the owner's decision: the product is unreleased with one user,
  so nothing existed to carry forward, and the versions restarted at 1. From
  here on a change to a stored shape ships with the forward-only step that
  reads the previous one, validates its result with Zod, and carries a stored
  fixture of the payload it migrates. Shipping a schema change without it is
  data loss caused by the product, which priority 1 forbids.
- **Clipboard**: format sniffing for paste and payload construction for
  copy/cut, independent of both the grid and the text panel. It owns one
  private payload schema, versioned separately from persistence because the two
  have different owners and compatibility windows, and validated at paste like
  any other untrusted input. It carries what the interoperable flavours cannot
  spell and never overrides what they visibly say.
- **Visual grid**: rendering, focus, and pointer and keyboard wiring.
  Presentation only; it calls table operations rather than mutating the
  document itself. Its interaction model (selection coordinates, jump
  navigation, matching cells) is pure, so it lives with the core under the
  core's framework-free rule and is tested there.
- **External-agent integration**: one shared wire/schema contract, a local
  transport-only helper, and a browser command adapter. The helper does not
  import application state or own table rules. UI and agent commands reuse
  the same domain operations and view-availability rules. A public command
  needs an explicit outcome; returning from a void UI callback is not evidence
  that it changed anything. See `docs/agent-integration.md` for the canonical
  command-authoring procedure, schema ownership, and verification requirements.
- **Source and preview views**: the lazily loaded source editor, its language
  and structural-assistance adapters, and the rendered preview. They read the
  view registry and the codecs and never own format syntax; every editor
  transaction carries the origin annotation synchronization requires.

A cell value is a string, a number, a boolean, or null, and its type is always
carried rather than derived: a typed source stated it or the user chose it.
Tabelo does not infer a type from text, coerce numbers, or reformat content.
One core function projects a value to text, and every view, codec, and export
reads a cell through it. See `docs/adr/0008`. A string may carry normalized
inline content (marks, links, images), which is carried the same way and never
derived from text; that projection reads its visible text. See `docs/adr/0011`.

## Build and validate

`pnpm validate` is the full gate before a commit: `pnpm check`,
`pnpm check:dead-code`, `pnpm check-types` and `pnpm test`, in that order. A
change is not done while `pnpm check`, `pnpm check-types`, or `pnpm test` fails
on the exact current head. Add `pnpm test:e2e` when the change crosses a UI
boundary. While iterating, prefer the smallest relevant check.

- `pnpm dev`: run the app locally. The dev and preview ports are derived from
  the worktree path so parallel checkouts cannot serve or test each other's
  build; `TABELO_DEV_PORT` and `TABELO_PREVIEW_PORT` override them, and
  `.claude/launch.json` is generated from the same value on install
- `pnpm build`: production build for every workspace
- `pnpm check-types`: TypeScript across the workspace
- `pnpm check`: Biome format and lint with `--write`
- `pnpm bench`: the performance harness, on fixed synthetic tables at the
  target scale and one step past it. It prints numbers and never gates:
  there is no threshold and no CI job. `docs/performance.md` owns the
  method, the standing baseline, and the register of suspicions already
  answered
- `pnpm check:dead-code`: Knip, reporting unused files, exports, dependencies,
  and catalog entries. It needs an installed workspace, because without
  `node_modules` it cannot load the Vite, Vitest, and Playwright configuration
  and every test file turns into a false positive. It is a required gate in
  the Check job, running straight after the frozen install: run it locally when
  removing code or changing a manifest, before CI does
- `pnpm test`: the complete unit gate, Vitest for the web app and Node's test
  runner for the local helper. `pnpm test:unit` runs ordinary unit
  files with the default timeout, and `pnpm test:property` runs the generated
  invariant files with their explicit budget. `pnpm test:watch` re-runs on
  change. `docs/testing.md` owns the suite boundaries and measured baseline
- `pnpm test:e2e`: the Playwright suite in Chromium. It builds and serves the
  app itself, so it needs no running dev server. First run only:
  `pnpm test:e2e:install`. Iterate with `pnpm test:e2e:changed` after an edit
  and `pnpm test:e2e:failed` after a fix, or narrow with a spec name or
  `-g "<title>"`. Run the specs a change can affect, not the whole suite: CI
  runs the full Chromium suite on every push to `main`, and a local full run
  is reserved for a change whose reach a focused run cannot bound, such as
  the synchronization or history core (owner decision, 2026-09-18).
  `pnpm test:e2e:serve` keeps a warm preview server across those rounds; each
  round rebuilds first when a build input changed since the last build and
  skips the build after a spec-only edit (#436)
- Before a focused browser run, follow `docs/testing.md`
  `## Running browser specs locally`: list the selection first, never add a
  standalone `--` after `pnpm test:e2e`, interrupt a run that announces more
  tests than intended, and keep `TABELO_E2E_WORKERS=1` while another checkout
  runs its suite

CI selects browser coverage from the changed paths, and Deploy publishes only
when the built site can differ. Documentation and agent guidance need no
browser run and deploy nothing. `docs/testing.md` `## CI selection` owns the
rules for every event, and `scripts/classify-changes.sh` applies them.

Never claim a check passed unless it ran successfully.

A behaviour that crosses a UI boundary belongs in the browser suite, not only
in a unit test. Keep it behavioural: stable roles and labels, no arbitrary
sleeps, no pixel snapshots, and storage isolated per test.

## Agent instruction files

- `AGENTS.md` is the source of truth. Every other entrypoint is a link to it,
  never a copy: a copy drifts, and two files claiming to be the policy is the
  failure this rule prevents.
- Keep a root `CLAUDE.md` symbolic link pointing to `AGENTS.md`. Codex,
  Antigravity CLI and Gemini CLI read `AGENTS.md` directly and need no bridge
  of their own: the `GEMINI.md` link and the `.gemini/rules/` entrypoint this
  section once required are gone, and the rule follows the repository rather
  than describing files nobody kept (owner, 2026-09-20).
- Add folder-specific `AGENTS.md` files only when a subtree genuinely requires
  different rules, each with a sibling `CLAUDE.md` symbolic link.
- Do not duplicate the same rules across instruction files. A scoped file holds
  only what differs in its subtree and routes to the canonical owner for the
  rest; long references live in `docs/` with a stated trigger to read them.
- Scoped files: `apps/agent-bridge/AGENTS.md` (the local MCP helper) and
  `packages/agent-protocol/AGENTS.md` (the shared wire contract). A session
  started at the root does not necessarily load them, so read the applicable
  one before editing under its path. This root file governs everything else,
  including `apps/web`.
- `AGENTS.md` is protected by section, not as a file. `## Project identity and
  policy` is governance and never moves under an executor. Every other section
  documents this code, so a change that makes a recorded rule untrue updates it
  in the same change. `## Domain rules`, `## Frozen technical direction`, and
  `## Architecture boundaries` are where this repository keeps the patterns a
  change is most likely to break: establishing a new one stops and asks first.

## Skills

Skills this repository owns, all under `.agents/skills/`. These are the
complete skill source for Tabelo work in local and cloud agents; do not require
or reference a machine-local skills checkout. Keep one line each: what it owns,
when it applies, what it defers to. Remove an entry when its skill is gone, and
add one when a new skill is written.

This repository owns no issue-implementation skill of its own. Driving a named
issue number from scope contract to pull request is the general workflow's job.
Its part here is to route the specialist work to the skills below and to obey
this file; the skills below own the parts they name.

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
Pull request review is not in this list either. It belongs to the general
`issue-review` workflow, invoked by the maintainer. GitHub Copilot review is
not a second reviewer here: its repository ruleset is disabled, and two reviewers claiming one job is the defect
the precedence rule below exists to prevent.

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

## Agent skill paths

- Product definition: `docs/product.md`
- Domain glossary: `CONTEXT.md`
- Sample people for fixtures, examples, and manual checks:
  `apps/web/src/core/sample-data.ts`
- Performance method, baseline, and answered suspicions: `docs/performance.md`
- Testing strategy, execution budgets, and baseline: `docs/testing.md`
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
- A consequential decision is recorded in its canonical document, with the
  deciding issue cited beside the rule ("Decided on #N"), and indexed once in
  `docs/product.md` `## Decision index`. No issue serves as a decision register:
  an issue is where a decision is argued, the document is where it lives.
- Be direct and evidence-based. State assumptions, uncertainty, risks, and
  blockers. Ask only when a material decision cannot be discovered safely.
- Do not turn analysis, research, or a read-only audit into implementation
  without authorization.
- When a needed decision is not written in the issue, comment exactly what is
  missing, apply `status: needs-decision`, and stop cleanly instead of guessing.

## Long-running operations

Tabelo's slowest commands are the Playwright suite and a full workspace build.
Both are slow while working, which is what makes elapsed time a bad signal here.

- Wait on an observable condition, not an arbitrary sleep. Use the client's
  bounded yield, timeout, or status mechanism.
- Distinguish slow but progressing work from a stall using new output, state
  changes, resource activity, the known duration of the current phase, or a
  tool-reported deadline. Elapsed time alone is not evidence of a stall.
- Inspect the current output and state before interrupting, retrying, or
  changing approach. A Playwright run that is quiet between specs has not
  hung.
- Interrupt only when there is evidence of no useful progress, a deadline has
  expired, or the continued cost or risk is no longer justified. A focused run
  that announces a materially larger test count than intended is its own
  interrupt condition: see `docs/testing.md`.
- After an interruption, say what state or output was preserved, diagnose the
  likely cause, and choose a narrower retry, a different tool, a smaller unit
  of work, or an explicit blocker. Never rerun the same unchanged failure.
- Do not add a polling service, background job, or timer merely to satisfy this
  rule.

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

### All-view applicability audit

Whenever a bug, feature, improvement, or direct fix names or changes one or
more views, audit every registered view before scope is settled: enumerate
them from `listViews()`, never from memory, and give each one outcome with a
reason. The audit authorizes analysis, not implementation, and an explicit
limit from the user binds. `docs/view-applicability-audit.md` owns the full
procedure and where its evidence goes; read it before capturing, planning,
reviewing, or implementing such work.

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

**`docs/design-system.md` is normative for anything visual.** It is the entry
point: the larger sections live in parts under `docs/design-system/`, and the
entry point lists them. Read it before writing or changing UI. Together they
own the token catalogue, the component layers, the interaction states, and the
copy rules. Two of its rules matter enough to repeat
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
- Dark is the only interface. There is no light palette and no theme
  preference: see `docs/adr/0010`. Implement, screenshot, verify, and audit
  there, and do not add a second palette, a `prefers-color-scheme` branch, or a
  `data-theme` selector back. Forced-colour support is separate and stays.
- Include keyboard navigation, focus order, screen-reader labels, scalable text,
  contrast, reduced motion, and non-color status cues in the same change. The
  grid must be fully operable from the keyboard. This is not follow-up work.
- Reduce cognitive load: keep visible actions manageable, place them near the
  content they affect, avoid deeply nested menus and unnecessary configuration,
  and use progressive disclosure for less common actions.
- Avoid unexpected layout changes and interruptions. A dialog is allowed only
  as the direct result of a command the user issued, and only for a choice a
  menu cannot hold: see `docs/design-system/3-components.md`.
- Keep visible copy centralized and consistent.
- Author interface geometry, spacing, radii, typography, and breakpoints in
  `rem`, using the shared tokens whenever one exists. Treat pixel-valued browser
  APIs as boundaries and convert their values before storing presentation state.
- Keep expensive work out of render paths. Measure before claiming a performance
  problem: `pnpm bench` is the instrument and `docs/performance.md` is where
  the numbers and the already-answered suspicions live. Read its register
  before investigating a suspicion, and add an entry after measuring one.

## Code, comments, and documentation

When changing a capability the external agent can reach, follow the command
and read contracts in `docs/agent-integration.md` in the same change: it owns
exposure, the single schema, explicit outcomes, reuse of the existing rule
owner from both UI and agent entrypoints, and compact reads.

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
- `biome.jsonc` disables three a11y rules for `packages/ui/src/components/**`
  only. Those are vendored shadcn primitives, and the linter cannot see the
  `htmlFor`, role, and handler wiring that consumers supply. The exemption
  covers vendored primitives exclusively: never widen it to Tabelo's own
  components, where those rules are load-bearing.

## Durable project learning

At wrap-up, decide whether the work produced a learning that should outlive the
session. One qualifies only when it is verified, specific to Tabelo, likely to
recur, and belongs in a durable source.

Qualifying examples: a reproducible command that was actually run, an ownership
boundary or invariant the code now establishes, a recurring failure with a
verified cause, or a versioned external constraint whose source must stay
visible. Not qualifying: hypotheses, one-off debugging steps, raw logs,
issue-specific implementation detail, transient environment state,
machine-specific paths, or a conclusion with no evidence.

Compare each qualifying learning against the canonical owner that already
exists. This repository has one for most of them, and using it matters more
than the learning itself: `docs/performance.md` owns measurements and the
register of answered suspicions, `docs/testing.md` owns suite boundaries and
budgets, `docs/design-system.md` owns anything visual, `docs/adr/` owns a
decision and its reasoning, `CONTEXT.md` owns vocabulary, and this file owns
process. Do not create a new file when one of those can hold it.

If the learning is already recorded, do nothing. If it is absent or
contradictory, present one compact proposal naming `Evidence`,
`Canonical owner`, `Smallest change`, `Draft`, and
`Decision requested: Approve, reject, or revise.` The draft is the exact
section change proposed.

Documentation the selected behavior requires is part of the current task and
needs no extra approval. An adjacent learning outside the accepted scope is
proposal-only and waits for approval before editing, staging, or committing.
Do not delay the requested result while waiting on it.

## User attention cards

When the user must notice and respond to a proposed follow-up, a material
choice, a permission boundary, or a blocker, use exactly one of the four cards
(proposed issue, decision needed, approval needed, action needed) that
`docs/agent-attention-cards.md` defines; read it before writing one. Never bury
a card inside a general summary or a vague "human review" note. When the
client offers a native structured-question tool, raise the card through it and
write the card in the same turn: a card written only as Markdown does not ask.

## Configuration and repository hygiene

- Ignore secrets, local environments, logs, caches, build output, and generated
  artifacts appropriate to the actual stack.
- This project has no environment variables and therefore no `.env.example`. If
  one is ever introduced, document every supported name with a safe placeholder.
- Do not add placeholder automation.
- An executor does not touch `.github/workflows/` or `LICENSE`.

## Tests and validation

- Add or update focused tests for changed behavior, regressions, persistence,
  validation, and critical accessibility.
- Parser and serializer work requires round-trip tests; this is the project's
  highest-value test surface.
- Test observable contracts at stable seams; avoid tests that only mirror
  implementation details or framework behavior.
- Test behavior, semantics, state, accessibility, or technical contracts, never
  editorial wording. Do not assert exact user-facing copy, and do not compare
  rendered or generated interface text with the canonical copy or product
  constant that produced it: that only proves a value equals itself. Copy may
  locate a control when the test then asserts behavior, semantics, or state,
  though a stable semantic query is preferred; data-derived identifiers remain
  technical contracts rather than editorial copy.
- A change that only adds, edits, or removes copy needs no new or modified
  tests, and no test is added merely to claim coverage.
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

Branch naming, commit subjects, push, pull request titles, and the merge method
are recorded in `## Project identity and policy`. Executing them also requires:

- Check status and branch before editing and before the final report.
- Use Conventional Commits in English, one commit per concern. A commit that
  resolves an issue says `Closes #<n>` in its body, so the push to `main`
  closes it, and the body carries the problem, the implementation, and the
  validation actually run.
- A pull request may also be merged through `skd merge`, which merges only with
  a cross-family review at the head.
- Inspect the exact payload before publishing it: the staged diff before a
  commit, the outgoing commit range before a push, and the final text before an
  issue, pull request, comment, or review. Never commit secrets, caches,
  generated logs, temporary artifacts, or unrelated formatting churn.
- Stop before the mutation when the payload holds a credential, token, key, or
  sensitive personal value. Report the file, a masked location, and the
  category; never print the value. Offer a placeholder, a secret-store
  reference, or removal from scope. An explicit request to publish a plaintext
  secret is refused: authorization can permit a publication, it cannot make a
  secret safe.
- If a value may already be published, deleting it from the latest tree does not
  unpublish it. Stop further spread, state the reach without repeating the
  value, and revoke or rotate it before any decision about rewriting history.
- If commit or push fails, report the exact failure without claiming success.

## Completion report

Lead with the outcome and include what changed and why, files touched,
validation commands and actual results, warnings and remaining risks, temporary
artifacts kept or removed, commit and push status, and final worktree status.
