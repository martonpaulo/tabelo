import {
	cellText,
	cellTextAt,
	DEFAULT_EXPECTED_TYPE,
	isBlankCell,
	readCell,
} from "./cell-value";
import { createColumnId, createRowId } from "./ids";
import type {
	Alignment,
	CellValue,
	Column,
	ColumnId,
	Row,
	TableDocument,
} from "./types";

export const DEFAULT_COLUMN_COUNT = 3;
export const DEFAULT_ROW_COUNT = 3;

export function createColumn(header: string): Column {
	return {
		id: createColumnId(),
		header,
		align: "default",
		expectedType: DEFAULT_EXPECTED_TYPE,
	};
}

// Accepts any cell value so a typed source can build rows directly, while a
// value nobody supplied starts as an empty string rather than `null`: an empty
// cell in the grid is text the user has not typed yet, not a chosen `null`.
export function createRow(
	columns: readonly Column[],
	values: readonly CellValue[] = [],
): Row {
	const cells: Record<ColumnId, CellValue> = {};
	columns.forEach((column, index) => {
		const value = values[index];
		cells[column.id] = value === undefined ? "" : value;
	});
	return { id: createRowId(), cells };
}

export function createEmptyDocument(
	columnCount = DEFAULT_COLUMN_COUNT,
	rowCount = DEFAULT_ROW_COUNT,
): TableDocument {
	// A new table starts unnamed. The column index strip gives each column its
	// identity, so a seeded "Column 1" would only be content the user has to
	// delete before typing their own.
	const columns = Array.from({ length: columnCount }, () => createColumn(""));
	const rows = Array.from({ length: rowCount }, () => createRow(columns));
	return { columns, rows };
}

// True when the document holds no content at all: only blank cells. Nothing
// generates header names any more, so a header that reads "Column 1" is text
// the user typed and the document is not blank. That closes the trap where
// typing it made your table count as untouched and clearable without warning.
export function isDocumentBlank(document: TableDocument): boolean {
	const headersBlank = document.columns.every((column) => column.header === "");
	const cellsBlank = document.rows.every((row) =>
		Object.values(row.cells).every(isBlankCell),
	);
	return headersBlank && cellsBlank;
}

// Pads every row to the widest row so the matrix is rectangular.
export function normalizeMatrix(
	matrix: readonly (readonly string[])[],
): string[][];
export function normalizeMatrix(
	matrix: readonly (readonly CellValue[])[],
): CellValue[][];
export function normalizeMatrix(
	matrix: readonly (readonly CellValue[])[],
): CellValue[][] {
	const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);
	return matrix.map((row) =>
		Array.from({ length: width }, (_, index) => {
			const value = row[index];
			return value === undefined ? "" : value;
		}),
	);
}

export interface MatrixToDocumentOptions {
	// When false, the header row is left empty and row 1 stays data. The table
	// still has exactly one header row: it simply has no text in it yet.
	readonly headerRow: boolean;
	readonly alignments?: readonly Alignment[];
}

export function documentFromMatrix(
	input: readonly (readonly CellValue[])[],
	options: MatrixToDocumentOptions,
): TableDocument {
	const matrix = normalizeMatrix(input);
	const firstRow = matrix[0];
	if (!firstRow) return createEmptyDocument();

	// Headers are names, not typed cells. Named formats that declare a header
	// still carry body values without projecting them through text here.
	const headerValues = options.headerRow
		? firstRow.map(cellText)
		: firstRow.map(() => "");
	const bodyRows = options.headerRow ? matrix.slice(1) : matrix;

	// A blank header in the source stays blank. Coercing it to a generated name
	// would turn it into content that then serializes out to every format,
	// indistinguishable from a header the user typed.
	const columns = headerValues.map((header, index) => ({
		...createColumn(header),
		align: options.alignments?.[index] ?? "default",
	}));
	const rows = bodyRows.map((values) => createRow(columns, values));

	return { columns, rows: rows.length > 0 ? rows : [createRow(columns)] };
}

