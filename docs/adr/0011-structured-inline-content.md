# Carry inline formatting as structure in the document

## Context

Tabelo had no canonical representation for inline formatting. A cell held a
string, a number, a boolean, or null (ADR 0008), so bold text, a link, or an
image could only exist as the literal characters one format happens to spell
them with. That cannot satisfy the approved product contract (#306): the
visual table is the complete editor for the table, while Markdown, HTML, Jira,
and the other views stay synchronized projections of one document. Marker
strings would make Markdown's syntax the canonical form, lose HTML and Jira
features Markdown cannot spell whenever the view changes, and turn each new
feature into another marker substitution nobody can round trip.

The approved feature list is closed: bold, italic, underline, strikethrough,
inline code, links, explicit `mailto:` links, and remote images with required
alternative text. Emoji and line breaks stay ordinary text, alignment stays
column metadata, and wrapping stays a view preference.

## Decision

Structured inline content belongs to the table document, in the core, as plain
data with no framework dependency (decided on #306).

**The model.** A header or a textual cell holds `TextContent`: a plain string,
or an `InlineContent` value, `{ kind: "inline", nodes }`. A node is one of:

- a text run, `{ kind: "text", text, marks }`, whose marks are an ordered,
  duplicate-free set of `bold`, `italic`, `underline`, `strikethrough`, and
  `code`, always in that canonical order;
- a link, `{ kind: "link", url, children }`, holding text runs only;
- an image, `{ kind: "image", url, alt }`, atomic, with required non-empty
  alternative text.

A line break is an ordinary `\n` inside a run. A URL is kept exactly as
authored: nothing fetches, normalizes, follows, or reads cell data from it.

**Constraints.** A link never holds another link or an image, and an image has
no children. Inline code never combines with another mark and never crosses a
line break, because Markdown and Jira cannot round trip either combination
predictably. Every other combination of marks is allowed. A link and an image
each need a non-empty URL.

**One canonical form.** Normalization removes empty runs, merges adjacent runs
with identical marks, sorts marks, joins adjacent stretches of the same URL
into one link, and drops a link left with no label. Content that carries no
structure at all is the plain string it reads as, so plain text never gains a
wrapper and one value has exactly one spelling. None of this changes the
projection, a code point, or an authored URL. Because the form is unique,
equality is structural (`cellValuesEqual`), and a validator accepts exactly
the normalized form and nothing else.

**One projection.** `cellText` stays the single plain projection: runs and
link labels contribute their text, an image contributes its alternative text,
in document order. Find, the plain formats, accessible names, clipping, and
every fallback read a cell through it. Inline content is textual, so its
carried type is `string`: a text column expects it, and the Cell type command
sees text.

**Formatting never converts.** Formatting applies only to `TextContent`. A
number, a boolean, or null is never formatted, because formatting it would
first have to convert it, and a conversion is always the user's explicit
choice (ADR 0008). The Cell type table reaches a number or a boolean from
formatted text through its projection, and since that conversion discards the
structure, it always asks first.

**Range operations.** The core owns pure operations over text content, all in
UTF-16 offsets into the projection so find, selection, and an editor share one
coordinate system: set, toggle, and query a mark over a range; replace a range
with a fragment; slice a range; link and unlink a range; list links and
images. An image is atomic and an edge that falls inside it, or inside a
surrogate pair, widens outward. Plain text typed over a range takes the marks
and link of the first text it replaces; inserted at a caret it is unmarked and
joins a link only when it sits strictly inside one. Code replaces every other
mark and stops at each line break. Every operation returns normalized content.

**Reconciliation.** A codec declares `inlineContent: "carried" | "unexpressed"`
beside its typed-value and alignment facts. A source that cannot spell
structure reports only the projection, so an unchanged projection keeps the
existing structure, and only a cell whose text actually changed becomes plain
text. A source that can spell structure is believed, including when it spells
none. An equal value keeps the existing object either way, so identity
survives a parse that changed nothing.

**Durable data.** Persistence version 10 accepts inline content in headers and
cells. Every value a version-9 release wrote is already a valid version-10
value, so the migration copies the document byte for byte and changes only the
version. Content that is not in the exact normalized form, and any newer
version, follows the existing preserve-raw-and-report path. The private
clipboard payload moves to version 2 on its own schedule: version 1 is still
read, since every value it holds is valid in version 2, and its fingerprint
tags formatted text apart from the plain text it reads as.

## Rejected alternatives

- **Keep marker strings canonical.** It makes one format's syntax the model,
  loses what that format cannot spell, and needs escaping rules for text that
  merely looks like a marker.
- **Wrap every string.** Uniform, and it rewrites every stored byte and every
  fixture for no gain in expressiveness. A plain string is already the
  canonical form of unstructured text.
- **A general rich-text framework.** It brings a second document, history,
  selection, and clipboard owner, all of which would have to be reconciled with
  the table document, to support blocks, lists, and embeds the product has
  declined.
- **Offsets that count an image as one unit.** Closer to an editor's caret
  model, and it gives find and the projection a second coordinate system. The
  projection's own offsets keep one.

## Consequences

The model lands dormant (#306, delivery slice 1). No codec parses or emits
formatting yet, and every codec declares `inlineContent: "unexpressed"`, so a
formatted value can only arrive through storage or a same-app paste and every
view shows its projection. Reconciliation already keeps that structure through
every source view, and a grid commit that leaves the projection unchanged
writes nothing. Codec syntax, rendering, and the editor arrive in later
slices, each flipping only its own capability.

Find matches the projection, so a link label or an image's alternative text
matches and a URL never does. Replace keeps the formatting around a match, and
leaves alone a match that touches an image, since replacing part of its
alternative text would discard the image and its URL.

ADR 0008 is amended by this one: a textual cell may now carry structure, and
that structure is carried exactly as a type is, never derived from how text
looks.
