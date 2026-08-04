// One edge, one stroke.
//
// A rounded surface draws its boundary with a `border`, never with a `ring`.
// A ring is a box-shadow painted behind the element, so the background's own
// antialiased corner eats into it: the arc comes out thinner and softer than
// the straight edges, which is what "badly drawn corners" looks like. A border
// is part of the box, so the browser computes the inner and outer radii
// together and the corner stays one clean arc. `bg-clip-padding` keeps a
// translucent background from painting under that border and muddying it.
//
// A state changes the colour of that one stroke. It never adds a second one:
// two strokes at slightly different radii is exactly how a corner ends up
// looking doubled. See docs/design-system.md §2.

export const floatingSurfaceStyles =
	"border border-line-floating bg-clip-padding shadow-xl";
