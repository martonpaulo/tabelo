import { cellText, readCell } from "./cell-value";
import { type CellPosition, HEADER_ROW } from "./selection";
import type { TableDocument } from "./types";

// Jump-to-the-edge-of-the-data navigation, as one pure function over the
// document. It lives beside the document rather than in `selection.ts` because
// it is the one navigation rule that reads cell contents: `selection.ts` is
// deliberately coordinate-only and knows nothing about what a cell holds.

export type JumpDirection = "up" | "down" | "left" | "right";

// Navigation follows what the grid shows, not what the document canonically
// holds. `null` and the empty string project to the same empty cell (see
// `cellText`), and a jump that stopped at one but not the other would be
// invisible to the person pressing the key. This is a different question from
// `isBlankCell`, which guards destructive actions and must keep an explicit
// `null` distinct from nothing at all.
function hasContent(
	document: TableDocument,
	row: number,
	column: number,
): boolean {
	const columnAt = document.columns[column];
	if (!columnAt) return false;
	if (row === HEADER_ROW) return columnAt.header !== "";
	const rowAt = document.rows[row];
	if (!rowAt) return false;
	return cellText(readCell(rowAt, columnAt.id)) !== "";
}

// One rule, applied to a line of indices, all of which hold content-bearing
// cells. `from` is the origin, `step` is +1 or -1, and `last` is the index the
// line ends at in that direction.
//
// When the next cell continues a run the origin is already part of, the target
// is that run's far edge. Otherwise the run is over, or was never started, and
// the target is the first cell with content across the gap. When the gap runs
// to the end of the line, the target is the line's edge.
function runOrGapTarget(
	from: number,
	step: 1 | -1,
	last: number,
	filled: (index: number) => boolean,
): number {
	if (from === last) return from;
	const next = from + step;
	const beyond = last + step;

	if (filled(from) && filled(next)) {
		let edge = next;
		while (edge !== last && filled(edge + step)) edge += step;
		return edge;
	}

	for (let index = next; index !== beyond; index += step) {
		if (filled(index)) return index;
	}
	return last;
}

// The cell a data-edge jump lands on, always in range and never outside the
// grid. Returns `from` unchanged when there is nowhere to go.
export function dataEdgeTarget(
	document: TableDocument,
	from: CellPosition,
	direction: JumpDirection,
): CellPosition {
	const rowCount = document.rows.length;
	const columnCount = document.columns.length;
	if (columnCount === 0) return from;

	if (direction === "left" || direction === "right") {
		// The header row is an ordinary line horizontally: its cells hold the
		// column names, so a jump along it reads them the way it reads any row.
		const step = direction === "left" ? -1 : 1;
		const column = runOrGapTarget(
			from.column,
			step,
			step === -1 ? 0 : columnCount - 1,
			(index) => hasContent(document, from.row, index),
		);
		return { row: from.row, column };
	}

	// Vertically the header is a structural endpoint rather than the top of the
	// data: it is always present, so counting its text as part of a run would
	// make every column with a name behave as if its data started one row early.
	// It is the edge an upward jump lands on, and the row below it is where a
	// downward jump from it begins.
	if (rowCount === 0) return { row: HEADER_ROW, column: from.column };

	const filled = (index: number) => hasContent(document, index, from.column);

	if (direction === "up") {
		if (from.row <= 0) return { row: HEADER_ROW, column: from.column };
		const row = runOrGapTarget(from.row, -1, 0, filled);
		// Nothing above holds content, so the jump ran out of data and stops at
		// the table's own top edge.
		return {
			row: row === 0 && !filled(0) ? HEADER_ROW : row,
			column: from.column,
		};
	}

	if (from.row === HEADER_ROW) {
		for (let index = 0; index < rowCount; index += 1) {
			if (filled(index)) return { row: index, column: from.column };
		}
		return { row: rowCount - 1, column: from.column };
	}
	return {
		row: runOrGapTarget(from.row, 1, rowCount - 1, filled),
		column: from.column,
	};
}
