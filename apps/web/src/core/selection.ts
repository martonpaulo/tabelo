import type { CellRect } from "./operations";

export interface CellPosition {
	readonly row: number;
	readonly column: number;
}

// "cell" is a free rectangle. "row" and "column" span the whole table on the
// other axis, which is what makes "delete the selected rows" unambiguous.
export type SelectionMode = "cell" | "row" | "column";

export interface GridSelection {
	readonly anchor: CellPosition;
	readonly focus: CellPosition;
	readonly mode: SelectionMode;
}

export function createSelection(
	position: CellPosition,
	mode: SelectionMode = "cell",
): GridSelection {
	return { anchor: position, focus: position, mode };
}

export function selectionRect(
	selection: GridSelection,
	rowCount: number,
	columnCount: number,
): CellRect {
	const top = Math.min(selection.anchor.row, selection.focus.row);
	const bottom = Math.max(selection.anchor.row, selection.focus.row);
	const left = Math.min(selection.anchor.column, selection.focus.column);
	const right = Math.max(selection.anchor.column, selection.focus.column);

	if (selection.mode === "row") {
		return { top, bottom, left: 0, right: Math.max(0, columnCount - 1) };
	}
	if (selection.mode === "column") {
		return { top: 0, bottom: Math.max(0, rowCount - 1), left, right };
	}
	return { top, bottom, left, right };
}

export function rectContains(
	rect: CellRect,
	row: number,
	column: number,
): boolean {
	return (
		row >= rect.top &&
		row <= rect.bottom &&
		column >= rect.left &&
		column <= rect.right
	);
}

export function rectRows(rect: CellRect): number[] {
	return Array.from(
		{ length: rect.bottom - rect.top + 1 },
		(_, index) => rect.top + index,
	);
}

export function rectColumns(rect: CellRect): number[] {
	return Array.from(
		{ length: rect.right - rect.left + 1 },
		(_, index) => rect.left + index,
	);
}

export interface StructureDeletionGuard {
	readonly wouldRemoveAllRows: boolean;
	readonly wouldRemoveAllColumns: boolean;
}

// Accept a list now so the deletion contract remains correct when selections
// gain multiple ranges. Sets count coverage, not overlap between ranges.
export function structureDeletionGuard(
	selections: readonly GridSelection[],
	rowCount: number,
	columnCount: number,
): StructureDeletionGuard {
	const rows = new Set<number>();
	const columns = new Set<number>();

	for (const selection of selections) {
		const rect = selectionRect(selection, rowCount, columnCount);
		for (const row of rectRows(rect)) rows.add(row);
		for (const column of rectColumns(rect)) columns.add(column);
	}

	return {
		wouldRemoveAllRows: rows.size >= rowCount,
		wouldRemoveAllColumns: columns.size >= columnCount,
	};
}

export function clampSelection(
	selection: GridSelection,
	rowCount: number,
	columnCount: number,
): GridSelection {
	const clamp = (position: CellPosition): CellPosition => ({
		row: Math.max(0, Math.min(position.row, rowCount - 1)),
		column: Math.max(0, Math.min(position.column, columnCount - 1)),
	});
	return {
		...selection,
		anchor: clamp(selection.anchor),
		focus: clamp(selection.focus),
	};
}
