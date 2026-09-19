# Escape Markdown losslessly instead of flattening

## Context

CSV and Markdown are not equally expressive. RFC 4180 CSV permits a line break
and a delimiter inside a quoted value; a Markdown table row is line-delimited and
pipe-delimited, so it can represent neither literally.

This is not an edge case in a tool whose whole purpose is moving between the two.
A user pastes a spreadsheet column containing an address with a line break,
switches the text panel to Markdown, switches back, and expects their data
intact. The product requirement is explicit: no silent data loss.

The obvious alternative: replace the newline with a space and warn: fails that
requirement. A warning does not make the loss acceptable, because CSV → Markdown
→ CSV is a round trip the user performs casually and repeatedly.

## Decision

The Markdown serializer escapes rather than flattens:

- `|` is written as `\|`
- a newline inside a cell is written as the decimal character reference
  `&#10;`, or as `<br>` when the reader chooses it (amended by #397, below)
- meaningful whitespace at a cell boundary is written as a decimal numeric
  character reference before readability padding is added
- a literal `&` is written as `&amp;`, protecting user text that already looks
  like a character reference
- a literal `\|`, `<br>`, or `&#10;` already present in a cell value is itself
  escaped (`\\|`, `\<br>`, `&amp;#10;`) so the transformation stays reversible
- amended by ADR 0011 (#306): a character the inline syntax could read where
  it stands (a doubled `*` or `~`, an `_` not inside a word, a backtick, `[`,
  and a literal `<u>`) is written with a backslash, and a letter or digit
  beside an italic delimiter as a decimal reference. Text holding none of them
  is written exactly as before.

The Markdown parser removes alignment padding, then reverses the emitted grammar
in one non-recursive pass. Decoded output is never fed back into that decoder,
so literal text such as `&#32;` remains literal. Any cell value must survive
CSV → Markdown → CSV byte-exact, and this is enforced by round-trip tests rather
than left to review.

No preference controls whether a break is kept: offering a space or dropping
it would reintroduce a lossy option through the back door.

Amended by #397 (owner, 2026-09-19): which lossless spelling is written is now a
choice. The default is `&#10;`, a character reference that CommonMark decodes
and never treats as raw HTML, so no renderer shows markup where a cell breaks;
most display it as whitespace. The setting "Use `<br>` for line breaks in
cells", a global default in Settings that a Markdown pane may override, writes
`<br>` instead, for renderers such as GitHub's that draw it as a visible break.
The Markdown pane and every Markdown output (download, Copy as, the pane's
copy) follow the same choice, so the pane shows what the file holds. The parser
reads `&#10;` and every `<br>` spelling whatever is chosen, each reversed
exactly once, and a value survives the round trip byte-exact in both.

## Consequences

- By default Markdown output holds no HTML for a line break: `&#10;` is valid
  CommonMark, and a renderer shows it as whitespace rather than as a visible
  break. A reader who wants the break drawn chooses `<br>`, which GitHub-flavored
  Markdown renders inside table cells and a strict CommonMark renderer that
  escapes raw HTML shows literally.
- The choice is a spelling, not an output option: it changes the text, never
  the table, and a download never differs from the pane.
- The escaping rules belong to the Markdown format module and must not leak into
  the document, the grid, or the CSV module.
- The reversibility requirement means escaping and unescaping change together,
  always with a test that asserts the round trip.
