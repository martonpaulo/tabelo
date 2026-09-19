# Describe formats and views in registries, not in the application core

## Context

Tabelo began with two text formats named directly in the code: a `TextFormat`
union of `"markdown" | "csv"`, a switch in the panel, a hardcoded format
switch, a hardcoded download button.

Going from two formats to five, and from two fixed panels to a configurable
workspace with seven views, would have multiplied that. Adding TSV alone
touched the format union, the panel, the switch, the download menu, the
clipboard sniffer, the import file filter, and the persistence schema. Seven
edits to add one parser is the shape of a design that will rot.

The requirement is explicit that formats should be registered through a
scalable abstraction, and equally explicit that this should not become a plugin
platform. Those pull in opposite directions: a real plugin system means
lifecycle, isolation, versioning, and a public contract, none of which a
single-page utility with no third-party authors needs.

## Decision

Two registries, deliberately small and deliberately internal.

**A codec registry** holds the pure data transforms. A `TableCodec` is an id, a
label, a file extension, a MIME type, a `parse`, and a `serialize`. Nothing
about the UI. Downloads, clipboard sniffing, and file import all derive from
this registry, so registering a codec makes a format downloadable, pasteable,
and importable with no further edit.

A codec also declares the syntax facts reconciliation needs: whether cell
values are text-only or typed, whether column alignment is carried or
unexpressed, and whether inline content is carried or unexpressed (ADR 0011).
An unchanged text projection can then retain the previous native value or
inline structure, while alignment a format cannot express stays on the
document. Markdown and HTML still apply alignment edits because their syntax
carries it. This is registry data, not a switch on codec ids.

A codec may also declare `outputOptions`: choices that belong to the file it
writes and to nothing else. Records declares `includeFirstColumnName` and
`includeEmptyValues`, because both produce output its own parser cannot read
back, which is exactly why neither may reach an editable pane. A choice a
format cannot legitimately offer is simply not declared: CSV declares none,
because its header row is structural and every file prints it. The download
chooser reads the declaration rather than naming a format, so a format with no
choices is offered none and a format that gains one needs no edit there. Values
are labelled in `copy/copy.ts` by id, keeping visible strings out of the
registry.

A codec may declare a document precondition when its format cannot represent
every valid table. Shared registry helpers evaluate that predicate before any
projection or download. A refusal is distinct from a parse error: the document
remains valid, no draft is created, and consumers show the codec's structured
failure rather than stale or invented output. Static `downloadable` capability
data still describes whether a view can produce a file at all; the precondition
answers whether it can produce one for the current document.

The chosen values are **session-only**, held in the store and never persisted.
They change the shape of the exported file, and a silently remembered "leave
the empty values out" would surprise someone weeks later; every session starts
from the codec's declared default instead.

A codec may declare one `structuralAssistance` function: its format's named
structural-assistance features, combined so that no two act on the same edit,
under the contract in `AGENTS.md`, "Source text is free; structural assistance
is narrow". It is pure and text-only. Given the
draft before and after one user edit, and the ranges that edit changed, it
returns at most one further edit to the draft, or nothing when the draft does
not settle what the change should be. The edit may ask for a caret left where
it inserts text to land after that text, for a feature whose insertion is where
typing continues. The source editor lands the result in the
same transaction as the user's edit without knowing which format declared it,
and the pane menu offers the switch that turns it off for the current buffer
only when a view's codec declares one. Markdown declares the first two:
keeping its alignment divider in step with the table (Decided on #297), and
opening a new row with `| ` on Enter at the end of a row below the divider
(Decided on #391). Jira declares the same row-start feature on its own terms:
a bare `|`, because a space after the pipe is part of the cell value in Jira,
and after the header line as well, because Jira has no divider (Decided on
#391). No other codec declares one, and adding one is a codec change, not an
editor change.

A codec may declare `mapsSourceRows`: its successful parse then also returns
where each table row sits in the source, header first, and where each cell of
that row sits, from the same scan that read the values (#296, #255). This is
the codec's position mapping. One format-neutral function turns a source
position into the row and column it names, so a structural command can act on
the row under the caret from a source pane, and nothing outside the codec
tokenizes the text again. A cell's range is its whole spelling between two
delimiters, padding, quotes, and escapes included; a Markdown alignment
divider names its header row and no column. Markdown, CSV, TSV, and Jira
declare it, because one table row is one line there, or one quoted run of
lines that the parser itself delimits. HTML, JSON, and Records do not: a row is
an element, an object, or one field per line whose layout the text does not
fix, and a mapping that is only nearly right would move a row the user did not
mean, which is corruption that looks like success. Their panes offer no
structural commands, and that absence is the complete design rather than a gap.
A pane never maps a draft that does not parse: the text has no rows the
document has read, so the commands refuse rather than act on the last valid
parse. One flag covers rows and cells, because every format that can bound a
row exactly can bound its cells with the scanner that split it. Decided on
#255.

A codec may also declare `alignsSourceColumns`: its own output sets each
column at one horizontal position in a monospaced source view, so the pane
labels the columns with letters placed over the header cells its position
mapping found. Only Markdown declares it, because only its serializer pads
cells to a shared width; a format that separates fields without padding them
has no position to label, and its pane draws no letters. The declaration needs
`mapsSourceRows`, and like it, the editor reads it from the codec and never
decides by the view's name. Decided on #368.

**A view registry** holds what the workspace can display. A `ViewDefinition`
adds presentation to a codec: a label, a description, an icon, a `kind`
(`grid`, `source`, or `preview`), a highlight language named as a string, a
`capabilities` record: editable, syntax-highlighted, downloadable, structured
clipboard, text clipboard, table operations, and a `loading` declaration
(`eager` or `lazy`). The view picker, the pane renderer, and the clipboard
behaviour all read capabilities rather than checking ids.

Two rules keep the abstraction honest:

- **Rendering dispatches on `kind`, never on `id`.** One `SourceView` component
  serves Markdown, CSV, TSV, HTML, Jira, and JSON, because everything that differs
  between them is registry data.
- **The registry never imports the editor.** Highlighting is a name that the
  lazily loaded editor resolves, which is what allows CodeMirror to stay out of
  the initial bundle.

Whether a view's component ships in the initial bundle or loads on first use
is `loading`, not a branch on the view's identity in the pane renderer. Every
view currently keeps its existing effective behaviour: the grid is `eager`
because it is what almost every workspace opens with and because it measures
column widths rather than styling them, everything else is `lazy` because it
shares CodeMirror or the preview's own bundle. Changing a view's declared
loading strategy is a data edit, not a renderer change.

Read-only is a property of the *view*, not the codec. The rendered preview
borrows the HTML codec to serialize for download and simply declares
`editable: false`; the codec itself is a complete pair.

## Consequences

- Adding a format is one file plus one registry line. TSV was exactly that.
- The download menu, import filter, and paste sniffer cannot drift out of step
  with the format list, because they are generated from it.
- Capabilities are data, so a view's behaviour is inspectable and testable
  without rendering it.
- The registries are internal and typed by a closed union of ids. That is a
  deliberate ceiling: there is no runtime registration, no third-party
  contract, and no versioned API to maintain. Opening it later is a real
  decision, not an accident.
- One cost: a capability that only one view uses still appears on every view's
  record. That is tolerable at seven views and would not be at seventy.
