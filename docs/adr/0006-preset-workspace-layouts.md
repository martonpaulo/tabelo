# Offer preset workspace layouts instead of free slot assignment

## Context

The workspace is a 2×2 grid of slots, and a view may occupy one slot, two
horizontally adjacent slots, or two vertically adjacent slots. Expressed
literally, that is a slot-assignment problem: the user picks a view for each
slot and decides where spans go.

Built that way it needs a mode. Something has to show the empty slots, let a
pane be extended into a neighbour, prevent an L-shape, and explain why a
particular merge is not allowed. That is a layout editor, and a layout editor
inside a table utility is precisely the "complex IDE" the product is supposed
not to become.

There is also a constraint the literal reading misses. Hiding the source panel
— giving the grid the whole window — was an existing feature. Expressed in
slots it is one view across all four, which the stated rule does not allow.

## Decision

Eight named presets, each drawing its own shape in the picker: single, two
columns, two rows, split left, split right, split top, split bottom, and four
panes. Choosing one is a single click, and the glyph shows the result before it
is applied.

Every preset is a valid tiling by construction, so no rule needs enforcing at
runtime and no invalid intermediate state exists. Tests assert the invariant
directly: each preset covers all four slots exactly once, and every pane is a
rectangle.

`single` intentionally spans all four slots. This extends the stated rule
rather than following it, because it preserves the existing full-width grid.
The rule's purpose is to prevent L-shapes and overlaps, and a full-workspace
pane violates neither.

Switching layouts carries pane identities and view choices across in reading
order, so changing the shape never resets what the user was looking at. Pane
identifiers belong to the application and do not encode slots or array
positions. When a smaller preset cannot retain every pane, the pane owning a
source draft is retained first so pending work stays reachable. Panes a larger
layout adds are filled from a fixed preference order — grid, Markdown, CSV,
preview.

Split ratios are stored per axis and the resize handle appears only when the
layout actually splits that axis, derived from the preset rather than listed,
so a new preset needs no edit there.

## Consequences

- The layout control is one menu of eight pictures, with nothing to learn.
- Invalid layouts are unrepresentable, so there is no validation to write and
  no error state to design.
- The cost is expressiveness: a user cannot invent an arrangement that is not
  in the list. With a 2×2 grid the presets cover every rectangular tiling that
  respects the constraint, so this costs nothing today — but a 3×3 workspace
  would make enumeration untenable and force this decision open again.
- Below 900px the panes stack and the layout is remembered rather than
  discarded, so a narrow window does not silently rewrite the user's choice.
