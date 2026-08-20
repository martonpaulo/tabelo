# Carry a cell's type, never derive it from its text

## Context

Every Tabelo cell was a string. ADR 0001 stated it plainly: "Cell values are
opaque strings throughout." That is what made the codecs safe. A cell was
whatever bytes the user typed, and no view could reinterpret them, so `007`
came back as `007`, `1/2` was never a date, and `=SUM(A1)` was three formats'
worth of text and nothing else.

That model cannot express what JSON already contains. A JSON document holding
`{"age": 35, "active": true, "notes": null}` has three types the product
currently flattens to `"35"`, `"true"`, and `""` on the way in, and cannot
give back on the way out. Round-tripping someone's JSON through Tabelo
silently quotes every number and boolean and loses the distinction between a
null and an empty string. Priority 1, data preservation, is what that violates.

The tempting fix is type inference: look at `35` and store a number. That is
exactly the behavior the product rejects, for the same reason spreadsheets are
infuriating: inference is invisible, it is wrong at the edges the user cares
about most (leading zeros, long digit strings, anything that resembles a date),
and there is no way to spell "I meant the text".

So the question was not whether cells should have types. It was where a type is
allowed to come from.

## Decision

A cell carries `string | number | boolean | null`. A column carries the type it
**expects** for editing: `text`, `number`, or `boolean`.

**A type is carried, never derived.** A value becomes a number because a typed
source said so or because the user explicitly chose it. Nothing reads text and
concludes a type from how it looks: not a codec, not the grid, not paste, not
persistence, and not a migration.

Three consequences of that rule are load-bearing:

- **The real type belongs to the cell, not the column.** The column expectation
  guides editing and validation; it does not constrain the data. A typed source
  may legitimately put a string in a column that expects numbers, and Tabelo
  stores what it was given rather than what it expected.
- **`null` is a cell value, not a column mode.** It is chosen explicitly or
  carried from a typed source. There is no nullability flag anywhere.
- **`cellText` in the core owns every projection to text.** `null` and `""`
  both project to empty text and stay distinct as values, which is only
  coherent while text is a projection rather than a second home for the data.
  A codec or component computing its own conversion would immediately
  reintroduce two answers to what a value looks like.

Rejected alternatives:

- **Infer from text, with an escape hatch.** The escape hatch is the tell: it
  exists because inference is wrong often enough to need one. It also cannot be
  made lossless, because the inference has to run before the user can object.
- **Type the column instead of the cell.** Simpler, and it cannot represent a
  JSON array whose records disagree about a field's type, which is the input
  that started this. Mixed columns are real data, not user error.
- **Keep strings and remember the source type beside them.** A second store
  that has to stay synchronized with the first, which the ADR 0001 model exists
  to avoid.

## Consequences

Markdown, CSV, TSV, Jira, HTML, and Records have no syntax for a type, so they
serialize `cellText` and parse strings. Inside a synchronized source edit,
reconciliation still has the previous document: when a parsed string exactly
equals `cellText` of the existing value at that position, it retains that value
and its type. When the text changes, the parsed string wins as a string. A fresh
import has no previous value to supply a distinction, so a number that leaves
through CSV and returns through import is a string. That is correct: the format
carried no type, and nothing inferred one.

The same rule explains the ambiguous empty projection. `null` and `""` both
serialize as empty text. Reconciliation preserves either one when the previous
document identifies it; a newly inserted or freshly imported empty text cell is
the empty string.

JSON is the first source of a native value: its scalar syntax carries strings,
numbers, booleans, and null directly into the document and receives those same
types on serialization. The visual table is the other source: its column menu
sets an expected text, number, or boolean type without converting cells, and a
cell menu explicitly converts one existing value. Grid entry into a number or
boolean column carries canonical input as that native type. A leading
apostrophe explicitly carries the remainder as a string. Valid input whose
native projection would change the entered representation, and invalid input,
requires a user choice before the document changes. The model landed first so
its migration stayed reviewable on its own.

The clipboard carries the model between two Tabelo tabs without becoming a
source of authority over it. TSV and HTML have no syntax for a type, so a
private payload rides inertly inside the HTML flavour holding the selected
values and each selected column's expectation. It is preferred only when it
validates and projects to exactly the table the public flavours are visibly
carrying, so external content still arrives as text and nothing gains a type in
transit. Its schema is versioned on its own: bytes in flight between two tabs
have a different compatibility window from a stored document, and tying the two
versions together would make either one unable to change alone. The transport
was measured rather than chosen: a custom MIME flavour survives DataTransfer in
both engines, but Firefox refuses to write one through the asynchronous
clipboard API and takes the public flavours down with it, while an inert HTML
comment survived every path in both engines.

Pasting values into columns that already exist writes values and nothing else.
An expectation travels only where the paste creates the columns, because
rewriting what an existing column expects would restructure rows the paste
never touched.

Round-trip preservation stays the measured signal, and it now has two halves:
text still survives byte-exact, and a native value must survive synchronized
text reconciliation as the same value rather than as its projection.

Persistence gained a schema version whose migration assigns every existing
column the `text` expectation and copies every stored value through as the
string it already was. No shipped table changes meaning. A non-finite number is
not a valid cell value: `JSON.stringify` writes `NaN` and `Infinity` as `null`,
which would turn a number into a different type on the next load, so the
payload is refused and preserved rather than silently altered.

ADR 0001 is amended: its "opaque strings throughout" sentence described the
model this replaces. What survives from it, and matters more, is that Tabelo
does not reinterpret content. A carried type is not a reinterpretation; a
derived one would be.
