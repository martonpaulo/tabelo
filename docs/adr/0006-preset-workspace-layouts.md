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
: giving the grid the whole window: was an existing feature. Expressed in
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

Switching layouts carries pane identities and view choices across, so changing
the shape never resets what the user was looking at. Each position of the new
layout first claims the pane that already starts in its top-left slot; panes
with no matching position fill what is left in reading order. Position-first
rather than order-first is what keeps a pane visually still when the shape
around it changes. Pane identifiers belong to the application and do not encode
slots or array positions. When a smaller preset cannot retain every pane, the
pane owning a source draft is retained first so pending work stays reachable.
Panes a larger layout adds are filled from a fixed preference order: grid,
Markdown, CSV, preview: skipping any view the workspace already shows, so a
pane the workspace gains shows something new.

A registered view may appear in only one pane. The view picker keeps views that
another pane already shows visible but disabled, so the available set and the
reason a choice cannot be made remain understandable. The workspace schema
enforces the same invariant at the persistence boundary. This removes duplicate
projections without coupling synchronization to pane layout or view identity.

Pane count is also changed directly, from the pane the user is working in:
**Add view** and **Close view** in that pane's menu. Both are expressed as moves
between these same presets: `single → columns → left-split → quad` growing,
and the reverse shrinking, with `rows → bottom-split` covering the horizontal
branch. A direct action can never reach a shape the picker cannot, and both
routes share one implementation. The targets are chosen to be the preset that
leaves the most surviving panes in the slot they already had. Closing removes
the chosen pane rather than the last one; the smaller preset then absorbs the
freed space into whichever neighbour already occupied part of it.

Growing never displaces a pane, so **Add view** needs no confirmation. Closing
can destroy a source draft the document has not read back, so a pane owning
uncommitted text asks first, through the same notice used when a view change
would displace a draft.

Split ratios are stored per axis and the resize handle appears only when the
layout actually splits that axis, derived from the preset rather than listed,
so a new preset needs no edit there.

## Consequences

- The layout control is one menu of eight pictures, with nothing to learn, and
  it is the advanced path rather than the only one: adding or closing a view
  needs no understanding of layout names at all.
- Invalid layouts are unrepresentable, so there is no validation to write and
  no error state to design: including for the direct commands, which can only
  move between presets.
- Two of the eight three-pane presets, `right-split` and `bottom-split`, have
  no four-pane preset that preserves every corner, because `quad` is the only
  one. Growing from those moves one surviving pane. Shrinking is always
  corner-stable.
- The cost is expressiveness: a user cannot invent an arrangement that is not
  in the list. With a 2×2 grid the presets cover every rectangular tiling that
  respects the constraint, so this costs nothing today. A 3×3 workspace
  would make enumeration untenable and force this decision open again.
- Below 56.25rem the panes stack and the layout is remembered rather than
  discarded, so a narrow window does not silently rewrite the user's choice.
