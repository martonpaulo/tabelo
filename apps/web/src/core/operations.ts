import {
	cellText,
	cellTextAt,
	cellValuesEqual,
	cellValueType,
	expectedCellValueType,
	headerContent,
	readCell,
} from "./cell-value";
import { createColumn, createRow } from "./document";
import { createRowId } from "./ids";
import { isInlineContent } from "./inline-content";
import {
	type CellRect,
	HEADER_ROW,
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
	TextContent,
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
	// The carried value, not text: writing the string "1" over the number 1 is
	// a real change even though both project to the same text, and so is plain
	// text over formatted text that reads the same.
	if (cellValuesEqual(readCell(row, column.id), value)) return document;

	const rows = document.rows.map((candidate, index) =>
		index === rowIndex
			? { ...candidate, cells: { ...candidate.cells, [column.id]: value } }
			: candidate,
	);
	return { ...document, rows };
}

// Sparse writes clone each changed row only once. The final write to one
// coordinate wins, while an unchanged final value retains the original row.
export function setCellValues(
	document: TableDocument,
	entries: readonly {
		rowIndex: number;
		columnIndex: number;
		value: CellValue;
	}[],
): TableDocument {
	if (entries.length === 1) {
		const entry = entries[0];
		if (!entry) return document;
		return setCell(document, entry.rowIndex, entry.columnIndex, entry.value);
	}
	const writes = new Map<number, Map<ColumnId, CellValue>>();
	for (const entry of entries) {
		const column = document.columns[entry.columnIndex];
		if (!column || !document.rows[entry.rowIndex]) continue;
		let cells = writes.get(entry.rowIndex);
		if (!cells) {
			cells = new Map();
			writes.set(entry.rowIndex, cells);
		}
		cells.set(column.id, entry.value);
	}
	let changed = false;
	const rows = document.rows.map((row, index) => {
		let cells: Record<ColumnId, CellValue> | null = null;
		for (const [columnId, value] of writes.get(index) ?? []) {
			if (cellValuesEqual(readCell(row, columnId), value)) continue;
			cells ??= { ...row.cells };
			cells[columnId] = value;
		}
		if (!cells) return row;
		changed = true;
		return { ...row, cells };
	});
	return changed ? { ...document, rows } : document;
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
	header: TextContent,
): TableDocument {
	const column = document.columns[columnIndex];
	if (!column || cellValuesEqual(column.header, header)) return document;
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

export interface ColumnTypeChange {
	readonly document: TableDocument;
	// The cells that cannot reach the new type without losing their value or
	// inventing one. They keep their value and type.
	readonly unconverted: number;
}

// Changing a column's expected type converts its cells by the user's choice
// (#392, docs/adr/0008). Every cell goes through the Cell type conversion table
// and converts only when that conversion runs at once, meaning it loses
// nothing and invents nothing; the others are counted so the caller can ask
// before applying. Empty cells stay exactly as they are, `null` included.
export function changeColumnType(
	document: TableDocument,
	columnIndex: number,
	expectedType: ExpectedColumnType,
): ColumnTypeChange {
	const column = document.columns[columnIndex];
	if (!column) return { document, unconverted: 0 };
	const target = expectedCellValueType(expectedType);
	let unconverted = 0;
	let converted = false;
	const rows = document.rows.map((row) => {
		const value = readCell(row, column.id);
		if (value === null || value === "") return row;
		const result = convertCellValue(value, target);
		if (!result.ok || result.confirm) {
			unconverted += 1;
			return row;
		}
		if (result.value === value) return row;
		converted = true;
		return { ...row, cells: { ...row.cells, [column.id]: result.value } };
	});
	const typed = setColumnExpectedType(document, columnIndex, expectedType);
	return {
		document: converted ? { ...typed, rows } : typed,
		unconverted,
	};
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
// header holds text, so a promoted native value arrives through the one
// projection every view reads a cell through, formatted text keeps its
// structure, and the value it came from is gone with its row.
export function promoteFirstRowToHeader(
	document: TableDocument,
): TableDocument {
	const promoted = document.rows[0];
	if (!promoted) return document;

	const columns = document.columns.map((column) => ({
		...column,
		header: headerContent(readCell(promoted, column.id)),
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
			if (cellValuesEqual(readCell(row, targetColumn.id), value)) continue;
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

// What typing over several selected cells writes (owner, 2026-09-19): the
// header text for a covered header, and for a data cell whatever its column
// makes of the one committed draft. The value is asked per column because a
// column's expected type is what decides how a draft is entered, and the caller
// owns that decision; this operation only writes.
export interface CellsWrite {
	readonly header: TextContent;
	readonly cell: (columnIndex: number) => CellValue;
}

// Writes one entry into every cell the rects cover, header included, in one
// operation and therefore one undo step. Shaped like `clearCells`: several
// regions are written together, a cell two of them cover is written once, and
// a write that changes nothing returns the original document.
export function setCells(
	document: TableDocument,
	rects: readonly CellRect[],
	write: CellsWrite,
): TableDocument {
	const covers = (rowIndex: number, columnIndex: number) =>
		rects.some((rect) => rectContains(rect, rowIndex, columnIndex));

	let changed = false;
	const columns = document.columns.map((column, index) => {
		if (
			!covers(HEADER_ROW, index) ||
			cellValuesEqual(column.header, write.header)
		) {
			return column;
		}
		changed = true;
		return { ...column, header: write.header };
	});

	// Asked once per column rather than once per cell: the answer depends only
	// on the column.
	const values = new Map<number, CellValue>();
	const valueFor = (columnIndex: number) => {
		if (!values.has(columnIndex)) {
			values.set(columnIndex, write.cell(columnIndex));
		}
		return values.get(columnIndex) as CellValue;
	};

	const rows = document.rows.map((row, rowIndex) => {
		let cells: Record<ColumnId, CellValue> | null = null;
		document.columns.forEach((column, columnIndex) => {
			if (!covers(rowIndex, columnIndex)) return;
			const value = valueFor(columnIndex);
			if (cellValuesEqual(readCell(row, column.id), value)) return;
			cells ??= { ...row.cells };
			cells[column.id] = value;
		});
		if (!cells) return row;
		changed = true;
		return { ...row, cells };
	});
	return changed ? { ...document, columns, rows } : document;
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
	// Formatted text is text: it sorts by what it reads as, among the strings.
	// That is its own projection, not a reading of text for a type.
	if (isInlineContent(left)) return compareCells(cellText(left), right);
	if (isInlineContent(right)) return compareCells(left, cellText(right));
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

// Rotates the whole table, header row included: the cell at row r and column c
// moves to row c and column r. So the old first column, its header and every
// value under it, becomes the new header row, and the old header row becomes
// the new first column. There is never a headerless state to fall into (#235).
//
// Nothing that described a column or a row survives, because no new column is
// the same thing as any old one. Every identifier is minted fresh, and every
// column takes the default alignment and the default expected type: carrying an
// old column's expectation onto values that were never in it would be the
// product concluding a type from position, which AGENTS.md forbids as firmly as
// concluding one from text. Workspace preferences keyed by the old column ids
// are dropped by the store's reconciliation for the same reason.
//
// Values are moved, never touched: a number stays a number and a `null` stays a
// `null`. The one exception is the model's, not this function's: a header holds
// text, so the native values that arrive in the new header row pass through the
// one projection every view reads a cell through (formatted text keeps its
// structure), exactly as promoting a row into
// the header does. A double transpose therefore restores every value and type
// except those that spent the round trip in the header, which come back as
// their text.
//
// A table with one column has no second column to become a data row. The
// result keeps the one empty row every table holds, so transposing it back
// adds an empty trailing column that Delete empty rows and columns removes.
export function transposeDocument(document: TableDocument): TableDocument {
	const first = document.columns[0];
	if (!first) return document;

	const headers = [
		first.header,
		...document.rows.map((row) => headerContent(readCell(row, first.id))),
	];
	const columns = headers.map((header) => createColumn(header));
	const rows = document.columns.slice(1).map((source) => {
		const values: CellValue[] = [
			source.header,
			...document.rows.map((row) => readCell(row, source.id)),
		];
		const cells: Record<ColumnId, CellValue> = {};
		columns.forEach((column, index) => {
			const value = values[index];
			cells[column.id] = value === undefined ? "" : value;
		});
		return { id: createRowId(), cells };
	});
	return withRows({ columns, rows }, rows);
}

// How many values `transposeDocument` turns into header text: the numbers,
// booleans, and nulls in the first column, whose type the header cannot hold.
// Text, formatted or not, is already what a header holds and is not counted.
// Transposing asks first when this is not zero (owner, 2026-09-19, #235).
export function transposeTypedValueCount(document: TableDocument): number {
	const first = document.columns[0];
	if (!first) return 0;
	return document.rows.filter(
		(row) => cellValueType(readCell(row, first.id)) !== "string",
	).length;
}

export interface EmptyRemovalResult {
	readonly document: TableDocument;
	// The original indices that survive, in order, so a caller can carry a
	// position across the removal.
	readonly keptRows: readonly number[];
	readonly keptColumns: readonly number[];
	// True when the table holds nothing at all, which is why it was left alone.
	readonly tableIsEmpty: boolean;
}

// Removes every row whose cells are all empty and every column whose header and
// cells are all empty. Empty is judged by the text projection, because `null`
// and the empty string look the same on screen and the user cannot tell them
// apart; the cells that survive keep whichever of the two they held (#235).
//
// A column with a header is not empty: the header is a cell for every purpose
// the user can observe, so a named column that holds no values stays.
//
// A table with nothing in it at all is left untouched rather than reduced to
// nothing, and a table whose every data row is empty keeps its first one, since
// a table always keeps at least one row. Survivors keep their identifiers, so
// widths, wrap preferences, and history all still refer to them.
export function deleteEmptyRowsAndColumns(
	document: TableDocument,
): EmptyRemovalResult {
	const rowIsEmpty = (row: Row) =>
		document.columns.every((column) => cellTextAt(row, column.id) === "");
	const keptColumns = document.columns.flatMap((column, index) =>
		column.header !== "" ||
		document.rows.some((row) => cellTextAt(row, column.id) !== "")
			? [index]
			: [],
	);
	const nonEmptyRows = document.rows.flatMap((row, index) =>
		rowIsEmpty(row) ? [] : [index],
	);
	const keptRows = nonEmptyRows.length > 0 ? nonEmptyRows : [0];
	const unchanged = {
		document,
		keptRows: document.rows.map((_, index) => index),
		keptColumns: document.columns.map((_, index) => index),
		tableIsEmpty: keptColumns.length === 0,
	};

	if (keptColumns.length === 0) return unchanged;
	if (
		keptColumns.length === document.columns.length &&
		keptRows.length === document.rows.length
	) {
		return unchanged;
	}

	const columns = keptColumns
		.map((index) => document.columns[index])
		.filter((column): column is Column => column !== undefined);
	const removedIds = document.columns
		.filter((_, index) => !keptColumns.includes(index))
		.map((column) => column.id);
	const rows = keptRows
		.map((index) => document.rows[index])
		.filter(isRow)
		.map((row) => {
			if (removedIds.length === 0) return row;
			const cells: Record<ColumnId, CellValue> = { ...row.cells };
			for (const id of removedIds) delete cells[id];
			return { ...row, cells };
		});
	return {
		document: { columns, rows },
		keptRows,
		keptColumns,
		tableIsEmpty: false,
	};
}

function isRow(row: Row | undefined): row is Row {
	return row !== undefined;
}

export { sortedDesc };
