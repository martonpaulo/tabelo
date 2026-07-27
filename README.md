# Tabelo

Edit a table visually, as Markdown, or as CSV — always in sync, entirely in your
browser.

> **Status: early development.** The repository is scaffolded and the
> architecture is decided, but the editor itself is not implemented yet. The
> "What it will do" section describes intent, not working software.

## What it will do

Tabelo keeps one table and shows it three ways. A visual grid is always the
primary editing surface; a second panel shows the same table as Markdown or CSV,
and you can switch between those two at any time. Edit anywhere, and the other
representations follow.

- **Visual grid** — edit cells and headers; add, delete, duplicate, and reorder
  rows and columns; select cells, rows, ranges, or columns; resize columns;
  drive all of it from the keyboard.
- **Markdown** — edit a Markdown table directly, with syntax highlighting,
  column alignment, and useful feedback while the source is incomplete.
- **CSV** — edit the same table as CSV, handling quoted delimiters, embedded
  line breaks, escaped quotes, empty cells, and mixed line endings.
- **Clipboard as a first-class path** — paste from spreadsheets, web tables,
  Markdown, CSV, or TSV, including into an empty document to get started.
- **Nothing to save** — the document is written to browser storage
  automatically and restored when you come back.
- **Works offline** — a service worker caches the app on first visit. No install
  prompt, no app store, nothing to accept.

### What it deliberately is not

A spreadsheet. No formulas, calculations, multiple sheets, charts, or macros.
No accounts, no backend, no cloud sync, no collaboration, no analytics. Tabelo
is a focused utility that does one thing.

## Getting started

Requires [Node.js](https://nodejs.org) 24+ and [pnpm](https://pnpm.io) 11+.

```bash
pnpm install
```

```bash
pnpm dev
```

The app runs at <http://localhost:3001>.

### Commands

| Command | What it does |
| :--- | :--- |
| `pnpm dev` | Start the dev server |
| `pnpm build` | Production build |
| `pnpm check-types` | TypeScript across the workspace |
| `pnpm lint` | Biome format and lint check |
| `pnpm check` | Biome check, writing fixes |

## Architecture

Scaffolded with [Better-T-Stack](https://www.better-t-stack.dev/). React 19,
Vite, TanStack Router, Tailwind CSS v4, and shadcn/ui on Base UI, in a pnpm
workspace: the app lives in `apps/web`, shared UI primitives in `packages/ui`.

The design rests on one idea — a single canonical table document, with Markdown
and CSV as parsers and serializers around it rather than as alternative homes
for the data. The decisions worth understanding before contributing:

- [Derive every representation from one table document](docs/adr/0001-single-table-document-with-derived-text-drafts.md)
- [Escape Markdown losslessly instead of flattening](docs/adr/0002-lossless-markdown-escaping.md)
- [Layer text-editor undo on top of a document timeline](docs/adr/0003-layered-undo.md)
- [Build an accessible DOM grid instead of adopting a spreadsheet component](docs/adr/0004-accessible-dom-grid-over-spreadsheet-component.md)

[`CONTEXT.md`](CONTEXT.md) defines the domain vocabulary and [`AGENTS.md`](AGENTS.md)
holds this repository's working agreements.

### Working on the UI package

Design tokens live in `packages/ui/src/styles/globals.css`, primitives in
`packages/ui/src/components/`. Add more shadcn primitives from the repository
root:

```bash
pnpm dlx shadcn@latest add dialog popover sheet -c packages/ui
```

Import them as `@tabelo/ui/components/<name>`.

## Privacy

Your data never leaves your browser. There is no backend, no account, and no
analytics or telemetry of any kind. The document lives in `localStorage` on your
own machine, and clearing browser storage deletes it permanently — there is no
copy anywhere else.

## Limitations

- Built for tables around 200 rows. Larger input degrades with a warning rather
  than being supported.
- Cell values are opaque text. Tabelo never infers types, coerces numbers, or
  reformats content.
- Markdown output escapes line breaks as `<br>` so data survives the round trip;
  strict CommonMark renderers that escape raw HTML will show that literally.
- One document at a time.

## Deployment

Pushes to `main` build and publish to GitHub Pages at
<https://martonpaulo.github.io/tabelo/>.

## License

[MIT](LICENSE) © 2026 Marton Paulo
