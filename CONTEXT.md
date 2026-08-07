# Domain Context

Canonical vocabulary for Tabelo. Use these terms in code, tests, commits, and
UI copy. `AGENTS.md` holds the normative rules; this file defines the words.

## Vocabulary

### Table document

The single canonical representation of the user's table: an ordered list of
columns, an ordered list of rows, cell values, stable identifiers, alignment,
and a schema version. It is plain data with no framework dependency, and it is
the only source of truth.

Related to: Column, Row, Cell, View

### View

One way of showing the table document: the grid, a source format (Markdown,
CSV, TSV, HTML, Jira, JSON, Records), or the rendered preview. A view is always derived from
the table document: never an independent copy of it. Every view is described
in the view registry by its capabilities rather than by its name.

Related to: Table document, Pane, Codec, Workspace

### Pane

One region of the workspace, showing exactly one view. A pane occupies one
slot or two adjacent slots.

Related to: View, Slot, Workspace

### Workspace

The 2×2 arrangement of slots that holds one to four panes. Its shape comes from
a named layout preset; free slot assignment does not exist. A registered view
may appear in at most one pane at a time.

Related to: Pane, Slot, Layout preset

### Slot

One of the four quadrants that a pane occupies: `a` top-left, `b` top-right,
`c` bottom-left, or `d` bottom-right.

Related to: Workspace, Pane

### Layout preset

A named arrangement of panes over the slots, such as "two columns" or "four
panes". Every preset tiles all four slots exactly once with rectangular panes.

Related to: Workspace, Slot

### Codec

A parse/serialize pair for one text format, together with the file extension
and MIME type needed to download it. A codec may declare a document
precondition when that format cannot represent every valid table. A failed
precondition declines serialization without making the document or a source
draft invalid. Codecs know nothing about the interface.

Related to: View, Parser, Serializer

### Capability

Something a view can do: being editable, offering syntax highlighting, taking
part in structured clipboard operations. Behaviour is decided by reading
capabilities, never by checking a view's identity.

Related to: View

### Column

An ordered table field with a stable identifier, a header, an alignment, and an
optional display width. Identifier and header are distinct: the header is user
content, the identifier is application-owned and never shown.

Related to: Header row, Alignment, Cell

### Header row

The single row of column headers that every table document has. Not a data row,
not optional, and not a document mode.

Related to: Column, Header detection

### Row

An ordered collection of cell values with a stable identifier. Identifiers
survive reordering, parsing, and format switching so that selection and column
widths stay attached to the right thing.

Related to: Cell, Table document

### Cell

The value at one row/column intersection. Always an opaque string: Tabelo never
infers types, coerces numbers, or reformats content.

Related to: Row, Column

### Selection

What the grid is pointing at: an ordered list of one or more **areas**, never
empty. One of them is **active**, and that is the area the keyboard works in,
the one Shift extends and the one an insertion point is measured from. A single
area is the ordinary case; only the platform modifier makes a second one.
Transient state: never persisted, never a document-timeline step.

Related to: Cell, Row, Column, Table operation

### Alignment

A column's alignment: default, left, center, or right. Only Markdown and HTML
can express it, but it lives on the table document, so it survives time spent
in a format that cannot.

Related to: Column, Serializer

### Draft

Text in a source view that has not yet been committed to the table document.
Exactly one draft exists at a time, owned by the view being typed into; every
other view is a pure projection. A draft may be invalid, and an invalid draft
never modifies the table document.

Related to: Commit, Parser, Superseded draft, View

### Commit

The moment a valid parse of a draft replaces the table document and becomes one
step on the document timeline. Commits are debounced, not per-keystroke.

Related to: Draft, Document timeline

### Superseded draft

A draft that was still uncommitted when a table edit took ownership and
regenerated every view. It is displaced, never destroyed, and remains reachable
through undo.

Related to: Draft, Document timeline

### Document timeline

The single ordered history of table document states. Each committed parse and
each table operation is one step. A source view's own keystroke history is a
separate, shallower layer that falls through to this timeline when exhausted.

Related to: Commit, Table operation

### Table operation

A pure function from one table document to another: insert, delete, duplicate,
move, resize, set cell, edit header, clear range. Table operations are the only
way the grid changes the document.

Related to: Table document, Document timeline

### Parser

A function from format text to a table document, or to a structured failure
describing why the text is not yet valid.

Related to: Serializer, Codec, Draft

### Serializer

A function from a table document to format text. Every serializer is paired
with its parser in a codec.

Related to: Parser, Escaping

### Escaping

The format-specific transformation that lets a cell value survive a format that
cannot represent it literally: in Markdown a newline becomes `<br>`, in Jira it
becomes `\\`, and both escape the pipe. Escaping is always reversible.

Related to: Serializer, Parser

### Header detection

The import-time heuristic that decides whether row 1 of pasted or imported text
becomes the header row. It runs only at import, produces no persistent state,
and is correctable with one undoable action.

Related to: Header row, Import

### Import

Bringing external content in, from a file or the clipboard. Clipboard paste is a
first-class import path, not a lesser one.

Related to: Header detection, Format sniffing

### Format sniffing

Inspecting pasted content to decide how to parse it, in priority order: HTML
table, JSON matrix, TSV, Markdown table, Records, Jira table, CSV, then plain
text. Records sorts after Markdown on purpose, so a paste that could be read
either way is always read as Markdown.

Related to: Import, Parser

### Empty state

The application with no table yet. It is fully usable: typing in a cell, adding
a row or column, pasting, or importing all create the required structure
automatically.

Related to: Table document, Import

## Rules and relationships

- A table document has exactly one header row and zero or more data rows.
- Row numbering includes that header row as row 1; data rows begin at row 2. The
  header row's selection coordinate is therefore below the first data row's, so
  that adding it addressed no renumbering of the data rows.
- A header cell is an ordinary cell for selection, editing, and clearing. It
  differs from a data cell in exactly one way: the header row can never be
  deleted as a row.
- A selection holds at least one area and may hold several. Areas may overlap,
  and every count over them is a set, so the same row or column is never acted
  on twice. An operation needing one insertion point or one origin acts on the
  active area and refuses a selection holding more than one.
- A header may be empty, and an empty header stays empty. No `Column N` name is
  ever generated. An unnamed column is identified positionally by its letter on
  the column index strip, which is chrome and not part of the table.
- A workspace holds one to four panes, and its panes tile all four slots exactly
  once. Every pane is rectangular; an L-shape is not representable.
- A registered view appears in at most one pane in the workspace.
- At most one draft exists at any moment.
- Every column and every row has a stable identifier that is never shown to the
  user and never reused after deletion.
- A view is always derived from the table document. Serialized text is
  reconstructible, never canonical.
- Changing a pane's view changes only which serializer runs. It never creates a
  second document, resets the table, or loses content.
- A draft that does not parse leaves the table document untouched; the grid keeps
  showing the last committed state and stays editable.
- A grid edit always wins over an uncommitted draft, and always leaves that draft
  recoverable through undo.
- Alignment belongs to the column, so it survives a round trip through any
  format that cannot express it: CSV, TSV, and Jira all lose it on paper and
  none of them lose it in Tabelo.
- Escaping must be reversible: any cell value survives
  CSV → Markdown → CSV byte-exact.
- Header detection is an import-time decision, never a stored document property.
- Cell values are opaque strings; no view may reinterpret them.
