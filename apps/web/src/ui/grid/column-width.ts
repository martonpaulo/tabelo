// Column width is presentation, not document content, but it is still
// something the user has to be able to change without a pointing device. The
// drag handle and the column menu both work from these numbers so a dragged
// column and a stepped one cannot end up with different floors.

export const DEFAULT_COLUMN_WIDTH = 168;
export const MIN_COLUMN_WIDTH = 72;
// Wide enough that a step is visible in one press, small enough that landing
// on a particular width takes a few presses rather than luck.
export const COLUMN_WIDTH_STEP = 24;

export function resolveColumnWidth(width: number | undefined): number {
	return width ?? DEFAULT_COLUMN_WIDTH;
}

// Steps from wherever the column is now, including from the untouched default,
// and stops at the floor rather than collapsing the column to nothing.
export function stepColumnWidth(
	width: number | undefined,
	direction: 1 | -1,
): number {
	const next = resolveColumnWidth(width) + direction * COLUMN_WIDTH_STEP;
	return Math.max(MIN_COLUMN_WIDTH, Math.round(next));
}

export function clampColumnWidth(width: number): number {
	return Math.max(MIN_COLUMN_WIDTH, Math.round(width));
}

export function isDefaultColumnWidth(width: number | undefined): boolean {
	return width === undefined || width === DEFAULT_COLUMN_WIDTH;
}

export function atMinimumColumnWidth(width: number | undefined): boolean {
	return resolveColumnWidth(width) <= MIN_COLUMN_WIDTH;
}
