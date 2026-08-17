import { readCell } from "./cell-value";
import { createColumn, createRow } from "./document";
import { createRowId } from "./ids";
import { type CellRect, rectContains, rectCoversHeader } from "./selection";
import type {
	Alignment,
	CellValue,
	Column,
	ColumnId,
	Row,
	TableDocument,
} from "./types";

// Pure operations over a table document. Every grid interaction goes through
// one of these: the grid never mutates the document itself.
//
// A table always keeps at least one column and one row, so the editor never
// reaches a state with nothing to click on.

function withRows(
	document: TableDocument,
	rows: readonly Row[],
): TableDocument {
	return {
		columns: document.columns,
		rows: rows.length > 0 ? rows : [createRow(document.columns)],
	};
}

function sortedDesc(indices: readonly number[]): number[] {
	return [...new Set(indices)].sort((a, b) => b - a);
}

export interface ContiguousBlock {
	readonly from: number;
	readonly count: number;
}

// The `offset` a block move needs to land on an insertion boundary.
//
// A boundary counts the items that stay before the block, in the list's own
// coordinates: 0 is "before everything" and `items.length` is "after
// everything". That is what a pointer drop resolves to, because a drop names a
// gap between two items rather than an item. `Alt`+arrow names an offset
// directly and does not come through here.
//
// Two corrections make the arithmetic right. A boundary past the block's start
// is expressed in coordinates that still count the block itself, so the block's
// own length comes back off once it is lifted out. And a boundary anywhere
// inside the block, its two edges included, describes the arrangement the list
// is already in, so it moves nothing rather than drifting by the block length.
export function blockMoveOffset(
	boundary: number,
	block: ContiguousBlock,
): number {
	const { from, count } = block;
	if (boundary >= from && boundary <= from + count) return 0;
	const to = boundary < from ? boundary : boundary - count;
	return to - from;
}

// `from` names the block's current start, while `offset` names where that
// start lands in the final list. Removing the whole block before reinserting
// it keeps downward and rightward moves from drifting by the block's length.
function moveBlock<T>(
	items: readonly T[],
	block: ContiguousBlock,
	offset: number,
): readonly T[] {
	const { from, count } = block;
	const to = from + offset;
	if (
		!Number.isInteger(from) ||
		!Number.isInteger(count) ||
		!Number.isInteger(offset) ||
		count < 1 ||
		offset === 0 ||
		from < 0 ||
		from + count > items.length ||
		to < 0 ||
		to + count > items.length
	) {
		return items;
	}

	const moved = items.slice(from, from + count);
	const remaining = [...items.slice(0, from), ...items.slice(from + count)];
	return [...remaining.slice(0, to), ...moved, ...remaining.slice(to)];
}

export function setCell(
	document: TableDocument,
	rowIndex: number,
	columnIndex: number,
	value: CellValue,
): TableDocument {
	const row = document.rows[rowIndex];
	const column = document.columns[columnIndex];
	if (!row || !column) return document;
	// Identity, not text: writing the string "1" over the number 1 is a real
	// change even though both project to the same text.
	if (readCell(row, column.id) === value) return document;

	const rows = document.rows.map((candidate, index) =>
		index === rowIndex
			? { ...candidate, cells: { ...candidate.cells, [column.id]: value } }
			: candidate,
	);
	return { ...document, rows };
}

export function setHeader(
	document: TableDocument,
	columnIndex: number,
	header: string,
): TableDocument {
	const column = document.columns[columnIndex];
	if (!column || column.header === header) return document;
	const columns = document.columns.map((candidate, index) =>
		index === columnIndex ? { ...candidate, header } : candidate,
	);
	return { ...document, columns };
}

export function setAlignment(
	document: TableDocument,
	columnIndex: number,
	align: Alignment,
): TableDocument {
	const column = document.columns[columnIndex];
	if (!column || column.align === align) return document;
	const columns = document.columns.map((candidate, index) =>
		index === columnIndex ? { ...candidate, align } : candidate,
	);
	return { ...document, columns };
}

export function insertRows(
	document: TableDocument,
	atIndex: number,
	count = 1,
): TableDocument {
	const index = Math.max(0, Math.min(atIndex, document.rows.length));
	const created = Array.from({ length: count }, () =>
		createRow(document.columns),
	);
	const rows = [
		...document.rows.slice(0, index),
		...created,
		...document.rows.slice(index),
	];
	return withRows(document, rows);
}

export function deleteRows(
	document: TableDocument,
	indices: readonly number[],
): TableDocument {
	const remove = new Set(indices);
	if (remove.size === 0) return document;
	const rows = document.rows.filter((_, index) => !remove.has(index));
	return withRows(document, rows);
}

export function duplicateRows(
	document: TableDocument,
	indices: readonly number[],
): TableDocument {
	if (indices.length === 0) return document;
	const rows = [...document.rows];
	// Descending so each splice leaves the remaining indices valid.
	for (const index of sortedDesc(indices)) {
		const source = rows[index];
		if (!source) continue;
		rows.splice(index + 1, 0, {
			id: createRowId(),
			cells: { ...source.cells },
		});
	}
	return withRows(document, rows);
}

export function moveRows(
	document: TableDocument,
	block: ContiguousBlock,
	offset: number,
): TableDocument {
	const rows = moveBlock(document.rows, block, offset);
	if (rows === document.rows) return document;
	return { ...document, rows };
}

