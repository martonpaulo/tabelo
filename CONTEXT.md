# Domain Context

Canonical vocabulary for Tabelo. Use these terms in code, tests, commits, and
UI copy. `AGENTS.md` holds the normative rules; this file defines the words.

## Vocabulary

### Table document

The single canonical representation of the user's table: an ordered list of
columns, an ordered list of rows, cell values, stable identifiers, alignment,
and a schema version. It is plain data with no framework dependency, and it is
the only source of truth.

Related to: Column, Row, Cell, Representation

### Representation

One of the three ways the table document is shown: the **grid**, **Markdown**,
or **CSV**. A representation is always derived from the table document — never
an independent copy of it.

Avoided synonym: "view" is ambiguous with route/component; prefer
"representation" for the data-level concept and "panel" for the UI surface.

Related to: Table document, Panel, Text format

### Panel

One of the two editing surfaces in the interface: the **grid panel** (always the
visual table) and the **text panel** (either Markdown or CSV).

Related to: Representation, Text format

### Text format

The format currently active in the text panel: Markdown or CSV. Switching the
text format changes which serializer renders the text panel. It never creates a
separate document and never resets the table.

Related to: Panel, Parser, Serializer

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

The value at one row/column intersection. Always an opaque string — Tabelo never
infers types, coerces numbers, or reformats content.

Related to: Row, Column

### Alignment

A column's Markdown alignment: default, left, center, or right. It is
Markdown-specific metadata that nonetheless lives in the table document, so it
survives time spent in CSV mode.

Related to: Column, Serializer

### Draft

The text currently in the text panel that has not yet been committed to the
table document. A draft may be invalid; an invalid draft never modifies the
table document.

Related to: Commit, Parser, Superseded draft

### Commit

The moment a valid parse of a draft replaces the table document and becomes one
step on the document timeline. Commits are debounced, not per-keystroke.

Related to: Draft, Document timeline

### Superseded draft

A draft that was still uncommitted when a grid edit took ownership and
regenerated the text panel. It is displaced, never destroyed, and remains
reachable through undo.

Related to: Draft, Document timeline

### Document timeline

The single ordered history of table document states. Each committed parse and
each table operation is one step. The text panel's own keystroke history is a
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

Related to: Serializer, Text format, Draft

### Serializer

A function from a table document to format text. Markdown and CSV serializers
are paired with their parsers behind one shared format contract.

Related to: Parser, Escaping

### Escaping

The format-specific transformation that lets a cell value survive a format that
cannot represent it literally — in Markdown, `|` becomes `\|` and a newline
becomes `<br>`. Escaping is always reversible.

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
table, TSV, Markdown table, CSV, then plain text.

Related to: Import, Parser

### Empty state

The application with no table yet. It is fully usable: typing in a cell, adding
a row or column, pasting, or importing all create the required structure
automatically.

Related to: Table document, Import

## Rules and relationships

- A table document has exactly one header row and zero or more data rows.
- Every column and every row has a stable identifier that is never shown to the
  user and never reused after deletion.
- A representation is always derived from the table document. Markdown and CSV
  text are reconstructible, never canonical.
- Switching text format changes only which serializer runs. It never creates a
  second document, resets the table, or loses content.
- A draft that does not parse leaves the table document untouched; the grid keeps
  showing the last committed state and stays editable.
- A grid edit always wins over an uncommitted draft, and always leaves that draft
  recoverable through undo.
- Alignment belongs to the column, so a Markdown → CSV → Markdown round trip
  preserves it even though CSV cannot express it.
- Escaping must be reversible: any cell value survives
  CSV → Markdown → CSV byte-exact.
- Header detection is an import-time decision, never a stored document property.
- Cell values are opaque strings; no representation may reinterpret them.
