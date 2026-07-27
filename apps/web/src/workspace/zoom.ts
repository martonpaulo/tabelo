// How much a single pane scales the content it shows. This is a local
// presentation preference owned by the pane, never document state and never a
// history step: a pane keeps its density when the view inside it changes, and
// the preference disappears with the pane rather than following the view
// somewhere else.
//
// The ladder is bounded deliberately. Unbounded zoom-out would trade a density
// problem for a legibility one, so the floor stays at 80% of Tabelo's 14px
// content base — 11.2px — which is the smallest size still comfortable to read
// in a four-pane workspace. Browser zoom remains available on top of this and
// is what scales the chrome; this only scales what a pane displays.

export const PANE_ZOOM_LEVELS: readonly number[] = [
	0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5,
];

export const DEFAULT_PANE_ZOOM = 1;
export const MIN_PANE_ZOOM = PANE_ZOOM_LEVELS[0];
export const MAX_PANE_ZOOM = PANE_ZOOM_LEVELS[PANE_ZOOM_LEVELS.length - 1];

// Snaps to the nearest rung. A value arriving from storage, or from a ladder
// this version no longer has, still lands somewhere the buttons can move away
// from instead of being stuck between steps.
export function clampPaneZoom(zoom: number): number {
	if (!Number.isFinite(zoom)) return DEFAULT_PANE_ZOOM;
	return PANE_ZOOM_LEVELS.reduce((closest, level) =>
		Math.abs(level - zoom) < Math.abs(closest - zoom) ? level : closest,
	);
}

export function stepPaneZoom(zoom: number, direction: 1 | -1): number {
	const index = PANE_ZOOM_LEVELS.indexOf(clampPaneZoom(zoom)) + direction;
	return PANE_ZOOM_LEVELS[
		Math.min(Math.max(index, 0), PANE_ZOOM_LEVELS.length - 1)
	];
}

// The value assistive technology and the menu label both report.
export function paneZoomPercent(zoom: number): number {
	return Math.round(clampPaneZoom(zoom) * 100);
}