export function insertColumns(
	document: TableDocument,
	atIndex: number,
	count = 1,
): TableDocument {
	const index = Math.max(0, Math.min(atIndex, document.columns.length));
	// A new column has no name until the user gives it one. Its identity comes
	// from the column index strip, so there is nothing to invent here.
	const created = Array.from({ length: count }, () => createColumn(""));
	const columns = [
		...document.columns.slice(0, index),
		...created,
		...document.columns.slice(index),
	];
	const rows = document.rows.map((row) => {
		const cells: Record<ColumnId, CellValue> = { ...row.cells };
		for (const column of created) cells[column.id] = "";
		return { ...row, cells };
	});
	return { columns, rows };
}

export function deleteColumns(
	document: TableDocument,
	indices: readonly number[],
): TableDocument {
	const remove = new Set(indices);
	if (remove.size === 0) return document;

	const kept = document.columns.filter((_, index) => !remove.has(index));
	const columns = kept.length > 0 ? kept : [createColumn("")];
	const removedIds = document.columns
		.filter((_, index) => remove.has(index))
		.map((c) => c.id);

	const rows = document.rows.map((row) => {
		const cells: Record<ColumnId, CellValue> = { ...row.cells };
		for (const id of removedIds) delete cells[id];
		// Only a key that is absent gets one. `??=` would overwrite a stored
		// `null`, which is a value the user chose rather than a missing cell.
		for (const column of columns) {
			if (cells[column.id] === undefined) cells[column.id] = "";
		}
		return { ...row, cells };
	});
	return { columns, rows };
}

export function duplicateColumns(
	document: TableDocument,
	indices: readonly number[],
): TableDocument {
	if (indices.length === 0) return document;

	const columns = [...document.columns];
	const copies: { source: ColumnId; created: Column }[] = [];
	for (const index of sortedDesc(indices)) {
		const source = columns[index];
		if (!source) continue;
		const created = {
			...createColumn(source.header),
			align: source.align,
			expectedType: source.expectedType,
		};
		columns.splice(index + 1, 0, created);
		copies.push({ source: source.id, created });
	}

	const rows = document.rows.map((row) => {
		const cells: Record<ColumnId, CellValue> = { ...row.cells };
		for (const { source, created } of copies)
			cells[created.id] = readCell(row, source);
		return { ...row, cells };
	});
	return { columns, rows };
}

export function moveColumns(
	document: TableDocument,
	block: ContiguousBlock,
	offset: number,
): TableDocument {
	const columns = moveBlock(document.columns, block, offset);
	if (columns === document.columns) return document;
	return { ...document, columns };
}

// Clears whatever the rects cover, header text included. A header cell is an
// ordinary cell for this purpose, so one Backspace over a selection that spans
// the boundary is one operation and therefore one undo step. An emptied header
// stays empty: nothing regenerates a name for it.
//
// A list rather than one rect, because a selection may hold several regions.
// They are cleared together, and a cell two of them both cover is cleared once:
// this is one operation and one undo step whatever shape the selection has.
export function clearCells(
	document: TableDocument,
	rects: readonly CellRect[],
): TableDocument {
	const coversHeader = (index: number) =>
		rects.some(
			(rect) =>
				rectCoversHeader(rect) && index >= rect.left && index <= rect.right,
		);
	const covers = (rowIndex: number, columnIndex: number) =>
		rects.some((rect) => rectContains(rect, rowIndex, columnIndex));

	let changed = false;
	const columns = document.columns.map((column, index) => {
		if (!coversHeader(index) || column.header === "") return column;
		changed = true;
		return { ...column, header: "" };
	});

	const rows = document.rows.map((row, rowIndex) => {
		// A cleared cell becomes the empty string whatever it held, so clearing a
		// number or an explicit `null` is a real change the comparison must see.
		const cleared = document.columns.filter(
			(column, columnIndex) =>
				covers(rowIndex, columnIndex) && readCell(row, column.id) !== "",
		);
		if (cleared.length === 0) return row;
		changed = true;
		const cells: Record<ColumnId, CellValue> = { ...row.cells };
		for (const column of cleared) cells[column.id] = "";
		return { ...row, cells };
	});
	return changed ? { columns, rows } : document;
}

// Writes a matrix starting at non-negative data-row and column indexes,
// growing the table when the payload runs past its current edges. Selection
// sentinels are converted by the caller. Pasting is a primary way to build a
// table here, so it must never silently truncate.
export function pasteMatrix(
	document: TableDocument,
	at: { rowIndex: number; columnIndex: number },
	matrix: readonly (readonly CellValue[])[],
): TableDocument {
	if (matrix.length === 0) return document;

	let widestRow = 0;
	for (const row of matrix) {
		if (row.length > widestRow) widestRow = row.length;
	}
	const neededColumns = at.columnIndex + widestRow;
	const neededRows = at.rowIndex + matrix.length;

	let next = document;
	if (neededColumns > next.columns.length) {
		next = insertColumns(
			next,
			next.columns.length,
			neededColumns - next.columns.length,
		);
	}
	if (neededRows > next.rows.length) {
		next = insertRows(next, next.rows.length, neededRows - next.rows.length);
	}

	const rows = next.rows.map((row, rowIndex) => {
		const source = matrix[rowIndex - at.rowIndex];
		if (!source) return row;
		const cells: Record<ColumnId, CellValue> = { ...row.cells };
		source.forEach((value, offset) => {
			const column = next.columns[at.columnIndex + offset];
			if (column) cells[column.id] = value;
		});
		return { ...row, cells };
	});
	return { ...next, rows };
}

export { sortedDesc };
