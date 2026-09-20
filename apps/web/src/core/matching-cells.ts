import { cellValuesEqual, readCell } from "@/core/cell-value";
import {
	activeRange,
	type CellPosition,
	createRange,
	type GridSelection,
	HEADER_ROW,
} from "@/core/selection";
import type { CellValue, TableDocument } from "@/core/types";

// Mod+D in the grid (#361): add the next cell holding exactly the same value as
// the cell the gesture started from, the grid's counterpart of a source
// editor's next occurrence. "Exactly" means the same carried type and the same
// value, compared as values rather than as text, so a number 35 never matches
// the string "35" and nothing is case-folded: the owner chose the rule that
// cannot surprise.

export interface MatchingCellStep {
	// The selection with the next matching cell added as the newest area, or
	// null when every matching cell is already selected.
	readonly selection: GridSelection | null;
	// How many matching cells the resulting selection holds, and how many the
	// table holds in total, for the "n of m" announcement.
	readonly selected: number;
	readonly total: number;
}

function valueAt(
	document: TableDocument,
	rowIndex: number,
	columnIndex: number,
): CellValue {
	const column = document.columns[columnIndex];
	if (!column) return "";
	if (rowIndex === HEADER_ROW) return column.header;
	const row = document.rows[rowIndex];
	return row ? readCell(row, column.id) : "";
}

// Reading order: the header row first, then each data row, left to right, which
// is the order the find bar walks too. It is an arithmetic order rather than a
// materialized list, so a cell's place is computed from its coordinates and
// back again. The header row is `HEADER_ROW`, which is -1, so every row sits
// one place further down than its index.
function orderIndex(document: TableDocument, position: CellPosition): number {
	const columnCount = document.columns.length;
	if (position.column < 0 || position.column >= columnCount) return -1;
	if (position.row < HEADER_ROW || position.row >= document.rows.length) {
		return -1;
	}
	return (position.row - HEADER_ROW) * columnCount + position.column;
}

export function nextMatchingCell(
	document: TableDocument,
	selection: GridSelection,
): MatchingCellStep {
	// The seed is where the gesture started: the first area's focus. Later
	// presses search on from the newest area, so each press adds the next one.
	const [first] = selection.ranges;
	if (!first) return { selection: null, selected: 0, total: 0 };
	const seed = valueAt(document, first.focus.row, first.focus.column);
	const columnCount = document.columns.length;
	const cellCount = (document.rows.length + 1) * columnCount;

	// The single cells already selected, held by their place in reading order so
	// the membership test is a number rather than a string built per test. A
	// focus outside the table has no place, and nothing ever looks one up.
	const selectedCells = new Set<number>();
	for (const range of selection.ranges) {
		if (range.mode !== "cell") continue;
		if (range.anchor.row !== range.focus.row) continue;
		if (range.anchor.column !== range.focus.column) continue;
		const index = orderIndex(document, range.focus);
		if (index !== -1) selectedCells.add(index);
	}

	let total = 0;
	let alreadySelected = 0;
	let place = 0;
	for (let row = HEADER_ROW; row < document.rows.length; row += 1) {
		for (let column = 0; column < columnCount; column += 1) {
			if (cellValuesEqual(valueAt(document, row, column), seed)) {
				total += 1;
				if (selectedCells.has(place)) alreadySelected += 1;
			}
			place += 1;
		}
	}

	// A focus the table does not hold reports -1, so the walk starts at the
	// first cell, which is where scanning a list for it left it too.
	const start = orderIndex(document, activeRange(selection).focus);
	for (let step = 1; step <= cellCount; step += 1) {
		const index = (start + step) % cellCount;
		if (selectedCells.has(index)) continue;
		const row = Math.floor(index / columnCount) + HEADER_ROW;
		const column = index % columnCount;
		if (!cellValuesEqual(valueAt(document, row, column), seed)) continue;
		return {
			selection: {
				ranges: [...selection.ranges, createRange({ row, column }, "cell")],
				activeIndex: selection.ranges.length,
			},
			selected: alreadySelected + 1,
			total,
		};
	}
	return { selection: null, selected: alreadySelected, total };
}
