import { useSyncExternalStore } from "react";

// Below this width the 2x2 tiling stops being readable: a pane sharing the
// width of a phone is a sliver, not a table. See docs/design-system.md §5.
export const STACK_BELOW_REM = 56.25;

const QUERY = `(max-width: ${STACK_BELOW_REM - 0.0625}rem)`;

// Stacking is decided in JavaScript rather than by a media query alone because
// the desktop tiling is expressed as inline grid areas, and an inline
// `grid-area` naming column 2 creates an implicit second column no matter what
// the container's template says. The presentation has to stop being emitted,
// not be overridden.
function subscribe(onChange: () => void): () => void {
	if (typeof window === "undefined" || !window.matchMedia) return () => {};
	const query = window.matchMedia(QUERY);
	query.addEventListener("change", onChange);
	return () => query.removeEventListener("change", onChange);
}

function isStacked(): boolean {
	if (typeof window === "undefined" || !window.matchMedia) return false;
	return window.matchMedia(QUERY).matches;
}

// Read synchronously on first render, so a narrow window never paints the wide
// tiling first and rearranges itself.
export function useStackedWorkspace(): boolean {
	return useSyncExternalStore(subscribe, isStacked, () => false);
}
