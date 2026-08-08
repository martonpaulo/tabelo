# Tabelo: Product Definition

Canonical answer to what Tabelo is, who it serves, and what it will never do.
Read it before proposing a feature. `AGENTS.md` is normative for process and
keeps the fixed product priority order; this file is normative for scope.

## What it is

Tabelo is a browser-based table editor. One table document is shown through
several synchronized views: a visual grid, Markdown, CSV, TSV, HTML source,
Jira syntax, JSON, and a rendered preview, arranged in a workspace of one to
four panes. Edit any view and the others follow.

## Who it is for

A developer or technical writer maintaining tables in text: in a README, in
project documentation, in a pull request description, in a Jira ticket.

Not a spreadsheet user. Someone who already has the table in a text format, or
needs it in one, and whose editor gives them no help with it.

## The job

Get a table into the right format, correct, without breaking its content on the
way.

Today that person has two options and dislikes both. They hand-align pipes in a
text editor, which is tedious and gets worse with every column added. Or they
paste into a spreadsheet, edit comfortably, and then lose the alignment,
escaping, and formatting on the way back out, sometimes silently.

Tabelo exists for the gap between those two: comfortable editing that returns
the exact text format the person came for.

## What it does

- Keeps one table document and projects it into every open view at once, so
  there is no copy-and-paste step between formats and no stale second copy.
- Treats data preservation as the first product requirement. Codec escapes are
  reversible, and any supported round trip that changes or drops a cell value
  is a defect.
- Keeps working when a draft does not parse. Every other view holds the last
  valid parse and stays editable, and the broken draft stays recoverable
  through undo rather than being discarded.
- Accepts pasted and imported data, reading the header row from formats that
  declare it and asking before replacing the table when CSV, TSV, or plain text
  does not.
- Runs entirely in the browser, offline, with no account and nothing uploaded.

## What it will never do

Each of these is a decision, not a gap waiting to be filled.

- **No accounts, backend, or cloud sync.** Everything runs locally. There is
  nothing to sign into, and a server would add operating cost and a privacy
  surface the product does not need to do its job.
- **No collaboration or CRDT layer.** One person edits one table. The single
  document with derived drafts (ADR 0001) is what makes synchronization
  predictable; a collaboration layer would replace that model wholesale.
- **No analytics or telemetry, of any kind.** The table content belongs to the
  user, and the product collects nothing, so there is nothing to leak. This is
  deliberate and it has a cost: see the success signals below.
- **No spreadsheet computational model.** Tabelo may adopt an interaction
  people already know from a spreadsheet when it makes editing a text-backed
  table faster or safer. It does not adopt formulas, multiple sheets, charts,
  macros, aggregation, or hidden type inference.
- **No large-document machinery.** Target scale is roughly 200 rows.
  Virtualization, Web Workers, and IndexedDB are all excluded. Input outside
  the supported bounds must be refused clearly instead of freezing or crashing
  the tab; that safeguard does not justify large-document architecture.
- **No localization framework.** English only, single locale, single
  maintainer. Dates and numbers inside cells stay opaque text.
- **No versions or releases.** The deployed site is always the current version.

## How you know it worked

Three signals, in the order they can actually be checked.

1. **Data preservation holds.** A value that goes in must come back out
   byte-exact through every supported round trip. This is the one signal that is
   measured: the round-trip test suite is its check, and a failure is a defect
   regardless of what else the change improves.
2. **The user needs no second tool.** The whole task, paste through edit
   through export, happens here, without a spreadsheet, a converter site, or a
   text editor opened alongside.
3. **It beats the workaround.** Getting from source data to correct target
   format is faster and less annoying than hand-aligning pipes or the
   spreadsheet round trip.

Signals 2 and 3 have no collection channel, because analytics is a non-goal
above and that trade was made knowingly. Treat them as tests to apply to a
proposed change rather than as numbers to report: does this let someone finish
without leaving, and is it faster than the thing they do today? Neither has a
baseline, and neither should be given an invented one.

## Constraints

- Browser only, no runtime beyond the page. Persistence is `localStorage`;
  offline capability is a service worker.
- Published to GitHub Pages at `https://martonpaulo.github.io/tabelo/`, built
  from `apps/web` by CI. The application is its own landing page.
- The product stores no secrets and holds no user account state.
- Roughly 200 rows is the working scale, not a limit to engineer past.
