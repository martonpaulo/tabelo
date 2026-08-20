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
may appear in at most one pane at a time. It also owns persisted presentation
preferences that never change the table document or its history, including
pane scale and wrapping plus per-column wrapping and width keyed by stable
column id.

Related to: Pane, Slot, Layout preset

### Slot

One of the four quadrants that a pane occupies: `a` top-left, `b` top-right,
`c` bottom-left, or `d` bottom-right.

Related to: Workspace, Pane

### Layout preset

A named arrangement of panes over the slots, such as "two columns" or "four
panes". Every preset tiles all four slots exactly once with rectangular panes.

There are eight, grouped by the number of panes they hold: one pane; two
columns and two rows; split left, split right, split top and split bottom;
and four panes. The pane count decides which presets exist, so choosing an
arrangement never changes how many panes are open. Adding and closing a view
are the commands that do that. One pane and four panes each have a single
preset, so there is no arrangement to choose there.

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

An ordered table field with a stable identifier, a header, and an alignment.
Identifier and header are distinct: the header is user content, the identifier
is application-owned and never shown. Its display width is a workspace
preference rather than document data.

Related to: Header row, Alignment, Cell

### Header row

The single row of column headers that every table document has. Not a data row,
not optional, and not a document mode.

Related to: Column, Header decision

### Row

An ordered collection of cell values with a stable identifier. Identifiers
survive reordering, parsing, and format switching so that selection and
workspace preferences stay attached to the right thing.

Related to: Cell, Table document

### Cell

The value at one row/column intersection. It holds a **cell value**: a string, a
number, a boolean, or null. Tabelo never infers a type, coerces a number, or
reformats content: a type is carried from a source that stated it or chosen
explicitly, never derived from how the text looks.

Related to: Cell value, Cell text, Expected column type, Row, Column

### Cell value

The scalar a cell holds. `null` is one of them, chosen explicitly or carried
from a typed source, and it is not a column mode or a nullability flag.

Related to: Cell, Cell text

### Cell text

A cell value projected to text, owned by one core function. Every view, codec,
and export reads a cell through it, so there is exactly one answer to what a
value looks like. `null` and the empty string project alike and remain distinct
values: text is a projection, never a second home for the data. When a text
source is reconciled, an exact match with the previous cell text retains the
previous value. Changed or newly inserted text is a string. Without a previous
document, empty text cannot identify whether it once represented `null`.

Related to: Cell value, Serializer

### Expected column type

The type a column expects to be typed into it: text, number, or boolean. It
guides editing and validation and never constrains the cells, because a typed
source may legitimately carry mixed types in one column. The real type always
belongs to the cell. A text expectation stores grid input exactly as a string.
A number or boolean expectation stores canonical valid input as that native
type. One leading apostrophe explicitly chooses a string and is removed; a
second apostrophe remains content. Valid input whose native value has a
different text projection requires an explicit Convert or Keep as text choice.
Invalid input remains editable until the user continues editing or explicitly
stores it as text.

Related to: Column, Cell value

### Selection

What the grid is pointing at: an ordered list of one or more **areas**, never
empty. One of them is **active**, and that is the area the keyboard works in,
the one Shift extends and the one an insertion point is measured from. A single
area is the ordinary case; only the platform modifier makes a second one.
Transient state: never persisted, never a document-timeline step.

Related to: Cell, Row, Column, Table operation

### Occurrence selection

What a source editor is pointing at when several ranges of the same text are
selected at once, gathered one at a time from the current selection. Matching
is literal and case-sensitive, and narrows to whole words when the selection is
exactly a word. The most recently added range is the primary one. Transient
editor state: never a draft, never document state, never persisted, and never a
document-timeline step. Editing every selected range at once is one editor
transaction and therefore one step of the editor's own history.

Related to: Draft, Document timeline, View

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
move, set cell, convert a cell type, change a column expectation, edit header,
or clear a range. Table operations are the only way the grid changes the
document.

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
becomes `\\`, and both escape the pipe. Jira writes a literal backslash as
`&#92;` and protects literal ampersands as `&amp;`. Each parser decodes only its
emitted grammar in one non-recursive pass. Escaping is always reversible.

Related to: Serializer, Parser

### Header decision

The import-time choice for formats that do not identify whether row 1 is a
header. Markdown, Jira, HTML, JSON, and Records declare the row role from their
syntax. CSV, TSV, and plain text ask before replacing the document. Choosing
data leaves the structural header row empty. No cell value is inspected to make
the choice, and the pending question is transient rather than document state.

Related to: Header row, Import

### Import

Bringing external content in, from a file or the clipboard. Clipboard paste is a
first-class import path, not a lesser one.

Related to: Header decision, Format sniffing

### Format sniffing

Inspecting pasted content to decide how to parse it, in priority order: the
private clipboard payload, HTML table, JSON matrix, TSV, Markdown table,
Records, Jira table, CSV, then plain text. Records sorts after Markdown on
purpose, so a paste that could be read either way is always read as Markdown.

Related to: Import, Parser, Private clipboard payload

### Private clipboard payload

Tabelo's own clipboard representation, carried inertly inside the public HTML
flavour beside the interoperable text and HTML every other application reads.
It holds the selected cell values with their types and the expected type of
each selected column, which no interoperable format can spell. It is versioned
independently of the persistence schema, because bytes in flight between two
tabs have a different compatibility window from a stored document.

It is preferred only when it validates, matches its own fingerprint, and
projects to exactly the table the public flavour is carrying. Anything else,
including content from another application, is read through format sniffing as
text. Nothing in it can reach a cell as content, and it is not charged to the
import size limits.

Related to: Format sniffing, Import, Cell value, Expected column type

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
- An occurrence selection ends when its pane changes view or closes. Selecting
  occurrences changes no text and creates no history step.
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
- Column width belongs to the workspace, keyed by stable column id. It survives
  document undo, redo, parsing, reordering, and reload, but orphaned entries are
  removed when their columns no longer exist. Duplicating a column seeds the
  new adjacent id with the source width without adding a history step.
- Every codec-specific escape must be reversible: any cell value survives a
  round trip through Markdown or Jira byte-exact.
- Header presence is an import-time fact or explicit choice, never a stored
  document property.
- A cell value's type is carried, never derived. No view may reinterpret a cell,
  and no format that cannot express a type may invent one.
- Reconciliation preserves an existing cell value only when a text-only source
  returns its exact cell-text projection. Changed and newly inserted text stays
  text. This previous value is what keeps `null` distinct from an empty string.
- The expected type belongs to the column and the real type belongs to the cell,
  so a column may hold values that disagree with what it expects.
- Typed grid entry may carry a native type only from canonical input or an
  explicit conversion choice. Ambiguous and invalid drafts never write the
  document before that choice.
