import { readCell } from "@/core/cell-value";
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

function valueAt(document: TableDocument, position: CellPosition): CellValue {
	const column = document.columns[position.column];
	if (!column) return "";
	if (position.row === HEADER_ROW) return column.header;
	const row = document.rows[position.row];
	return row ? readCell(row, column.id) : "";
}

// Every cell in reading order: the header row first, then each data row, left
// to right, which is the order the find bar walks too.
function readingOrder(document: TableDocument): CellPosition[] {
	const positions: CellPosition[] = [];
	for (let row = HEADER_ROW; row < document.rows.length; row += 1) {
		for (let column = 0; column < document.columns.length; column += 1) {
			positions.push({ row, column });
		}
	}
	return positions;
}

const key = (position: CellPosition) => `${position.row}:${position.column}`;

export function nextMatchingCell(
	document: TableDocument,
	selection: GridSelection,
): MatchingCellStep {
	// The seed is where the gesture started: the first area's focus. Later
	// presses search on from the newest area, so each press adds the next one.
	const [first] = selection.ranges;
	if (!first) return { selection: null, selected: 0, total: 0 };
	const seed = valueAt(document, first.focus);
	const order = readingOrder(document);
	const matching = order.filter(
		(position) => valueAt(document, position) === seed,
	);

	const selectedCells = new Set(
		selection.ranges
			.filter(
				(range) =>
					range.mode === "cell" &&
					range.anchor.row === range.focus.row &&
					range.anchor.column === range.focus.column,
			)
			.map((range) => key(range.focus)),
	);
	const alreadySelected = matching.filter((position) =>
		selectedCells.has(key(position)),
	).length;

	const from = key(activeRange(selection).focus);
	const start = order.findIndex((position) => key(position) === from);
	for (let step = 1; step <= order.length; step += 1) {
		const candidate = order[(start + step) % order.length];
		if (!candidate || selectedCells.has(key(candidate))) continue;
		if (valueAt(document, candidate) !== seed) continue;
		return {
			selection: {
				ranges: [...selection.ranges, createRange(candidate, "cell")],
				activeIndex: selection.ranges.length,
			},
			selected: alreadySelected + 1,
			total: matching.length,
		};
	}
	return { selection: null, selected: alreadySelected, total: matching.length };
}