// A source parser necessarily constructs fresh identifiers. Synchronization
// reconciles that parsed shape with the current document by position so normal
// text edits keep selection, workspace column preferences, and row identity
// attached.
// Identity is preserved per item, not only for the document as a whole. A
// keystroke in a source pane changes one row, and every other row must come
// back as the very same object so the grid's memoised rows can skip it. An
// all-or-nothing check cannot do that: the moment one row differs it hands all
// 200 a fresh object and every memo boundary misses. This mirrors the per-item
// early return `clearCells` already uses in `operations.ts`.
//
// Reconciliation also protects canonical values and metadata a source syntax
// cannot carry. The source capabilities below make that distinction explicit.
export interface ReconciliationSource {
	readonly cellValues: "text" | "typed";
	readonly columnAlignment: "carried" | "unexpressed";
}

const DEFAULT_RECONCILIATION_SOURCE: ReconciliationSource = {
	cellValues: "text",
	columnAlignment: "carried",
};

export function reconcileDocument(
	current: TableDocument,
	parsed: TableDocument,
	source: ReconciliationSource = DEFAULT_RECONCILIATION_SOURCE,
): TableDocument {
	let columnsUnchanged = parsed.columns.length === current.columns.length;

	const columns = parsed.columns.map((column, index) => {
		const existing = current.columns[index];
		if (!existing) {
			columnsUnchanged = false;
			return column;
		}

		// The id always comes from the existing column. Presentation preferences
		// are keyed by that id in the workspace and never enter reconciliation.
		// The expected type comes from the existing column too: a text format
		// cannot express it, so a parse must not reset it to the default.
		const alignment =
			source.columnAlignment === "unexpressed" ? existing.align : column.align;
		if (existing.header === column.header && existing.align === alignment) {
			return existing;
		}

		columnsUnchanged = false;
		return {
			...column,
			id: existing.id,
			align: alignment,
			expectedType: existing.expectedType,
		};
	});

	let rowsUnchanged = parsed.rows.length === current.rows.length;

	const rows = parsed.rows.map((row, rowIndex) => {
		const existing = current.rows[rowIndex];
		const cells: Record<ColumnId, CellValue> = {};
		columns.forEach((column, columnIndex) => {
			const parsedColumn = parsed.columns[columnIndex];
			const parsedValue = parsedColumn ? readCell(row, parsedColumn.id) : "";
			const existingColumn = current.columns[columnIndex];
			const existingValue =
				existing && existingColumn
					? readCell(existing, existingColumn.id)
					: undefined;

			// A text format can only report a projection. When that projection is
			// unchanged, keep the canonical value that supplied it. This is also how
			// `null` stays distinct from an empty string despite both projecting to
			// empty text. A changed or newly inserted text cell remains the parsed
			// string, and a typed source always supplies the canonical value itself.
			cells[column.id] =
				source.cellValues === "text" &&
				typeof parsedValue === "string" &&
				existingValue !== undefined &&
				cellText(existingValue) === parsedValue
					? existingValue
					: parsedValue;
		});

		// The key count has to match as well as the values: a row still carrying a
		// deleted column's cell would otherwise pass a values-only comparison and
		// keep a key the current column set no longer has.
		const reusable =
			existing !== undefined &&
			Object.keys(existing.cells).length === columns.length &&
			columns.every((column) => existing.cells[column.id] === cells[column.id]);
		if (reusable) return existing;

		rowsUnchanged = false;
		return { id: existing?.id ?? row.id, cells };
	});

	if (columnsUnchanged && rowsUnchanged) return current;
	return {
		columns: columnsUnchanged ? current.columns : columns,
		rows: rowsUnchanged ? current.rows : rows,
	};
}

export interface DocumentToMatrixOptions {
	readonly includeHeader?: boolean;
}

// The one seam where the document becomes text. Every codec that serializes
// through a matrix inherits `cellText` from here rather than deciding for
// itself what a number or a boolean looks like.
export function documentToMatrix(
	document: TableDocument,
	options: DocumentToMatrixOptions = {},
): string[][] {
	const { includeHeader = true } = options;
	const body = document.rows.map((row) =>
		document.columns.map((column) => cellTextAt(row, column.id)),
	);
	if (!includeHeader) return body;
	return [document.columns.map((column) => column.header), ...body];
}
