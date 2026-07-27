# Tabelo

**One table. Three ways to edit it. Always in sync.**

Tabelo is a table editor that stops making you choose between a grid and a text
file. Drag a column into place, then watch the Markdown rewrite itself. Fix a
typo in the CSV, then watch the cell update. Same table, three windows onto it,
no import step and no export step.

It runs entirely in your browser. No account, no server, no upload.

**→ [martonpaulo.github.io/tabelo](https://martonpaulo.github.io/tabelo/)**

---

## The whole idea in one picture

These are not three documents. They are the same document.

**Grid**

| Name  | Role      | Active |
| :---- | :-------: | -----: |
| Ana   | Designer  | Yes    |
| Bruno | Developer | No     |

**Markdown** — alignment and all

```markdown
| Name  | Role      | Active |
| :---- | :-------: | -----: |
| Ana   | Designer  | Yes    |
| Bruno | Developer | No     |
```

**CSV**

```csv
Name,Role,Active
Ana,Designer,Yes
Bruno,Developer,No
```

Switch to CSV and back, and those `:---:` alignment markers are still there.
CSV cannot express alignment, so Tabelo remembers it for you rather than
throwing it away.

## What it does

- **Edit visually.** Cells, headers, rows, columns. Add, delete, duplicate,
  reorder, resize, select ranges, clear.
- **Edit the source.** Markdown or CSV, with syntax highlighting and errors that
  tell you which line is wrong.
- **Never lose a cell.** A value with a line break in it survives
  CSV → Markdown → CSV byte-exact. Markdown can't hold a raw newline, so Tabelo
  escapes it and unescapes it back. Same for pipes.
- **Type freely.** While your Markdown is half-written and invalid, the grid
  keeps showing your last working table instead of collapsing. It says so, too.
- **Paste anything.** Spreadsheets, web tables, Markdown, CSV, TSV, a plain
  column of text. Tabelo works out which it is.
- **Nothing to save.** Your table is in browser storage and comes back when you
  return.
- **Works offline.** A service worker caches the app on your first visit. No
  install prompt, no app store, nothing to accept.

### What it deliberately doesn't do

No formulas. No multiple sheets. No charts, macros, or pivot tables. No
accounts, no cloud sync, no collaboration, no analytics. Tabelo is a focused
utility, and the fastest way to ruin one is to keep adding to it.

## Keyboard

Both hands stay where they are.

| Keys | What happens |
| :--- | :--- |
| Arrows | Move between cells |
| `Shift` + arrows | Extend the selection |
| `Enter` / `F2` | Edit the focused cell |
| Any character | Replace the cell and start typing |
| `Enter` while editing | Commit, move down |
| `Shift` `Enter` while editing | Line break inside the cell |
| `Tab` / `Shift` `Tab` | Next / previous cell |
| `Alt` + arrows | **Move the row or column itself** |
| `Delete` | Clear the selection |
| `⌘` `Enter` | Add a row |
| `⌘` `A` | Select everything |
| `⌘` `Z` / `⌘` `⇧` `Z` | Undo / redo |

Undo is layered: inside the source panel it undoes your keystrokes, and once
that history runs out it keeps going through the table's own history. One
timeline underneath, native behaviour on top.

## Getting started

Requires [Node.js](https://nodejs.org) 24+ and [pnpm](https://pnpm.io) 11+.

```bash
pnpm install
```

```bash
pnpm dev
```

Then open <http://localhost:3001>.

| Command | What it does |
| :--- | :--- |
| `pnpm dev` | Dev server |
| `pnpm build` | Production build |
| `pnpm test` | Unit tests |
| `pnpm check-types` | TypeScript |
| `pnpm lint` | Biome check |
| `pnpm check` | Biome check, writing fixes |

## How it's built

React 19, Vite, TanStack Router, Tailwind v4, shadcn/ui on Base UI, CodeMirror 6
for the source panel, Papa Parse for CSV. Scaffolded with
[Better-T-Stack](https://www.better-t-stack.dev/). The grid is hand-built — no
grid library.

One idea holds the whole thing up: **there is a single canonical table document,
and Markdown and CSV are parsers and serializers around it.** Neither text
format is ever the source of truth. That is what makes round trips safe.

The decisions worth reading before you change anything:

- [Derive every representation from one table document](docs/adr/0001-single-table-document-with-derived-text-drafts.md) — and why a CRDT wouldn't have helped
- [Escape Markdown losslessly instead of flattening](docs/adr/0002-lossless-markdown-escaping.md)
- [Layer text-editor undo on top of a document timeline](docs/adr/0003-layered-undo.md)
- [Build an accessible DOM grid instead of adopting a spreadsheet component](docs/adr/0004-accessible-dom-grid-over-spreadsheet-component.md)

[`docs/design-system.md`](docs/design-system.md) is binding for anything visual,
[`CONTEXT.md`](CONTEXT.md) defines the vocabulary, and [`AGENTS.md`](AGENTS.md)
holds the working agreements.

## Privacy

Your data never leaves your browser. There is no backend, no account, and no
telemetry of any kind. The document lives in `localStorage` on your machine.
Clear your browser storage and it is gone — there is no copy anywhere else,
including with us.

## Honest limitations

- **Built for tables up to a few hundred rows.** There is no virtualization, on
  purpose. Paste 50,000 rows and it will warn you rather than pretend.
- **Cell values are opaque text.** Tabelo never guesses types, never coerces a
  number, never reformats a date. What you typed is what is stored.
- **Markdown output contains `<br>`** where a cell has a line break. That is the
  price of not losing the line break. Strict CommonMark renderers that escape
  raw HTML will show it literally.
- **One document at a time.**
- **Reordering is keyboard and menu, not drag.** This was a choice: the keyboard
  path works for everyone, and drag-only reordering does not.

## License

[MIT](LICENSE) © 2026 Marton Paulo
