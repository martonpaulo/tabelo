import { createColumn, createRow } from "./document";
import { createRowId } from "./ids";
import { type CellRect, rectContains, rectCoversHeader } from "./selection";
import type { Alignment, Column, ColumnId, Row, TableDocument } from "./types";

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

export function setCell(
	document: TableDocument,
	rowIndex: number,
	columnIndex: number,
	value: string,
): TableDocument {
	const row = document.rows[rowIndex];
	const column = document.columns[columnIndex];
	if (!row || !column) return document;
	if ((row.cells[column.id] ?? "") === value) return document;

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

export function setColumnWidth(
	document: TableDocument,
	columnIndex: number,
	width: number | undefined,
): TableDocument {
	const column = document.columns[columnIndex];
	if (!column || column.width === width) return document;
	const columns = document.columns.map((candidate, index) =>
		index === columnIndex ? { ...candidate, width } : candidate,
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

export function moveRow(
	document: TableDocument,
	from: number,
	to: number,
): TableDocument {
	if (from === to) return document;
	const rows = [...document.rows];
	const [moved] = rows.splice(from, 1);
	if (!moved) return document;
	rows.splice(Math.max(0, Math.min(to, rows.length)), 0, moved);
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
		const cells = { ...row.cells };
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
		const cells: Record<ColumnId, string> = { ...row.cells };
		for (const id of removedIds) delete cells[id];
		for (const column of columns) cells[column.id] ??= "";
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
			width: source.width,
		};
		columns.splice(index + 1, 0, created);
		copies.push({ source: source.id, created });
	}

	const rows = document.rows.map((row) => {
		const cells = { ...row.cells };
		for (const { source, created } of copies)
			cells[created.id] = row.cells[source] ?? "";
		return { ...row, cells };
	});
	return { columns, rows };
}

export function moveColumn(
	document: TableDocument,
	from: number,
	to: number,
): TableDocument {
	if (from === to) return document;
	const columns = [...document.columns];
	const [moved] = columns.splice(from, 1);
	if (!moved) return document;
	columns.splice(Math.max(0, Math.min(to, columns.length)), 0, moved);
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
		const cleared = document.columns.filter(
			(column, columnIndex) =>
				covers(rowIndex, columnIndex) && (row.cells[column.id] ?? "") !== "",
		);
		if (cleared.length === 0) return row;
		changed = true;
		const cells = { ...row.cells };
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
	matrix: readonly (readonly string[])[],
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
		const cells = { ...row.cells };
		source.forEach((value, offset) => {
			const column = next.columns[at.columnIndex + offset];
			if (column) cells[column.id] = value;
		});
		return { ...row, cells };
	});
	return { ...next, rows };
}

export { sortedDesc };
