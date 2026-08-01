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

The floor has moved twice, and the second move is worth recording rather than
hiding. `single`, an eighth preset spanning all four slots, was first dropped on
the argument that the workspace exists to show one document through several
views at once, so a one-pane workspace is that product with its point removed.
That confused the product's **default** with its **range**: a user reading a
wide table wants the whole window for it, and denying that does not make the
synchronization more visible, it just makes the app smaller than the screen.
#91 restored the preset. One pane is the floor, two panes is what a fresh visit
opens, and the difference between those two sentences is the whole decision.

## Decision

Eight named presets, each drawing its own shape in the picker: one pane, two
columns, two rows, split left, split right, split top, split bottom, and four
panes. Choosing one is a single click, and the glyph shows the result before it
is applied.

One pane is expressed as a preset spanning all four slots, not as a pane count
with no preset. Splitting, shrinking, and the persisted schema all read the
shapes a layout declares, so a preset keeps every one of them working unchanged,
where a count would need its own branch in each.

Every preset is a valid tiling by construction, so no rule needs enforcing at
runtime and no invalid intermediate state exists. Tests assert the invariant
directly: each preset covers all four slots exactly once, and every pane is a
rectangle.

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

Pane count is also changed directly. **Close view** stays in the pane's own
menu. **Adding** a view moved out of that menu and onto the pane edge it would
split, because the edge is what decides where the new pane lands and a menu
item cannot say which edge it means.

A control appears at the centre of every pane edge whose split produces another
valid preset. Pointer hover reveals it only inside that narrow edge band, never
from hovering the pane content:

| From | Split | To |
| :--- | :--- | :--- |
| One pane | its right edge | Two columns |
| One pane | its bottom edge | Two rows |
| Two columns | left pane | Split left |
| Two columns | right pane | Split right |
| Two rows | top pane | Split top |
| Two rows | bottom pane | Split bottom |
| Split left, right, top, or bottom | the large pane | Four panes |
| Four panes | none | no control shown |

The set is **derived, not tabulated**: halving a pane replaces its shape with
the two halves, and the target is whichever preset holds the shapes that
leaves. A preset gains its entries the moment it exists. This replaced a single
larger target per layout, which could not express two columns reaching both
split left and split right depending on which pane is cut.

A pane is cut across each axis it spans whole, so every control lands on an
**outer** edge of the workspace. None sits on the divider between two panes, so
which pane is being split is never ambiguous, and the edge doubles as the
promise of where the new pane appears. The one-pane preset is the only one whose
pane spans both axes, so it is the only pane carrying two controls, and the edge
is what says which of its two splits the user asked for.

The view the new pane shows is chosen **before** anything moves, so the split
and the view are one update and no workspace holding a pane with an unchosen
view is ever rendered. This retired the old two-step flow, which added a pane on
a guessed view and then handed its menu the focus so the guess could be
corrected. `FILL_ORDER` still fills panes that a **layout change** creates,
where nobody was asked.

Closing removes the chosen pane rather than the last one; the smaller preset
then absorbs the freed space into whichever neighbour already occupied part of
it.

One pane is the floor, so only `single` has no smaller target, and Close view is
disabled there alone, with a written reason rather than hidden. Both two-pane
presets shrink to it, because either divider disappearing leaves the same
whole-grid shape. The one preset the picker can reach that growing cannot,
`top-split`, shrinks to `rows`: a top split reads as a horizontal division, and
keeping that division on the way down matters more than keeping one pane's
corner.

Growing never displaces a pane, so adding one needs no confirmation. Closing
can destroy a source draft the document has not read back, so a pane owning
uncommitted text asks first, through the same notice used when a view change
would displace a draft.

Split ratios are stored per axis and the resize handle appears only when the
layout actually splits that axis, derived from the preset rather than listed,
so a new preset needs no edit there.

## Consequences

- The layout control is one menu of seven pictures, with nothing to learn, and
  it is the advanced path rather than the only one: adding or closing a view
  needs no understanding of layout names at all.
- The preset set survives unchanged, but the way a user moves between presets
  changed completely. Growing is now a direct manipulation of the edge that
  will be split, so the arrangement is a result of where the user pointed
  rather than a name they had to recognise first.
- The edge controls are revealed by edge hover, which §9 forbids depending on
  alone, so each is an ordinary tab stop at the **workspace** level of the two-level
  keyboard ring, named after both the pane and the direction: a bare "Add view"
  repeated on every pane would name nothing.
- Growing can no longer reach `top-split` or `bottom-split` from `columns`, nor
  `left-split` or `right-split` from `rows`, because a split preserves the
  divider the current preset already has. Reaching those is the layout picker's
  job, which is what keeps it rather than retiring it with the add flow.
- Invalid layouts are unrepresentable, so there is no validation to write and
  no error state to design: including for the direct commands, which can only
  move between presets.
- Two of the four three-pane presets, `right-split` and `bottom-split`, have
  no four-pane preset that preserves every corner, because `quad` is the only
  one. Growing from those moves one surviving pane. Shrinking is
  corner-stable everywhere except `top-split → rows`, which moves the pane in
  the top-right slot.
- A one-pane workspace is reachable but is not where anyone starts: a fresh
  visit still opens two columns, so the default keeps showing the
  synchronization that is the product, and the user closes down to one when
  they want the window to themselves.
- At one pane there is no divider, so no resize handle renders on either axis,
  and the stored ratios are kept rather than reset: widening back out restores
  the split the user had.
- Below the stacking width one pane is the degenerate case of a single column
  rather than a new branch, so stacking needed no change at all.
- The cost is expressiveness: a user cannot invent an arrangement that is not
  in the list. With a 2×2 grid the presets cover every rectangular tiling that
  respects the constraint, so this costs nothing today. A 3×3 workspace
  would make enumeration untenable and force this decision open again.
- Below 56.25rem the panes stack and the layout is remembered rather than
  discarded, so a narrow window does not silently rewrite the user's choice.
