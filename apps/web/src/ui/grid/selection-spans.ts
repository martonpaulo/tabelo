import type { CellRect } from "@/core/selection";

// How a row's membership of the selected and copied regions crosses the grid's
// memo boundary. A row may sit inside several regions at once, and an array of
// them would be a new object on every render of the grid, which is exactly
// what the boundary exists to avoid: the encoding is a primitive, so a row
// outside every region keeps the same value and is reconciled away.
//
// Pure arithmetic over coordinates, so it lives beside the grid rather than
// inside the component, where it can be tested on its own.

// The selected column spans of one row, as `left:right` pairs.
export function spansOf(rects: readonly CellRect[], row: number): string {
	return rects
		.filter((rect) => row >= rect.top && row <= rect.bottom)
		.map((rect) => `${rect.left}:${rect.right}`)
		.join(",");
}

// The same spans as a flat list of bounds, `[left, right, left, right, ...]`.
// The string is what has to cross the boundary; splitting and parsing it again
// for every membership test, six times per cell, is what the row would
// otherwise pay for it. Decoded once per row instead: 1.1161 ms to 0.0313 ms
// over a 200 by 8 table.
export function decodeSpans(spans: string): number[] {
	if (spans === "") return [];
	const bounds: number[] = [];
	for (const span of spans.split(",")) {
		const [left, right] = span.split(":");
		if (left === undefined || right === undefined) continue;
		bounds.push(Number(left), Number(right));
	}
	return bounds;
}

// Whether the decoded spans cover one column of their row.
export function coveredBySpans(
	bounds: readonly number[],
	column: number,
): boolean {
	for (let index = 0; index < bounds.length; index += 2) {
		const left = bounds[index];
		const right = bounds[index + 1];
		if (left === undefined || right === undefined) continue;
		if (column >= left && column <= right) return true;
	}
	return false;
}
