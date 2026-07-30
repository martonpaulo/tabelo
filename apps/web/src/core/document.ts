import { createColumnId, createRowId } from "./ids";
import type { Alignment, Column, ColumnId, Row, TableDocument } from "./types";

export const DEFAULT_COLUMN_COUNT = 3;
export const DEFAULT_ROW_COUNT = 3;

export function createColumn(header: string): Column {
	return { id: createColumnId(), header, align: "default" };
}

export function createRow(
	columns: readonly Column[],
	values: readonly string[] = [],
): Row {
	const cells: Record<ColumnId, string> = {};
	columns.forEach((column, index) => {
		cells[column.id] = values[index] ?? "";
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

export function getCell(
	document: TableDocument,
	rowId: string,
	columnId: ColumnId,
): string {
	return document.rows.find((row) => row.id === rowId)?.cells[columnId] ?? "";
}

// True when the document holds no content at all: only blank cells. Nothing
// generates header names any more, so a header that reads "Column 1" is text
// the user typed and the document is not blank. That closes the trap where
// typing it made your table count as untouched and clearable without warning.
export function isDocumentBlank(document: TableDocument): boolean {
	const headersBlank = document.columns.every((column) => column.header === "");
	const cellsBlank = document.rows.every((row) =>
		Object.values(row.cells).every((value) => value === ""),
	);
	return headersBlank && cellsBlank;
}

// Pads every row to the widest row so the matrix is rectangular.
export function normalizeMatrix(
	matrix: readonly (readonly string[])[],
): string[][] {
	const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);
	return matrix.map((row) =>
		Array.from({ length: width }, (_, index) => row[index] ?? ""),
	);
}

// Import-time header decision. See AGENTS.md: this never becomes document
// state, and the user can reverse it with one action.
//
// Defaults to treating row 1 as the header, because that is what a Markdown
// table always means and what most pasted tables intend. Only positive
// evidence that row 1 is data: a blank cell or a numeric value where headers
// would carry labels: flips the decision.
const NUMERIC_LIKE = /^-?[\d.,\s]*\d[\d.,\s]*%?$/;

export function detectHeaderRow(
	matrix: readonly (readonly string[])[],
): boolean {
	const first = matrix[0];
	if (!first || first.length === 0) return false;
	if (matrix.length === 1) return true;

	const looksLikeData = first.some((value) => {
		const trimmed = value.trim();
		return trimmed === "" || NUMERIC_LIKE.test(trimmed);
	});
	return !looksLikeData;
}

export interface MatrixToDocumentOptions {
	// When false, the header row is left empty and row 1 stays data. The table
	// still has exactly one header row: it simply has no text in it yet.
	readonly headerRow: boolean;
	readonly alignments?: readonly Alignment[];
}

export function documentFromMatrix(
	input: readonly (readonly string[])[],
	options: MatrixToDocumentOptions,
): TableDocument {
	const matrix = normalizeMatrix(input);
	if (matrix.length === 0) return createEmptyDocument();

	const headerValues = options.headerRow ? matrix[0] : matrix[0].map(() => "");
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
// text edits keep selection, column widths, and row identity attached.
export function reconcileDocument(
	current: TableDocument,
	parsed: TableDocument,
): TableDocument {
	const columns = parsed.columns.map((column, index) => {
		const existing = current.columns[index];
		if (!existing) return column;
		return {
			...column,
			id: existing.id,
			...(existing.width === undefined ? {} : { width: existing.width }),
		};
	});

	const rows = parsed.rows.map((row, rowIndex) => {
		const existing = current.rows[rowIndex];
		const cells: Record<ColumnId, string> = {};
		columns.forEach((column, columnIndex) => {
			const parsedColumn = parsed.columns[columnIndex];
			cells[column.id] = parsedColumn ? (row.cells[parsedColumn.id] ?? "") : "";
		});
		return { id: existing?.id ?? row.id, cells };
	});

	const unchanged =
		columns.length === current.columns.length &&
		rows.length === current.rows.length &&
		columns.every((column, index) => {
			const existing = current.columns[index];
			return (
				existing !== undefined &&
				column.id === existing.id &&
				column.header === existing.header &&
				column.align === existing.align &&
				column.width === existing.width
			);
		}) &&
		rows.every((row, rowIndex) => {
			const existing = current.rows[rowIndex];
			return (
				existing !== undefined &&
				row.id === existing.id &&
				columns.every(
					(column) =>
						row.cells[column.id] === (existing.cells[column.id] ?? ""),
				)
			);
		});

	return unchanged ? current : { columns, rows };
}

export interface DocumentToMatrixOptions {
	readonly includeHeader?: boolean;
}

export function documentToMatrix(
	document: TableDocument,
	options: DocumentToMatrixOptions = {},
): string[][] {
	const { includeHeader = true } = options;
	const body = document.rows.map((row) =>
		document.columns.map((column) => row.cells[column.id] ?? ""),
	);
	if (!includeHeader) return body;
	return [document.columns.map((column) => column.header), ...body];
}
