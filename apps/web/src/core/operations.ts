import { cellTextAt, readCell } from "./cell-value";
import { createColumn, createRow } from "./document";
import { createRowId } from "./ids";
import {
	type CellRect,
	isDataRect,
	rectContains,
	rectCoversHeader,
} from "./selection";
import { convertCellValue } from "./typed-input";
import type {
	Alignment,
	CellValue,
	CellValueType,
	Column,
	ColumnId,
	ExpectedColumnType,
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

export function setCellType(
	document: TableDocument,
	rowIndex: number,
	columnIndex: number,
	targetType: CellValueType,
): TableDocument {
	const row = document.rows[rowIndex];
	const column = document.columns[columnIndex];
	if (!row || !column) return document;
	const converted = convertCellValue(readCell(row, column.id), targetType);
	return converted.ok
		? setCell(document, rowIndex, columnIndex, converted.value)
		: document;
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

export function setColumnExpectedType(
	document: TableDocument,
	columnIndex: number,
	expectedType: ExpectedColumnType,
): TableDocument {
	const column = document.columns[columnIndex];
	if (!column || column.expectedType === expectedType) return document;
	const columns = document.columns.map((candidate, index) =>
		index === columnIndex ? { ...candidate, expectedType } : candidate,
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

// Deleting the header row does not leave the table without one: the first
// surviving data row moves up into it, so the document passes from exactly one
// header row to exactly one header row with no headerless state in between.
//
// Only values move. A column's identity, alignment, expected type, and the
// workspace preferences keyed by its id belong to the column rather than to the
// row that happens to be showing in the header, so they stay where they are. A
// header holds text, so a promoted value arrives through the one projection
// every view reads a cell through, and the value it came from is gone with its
// row.
export function promoteFirstRowToHeader(
	document: TableDocument,
): TableDocument {
	const promoted = document.rows[0];
	if (!promoted) return document;

	const columns = document.columns.map((column) => ({
		...column,
		header: cellTextAt(promoted, column.id),
	}));
	const rows = document.rows.slice(1);
	return withRows({ columns, rows }, rows);
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

function positiveModulo(value: number, divisor: number): number {
	return ((value % divisor) + divisor) % divisor;
}

// Repeats one data-cell rectangle across a larger rectangle without deriving
// or projecting values. The target includes the source so a pointer preview can
// describe the complete filled area, while cells already in the source map to
// themselves. Header, out-of-bounds, inverted, and non-containing rectangles
// are invalid and leave the original document untouched.
export function fillRange(
	document: TableDocument,
	source: CellRect,
	target: CellRect,
): TableDocument {
	if (
		!isDataRect(source, document.rows.length, document.columns.length) ||
		!isDataRect(target, document.rows.length, document.columns.length) ||
		target.top > source.top ||
		target.bottom < source.bottom ||
		target.left > source.left ||
		target.right < source.right ||
		(target.top === source.top &&
			target.bottom === source.bottom &&
			target.left === source.left &&
			target.right === source.right)
	) {
		return document;
	}

	const sourceHeight = source.bottom - source.top + 1;
	const sourceWidth = source.right - source.left + 1;
	let changed = false;
	const rows = document.rows.map((row, rowIndex) => {
		if (rowIndex < target.top || rowIndex > target.bottom) return row;
		let cells: Record<ColumnId, CellValue> | null = null;

		for (
			let columnIndex = target.left;
			columnIndex <= target.right;
			columnIndex++
		) {
			const sourceRow =
				document.rows[
					source.top + positiveModulo(rowIndex - source.top, sourceHeight)
				];
			const sourceColumn =
				document.columns[
					source.left + positiveModulo(columnIndex - source.left, sourceWidth)
				];
			const targetColumn = document.columns[columnIndex];
			if (!sourceRow || !sourceColumn || !targetColumn) continue;

			const value = readCell(sourceRow, sourceColumn.id);
			if (readCell(row, targetColumn.id) === value) continue;
			cells ??= { ...row.cells };
			cells[targetColumn.id] = value;
		}

		if (!cells) return row;
		changed = true;
		return { ...row, cells };
	});

	return changed ? { ...document, rows } : document;
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

// Sorting the rows by one column. This is a document operation, not a view
// state: Tabelo has no presentation order, so a sort that lived only in the
// grid would leave the Markdown pane, the CSV pane, and the downloaded file
// disagreeing with what the user is looking at. It reorders `document.rows`,
// reaching every view at once, and it is one history step. See the decision in
// issue #143.
export type SortDirection = "ascending" | "descending";

export interface RowSortResult {
	readonly document: TableDocument;
	// Where each row went: `nextRowOf[oldIndex]` is that row's new index. The
	// selection is remapped through this, so a sort keeps whatever the user had
	// selected rather than dropping it.
	readonly nextRowOf: readonly number[];
}

// One collator for the whole module, pinned to English rather than the runtime
// locale. Sorting mutates the document, so a runtime locale would make the same
// table sort into two different documents on two machines, and therefore into
// two different Markdown files from identical input. The product is
// single-locale English, so pinning is both honest and testable. Constructing
// one per comparison is the cost to avoid; this is constructed once.
//
// `numeric: true` orders numeric-looking strings the way a reader expects
// without parsing them or concluding anything about their type.
// `sensitivity: "base"` makes "ana" and "Ana" compare equal, which is friendlier
// for a name column and makes the comparison non-total: the sort has to be
// stable for the result to be deterministic, and `Array.prototype.sort` is
// specified as stable.
// https://tc39.es/ecma262/#sec-array.prototype.sort
const collator = new Intl.Collator("en", {
	numeric: true,
	sensitivity: "base",
});

// The tiebreak between values of different carried types, ascending. It runs
// from the most constrained value space to the least: a number carries its own
// total order, a boolean has two values, a string is arbitrary. A column's
// expected type guides entry without constraining its cells, so a column
// holding several real types is an ordinary document; sorting one has to be
// deterministic, not meaningful.
const typeOrder: Record<"number" | "boolean" | "string", number> = {
	number: 0,
	boolean: 1,
	string: 2,
};

// `null` and the empty string both project to empty text, and both place last
// in either direction. Whitespace is content, so a whitespace-only string is
// not empty.
function isEmptyCell(value: CellValue): boolean {
	return value === null || value === "";
}

// The comparison rule, and the reason it reads `typeof` and never text.
//
// A cell's type is carried, never derived: a typed source stated it or the user
// chose it. So `"10"` is a string because a string is what the cell holds, and
// it sorts through the collator like any other string rather than as ten. Do
// not "fix" this later by parsing numeric-looking strings, and do not project
// through `cellText` before comparing: that would flatten every number into a
// numeric-looking string and reintroduce exactly the inference AGENTS.md
// forbids. The collator's `numeric: true` already handles the readable ordering
// of digits inside strings without any of that.
function compareCells(left: CellValue, right: CellValue): number {
	const leftType = typeof left;
	const rightType = typeof right;
	if (leftType !== rightType) {
		return (
			(typeOrder[leftType as keyof typeof typeOrder] ?? 0) -
			(typeOrder[rightType as keyof typeof typeOrder] ?? 0)
		);
	}
	if (typeof left === "number" && typeof right === "number") {
		// Subtraction would answer NaN for a NaN operand, which sorts
		// unpredictably. Comparing both directions keeps the result an integer
		// sign and treats an incomparable pair as equal, which stability then
		// resolves into the original order.
		return (left > right ? 1 : 0) - (left < right ? 1 : 0);
	}
	if (typeof left === "boolean" && typeof right === "boolean") {
		return (left ? 1 : 0) - (right ? 1 : 0);
	}
	if (typeof left === "string" && typeof right === "string") {
		return collator.compare(left, right);
	}
	return 0;
}

// Reorders existing row objects. Nothing is parsed, coerced, normalized, or
// rewritten: row identity, cell values, and their types come through untouched,
// so column widths and every other preference keyed by a row or column id
// follow their rows.
export function sortRows(
	document: TableDocument,
	columnId: ColumnId,
	direction: SortDirection,
): RowSortResult {
	const identity = document.rows.map((_, index) => index);
	const known = document.columns.some((column) => column.id === columnId);
	if (!known || document.rows.length < 2) {
		return { document, nextRowOf: identity };
	}

	const values = document.rows.map((row) => readCell(row, columnId));
	const order = [...identity].sort((left, right) => {
		const leftValue = values[left] ?? "";
		const rightValue = values[right] ?? "";
		const leftEmpty = isEmptyCell(leftValue);
		const rightEmpty = isEmptyCell(rightValue);
		// Resolved before the direction is applied, which is what keeps empty
		// cells last in both directions rather than flipping to first.
		if (leftEmpty || rightEmpty) {
			if (leftEmpty && rightEmpty) return 0;
			return leftEmpty ? 1 : -1;
		}
		const compared = compareCells(leftValue, rightValue);
		return direction === "descending" ? -compared : compared;
	});

	if (order.every((from, to) => from === to)) {
		return { document, nextRowOf: identity };
	}

	const nextRowOf = [...identity];
	order.forEach((from, to) => {
		nextRowOf[from] = to;
	});
	const rows = order.map((from) => document.rows[from]).filter(isRow);
	return { document: { ...document, rows }, nextRowOf };
}

function isRow(row: Row | undefined): row is Row {
	return row !== undefined;
}

export { sortedDesc };
