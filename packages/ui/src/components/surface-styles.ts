// One edge, one stroke.
//
// A rounded surface draws its boundary with a `border`, never with a `ring`.
// A ring is a box-shadow painted behind the element, so the background's own
// antialiased corner eats into it: the arc comes out thinner and softer than
// the straight edges, which is what "badly drawn corners" looks like. A border
// is part of the box, so the browser computes the inner and outer radii
// together and the corner stays one clean arc.
//
// A state changes the colour of that one stroke. It never adds a second one:
// two strokes at slightly different radii is exactly how a corner ends up
// looking doubled.
//
// The stroke itself is painted by the `tabelo-hairline` utility rather than by
// the border colour, because a hairline border loses roughly half its colour
// along a curve on a one-device-pixel display. The utility takes the surface
// and the boundary as two custom properties. See docs/design-system.md §2.

export const hairlineStyles = "tabelo-hairline border";

// Menus, tooltips, dialogs, and notices: a soft boundary over the floating
// surface, set apart from what it covers by a deep two-layer shadow
// (owner, 2026-09-19).
export const floatingSurfaceStyles = `${hairlineStyles} [--hairline-color:var(--line-floating)] [--hairline-fill:var(--popover)] shadow-[0_0.75rem_2rem_rgb(0_0_0/0.55),0_0.125rem_0.375rem_rgb(0_0_0/0.4)]`;

// The same treatment for a surface that sits in the layout rather than over
// it: the subtle boundary and no shadow.
export const panelSurfaceStyles = `${hairlineStyles} [--hairline-color:var(--line-pane)] [--hairline-fill:var(--surface-panel)]`;

// A panel that is the active one of several. Only the boundary colour changes.
export const activePanelSurfaceStyles =
	"[--hairline-color:var(--active-pane-edge)]";
