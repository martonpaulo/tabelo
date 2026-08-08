// Column widths are persisted workspace preferences keyed by stable column id.
// Pointer, keyboard, and Fit all pass through this arithmetic so they cannot
// disagree about bounds or stored rem precision.

export const DEFAULT_COLUMN_WIDTH = 10.5;
export const MIN_COLUMN_WIDTH = 4.5;
// One column may be deliberately wide, but Fit must not turn an exceptionally
// long opaque value into an effectively unbounded table. At the base root size
// this permits 1024px of content before horizontal scrolling takes over.
export const MAX_COLUMN_WIDTH = 64;
export const COLUMN_WIDTH_STEP = 1.5;
export const COLUMN_WIDTH_TOLERANCE = 1 / 32;

export function resolveColumnWidth(width: number | undefined): number {
	return width ?? DEFAULT_COLUMN_WIDTH;
}

export function clampColumnWidth(width: number): number {
	// Keep stored values stable at one sixteenth of a rem without turning screen
	// pixels into persisted layout units.
	return Math.min(
		MAX_COLUMN_WIDTH,
		Math.max(MIN_COLUMN_WIDTH, Math.round(width * 16) / 16),
	);
}

export function stepColumnWidth(
	width: number | undefined,
	direction: 1 | -1,
): number {
	return clampColumnWidth(
		resolveColumnWidth(width) + direction * COLUMN_WIDTH_STEP,
	);
}

export function fitColumnWidth(
	contentWidthPx: number,
	rootFontSizePx: number,
	paneZoom: number,
	decorationWidthPx: number,
): number | undefined {
	if (
		![contentWidthPx, rootFontSizePx, paneZoom, decorationWidthPx].every(
			Number.isFinite,
		) ||
		contentWidthPx < 0 ||
		rootFontSizePx <= 0 ||
		paneZoom <= 0 ||
		decorationWidthPx < 0
	)
		return undefined;

	// Text is pane content, so its DOM measurement already contains zoom. Cell
	// padding and the boundary are interface geometry and stay unscaled. Removing
	// zoom from only the text term gives the same stored rem width in every pane.
	return clampColumnWidth(
		contentWidthPx / (rootFontSizePx * paneZoom) +
			decorationWidthPx / rootFontSizePx,
	);
}

export function isSameColumnWidth(
	left: number | undefined,
	right: number,
): boolean {
	return Math.abs(resolveColumnWidth(left) - right) <= COLUMN_WIDTH_TOLERANCE;
}

export function atMinimumColumnWidth(width: number | undefined): boolean {
	return resolveColumnWidth(width) <= MIN_COLUMN_WIDTH + COLUMN_WIDTH_TOLERANCE;
}

export function atMaximumColumnWidth(width: number | undefined): boolean {
	return resolveColumnWidth(width) >= MAX_COLUMN_WIDTH - COLUMN_WIDTH_TOLERANCE;
}
