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

A codec may also declare `outputOptions`: choices that belong to the file it
writes and to nothing else. CSV declares `includeHeader`, because the table
always has exactly one header row and whether the file prints it is a property
of that file — not `hasHeader` state creeping back into the document. The
download chooser reads the declaration rather than naming CSV, so a format with
no choices is offered none and a format that gains one needs no edit there.
Values are labelled in `ui/copy.ts` by id, keeping visible strings out of the
registry.

The chosen values are **session-only**, held in the store and never persisted.
They change the shape of the exported file, and a silently remembered "no
header row" would surprise someone weeks later; every session starts from the
codec's declared default instead.

**A view registry** holds what the workspace can display. A `ViewDefinition`
adds presentation to a codec: a label, a description, an icon, a `kind`
(`grid`, `source`, or `preview`), a highlight language named as a string, and a
`capabilities` record — editable, syntax-highlighted, downloadable, structured
clipboard, text clipboard, table operations. The view picker, the pane
renderer, and the clipboard behaviour all read capabilities rather than
checking ids.

Two rules keep the abstraction honest:

- **Rendering dispatches on `kind`, never on `id`.** One `SourceView` component
  serves Markdown, CSV, TSV, HTML, and Jira, because everything that differs
  between them is registry data.
- **The registry never imports the editor.** Highlighting is a name that the
  lazily loaded editor resolves, which is what allows CodeMirror to stay out of
  the initial bundle.

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
