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

**Codec syntax** (#306, delivery slice 2). Markdown, HTML, and Jira declare
`inlineContent: "carried"` and write exactly the syntax of the issue's view
contract:

| Feature | Markdown | HTML | Jira |
| :--- | :--- | :--- | :--- |
| Bold | `**text**` | `<strong>` | `*text*` |
| Italic | `_text_` | `<em>` | `_text_` |
| Underline | `<u>text</u>` | `<u>` | `+text+` |
| Strikethrough | `~~text~~` | `<s>` | `-text-` |
| Code | `` `text` `` | `<code>` | `{{text}}` |
| Link | `[label](url)` | `<a href>` | `[label\|url]` |
| Image | `![alt](url)` | `<img src alt>` | `!url\|alt=alt!` |

- *Reading never infers.* A delimiter pairs only with a closer of its own mark
  and content between them, by a reduced form of the CommonMark emphasis
  algorithm, so every span nests properly. One that does not complete its
  construct is literal text exactly as written. Markdown reads a single `*`
  or `~` as text and, as GFM does, an `_` with a letter or digit on its outer
  side; Jira reads a marker only at the start and end of a word, as its
  renderer does, so `2020-01-01` and `snake_case` stay text.
- *Writing escapes only what would parse.* Plain text keeps its bytes unless
  a marker in it could pair where it stands, which is then escaped with a
  backslash. Whitespace a mark must not start or end on, and a letter or digit
  a delimiter must not touch (intraword italic in Markdown, a mark inside a
  word in Jira), are written as decimal references, which both grammars now
  read alongside the whitespace references Markdown already read. Code closes
  every other mark before it, since a renderer would otherwise draw the code
  formatted; an image leaves marks open, since no renderer draws one on an
  image. Writing what was read gives the same bytes, so switching views never
  accumulates normalization.
- *Jira reads links and images before it splits a row*, as Jira does, so the
  row splitter skips the pipes inside `[label|url]` and `!url|alt=...!`. One
  function says where each construct ends, for the splitter and the parser.
- *HTML is untrusted and read only as a tree.* `<b>`, `<i>`, and `<strike>`
  normalize to bold, italic, and strikethrough. Declined formatting (`<sup>`,
  `<mark>`, `<del>`, and the rest of the issue's non-goals), a mark around
  code, and an image inside a link keep their text or image and add a
  warning. An image without alternative text, or embedded content such as
  `<video>` or `<svg>`, refuses the parse, because keeping the text would lose
  what the reader sees. Script and style text never becomes a cell. The
  clipboard's public HTML flavour writes cells through the same writer.

**Rendering.** The rendered preview builds React elements from the validated
nodes, never markup from authored text. Only `https:`, `http:`, and `mailto:`
links activate; a web link opens in a separate browsing context with
`noopener` and `noreferrer`, and any other address stays visible, inert, and
explained. Only `https:` images load, lazily, with no referrer, capped by one
shared token; any other, or one that fails, shows its alternative text in a
stable unavailable state.

**Disclosure.** CSV, TSV, JSON, and Records keep declaring `"unexpressed"`.
While the document holds structure and one of their views is open for
editing, an app-level notice says it shows formatting as plain text and that
only an edited cell loses it. The download chooser says the same beside a
chosen format before the file is written.

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
- **Escape every marker character in plain text.** Simple and always safe,
  and it rewrites every Markdown and Jira export holding `snake_case`, a date,
  or a negative number for no reader's benefit. Escaping only what could
  parse keeps those bytes.
- **Accept `*text*` as Markdown italic.** GFM does, and then every `2*3*4`
  already written by Tabelo would read back formatted. Only the canonical
  spellings are syntax.

## Consequences

The model landed dormant in delivery slice 1. Slice 2 gives it codec syntax
and rendering: Markdown, HTML, and Jira read and write it, the rendered
preview shows it, and the plain formats disclose what they cannot spell. The
grid still shows the projection until the Visual Table editor arrives. The
Copy as menu discloses too (option A on #306, owner, 2026-09-19): while the
table holds formatting, a muted note at the top of the submenu names the
formats whose codec declares inline content unexpressed.
Reconciliation keeps structure through every plain view, and a grid commit
that leaves the projection unchanged writes nothing.

Importing Markdown or Jira now reads their inline syntax: a hand-written
`**x**` becomes bold, and a backslash escape such as `\*` reads as the
character it protects. A file Tabelo exported before slice 2 wrote markers
unescaped, so re-importing one reads a `**x**` in it as bold, which is how
GitHub and Jira already rendered it. A stored document does not change; a
stored source draft is read by the new grammar when it is next parsed.

Find matches the projection, so a link label or an image's alternative text
matches and a URL never does. Replace keeps the formatting around a match, and
leaves alone a match that touches an image, since replacing part of its
alternative text would discard the image and its URL.

ADR 0008 is amended by this one: a textual cell may now carry structure, and
that structure is carried exactly as a type is, never derived from how text
looks.
