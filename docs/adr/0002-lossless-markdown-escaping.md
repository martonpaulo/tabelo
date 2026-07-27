# Escape Markdown losslessly instead of flattening

## Context

CSV and Markdown are not equally expressive. RFC 4180 CSV permits a line break
and a delimiter inside a quoted value; a Markdown table row is line-delimited and
pipe-delimited, so it can represent neither literally.

This is not an edge case in a tool whose whole purpose is moving between the two.
A user pastes a spreadsheet column containing an address with a line break,
switches the text panel to Markdown, switches back, and expects their data
intact. The product requirement is explicit: no silent data loss.

The obvious alternative — replace the newline with a space and warn — fails that
requirement. A warning does not make the loss acceptable, because CSV → Markdown
→ CSV is a round trip the user performs casually and repeatedly.

## Decision

The Markdown serializer escapes rather than flattens:

- `|` is written as `\|`
- a newline inside a cell is written as `<br>`
- a literal `\|` or `<br>` already present in a cell value is itself escaped so
  the transformation stays reversible

The Markdown parser reverses both. Any cell value must survive
CSV → Markdown → CSV byte-exact, and this is enforced by round-trip tests rather
than left to review.

No preference controls this. Offering `<br>` versus `\n` versus a space would
add configuration to a rare case and reintroduce a lossy option through the back
door.

## Consequences

- Markdown output can contain a small amount of HTML. GitHub-flavored Markdown
  renders `<br>` inside table cells correctly, so the output stays useful where
  Markdown tables are actually consumed.
- A strict CommonMark renderer that escapes raw HTML will show a literal
  `<br>`. Accepted: correctness of the user's data outranks purity of the
  generated Markdown.
- The escaping rules belong to the Markdown format module and must not leak into
  the document, the grid, or the CSV module.
- The reversibility requirement means escaping and unescaping change together,
  always with a test that asserts the round trip.
