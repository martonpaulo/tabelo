// A rectangle of grid coordinates. It lives here rather than beside the
// operations that consume it because its coordinate space, including the header
// row below zero, is the selection's to define.
export interface CellRect {
	readonly top: number;
	readonly left: number;
	readonly bottom: number;
	readonly right: number;
}

// The header row's coordinate. Every table has exactly one header row, and it
// sits above `document.rows[0]`, so it needs an index of its own to be
// addressable at all. A sentinel below zero was chosen over renumbering the
// data rows to 1-based: renumbering would touch every operation, every test,
// and the aria-rowindex arithmetic, while this is one value the primitives
// clamp against.
export const HEADER_ROW = -1;

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
	// A column is its header plus its cells, so selecting one reaches the header
	// row. That is what makes Mod+A, which selects every column, cover the whole
	// table rather than only its body.
	if (selection.mode === "column") {
		return { top: HEADER_ROW, bottom: Math.max(0, rowCount - 1), left, right };
	}
	return { top, bottom, left, right };
}

// The data rows a rect covers, with the header row dropped. Operations that act
// on rows as structure use this, because the header row is structurally
// required and is never one of the rows they may remove or duplicate.
export function rectDataRows(rect: CellRect): number[] {
	return rectRows(rect).filter((row) => row !== HEADER_ROW);
}

export function rectCoversHeader(rect: CellRect): boolean {
	return rect.top === HEADER_ROW;
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
		// Only data rows count: the header row is never a candidate for removal,
		// so covering it must not make a selection look like it covers everything.
		for (const row of rectDataRows(rect)) rows.add(row);
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
	// The floor is the header row, not row 0: a selection sitting on the header
	// survives a document change that shrank the rows underneath it.
	const clamp = (position: CellPosition): CellPosition => ({
		row: Math.max(HEADER_ROW, Math.min(position.row, rowCount - 1)),
		column: Math.max(0, Math.min(position.column, columnCount - 1)),
	});
	return {
		...selection,
		anchor: clamp(selection.anchor),
		focus: clamp(selection.focus),
	};
}
