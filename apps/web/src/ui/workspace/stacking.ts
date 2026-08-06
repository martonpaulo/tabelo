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
// Matched once. `isStacked` is a `useSyncExternalStore` snapshot, so React
// calls it on every render of every subscriber; allocating a fresh
// MediaQueryList there put a live listener target on the heap per render for a
// value that never changes. The browser keeps this one up to date by itself.
const mediaQuery =
	typeof window === "undefined" || !window.matchMedia
		? null
		: window.matchMedia(QUERY);

function subscribe(onChange: () => void): () => void {
	if (!mediaQuery) return () => {};
	mediaQuery.addEventListener("change", onChange);
	return () => mediaQuery.removeEventListener("change", onChange);
}

function isStacked(): boolean {
	return mediaQuery?.matches ?? false;
}

// Read synchronously on first render, so a narrow window never paints the wide
// tiling first and rearranges itself.
export function useStackedWorkspace(): boolean {
	return useSyncExternalStore(subscribe, isStacked, () => false);
}
