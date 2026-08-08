import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { documentToMatrix } from "@/core/document";
import {
	clearCells,
	deleteColumns,
	deleteRows,
	duplicateColumns,
	duplicateRows,
	insertColumns,
	insertRows,
	moveColumn,
	moveRow,
	pasteMatrix,
	setAlignment,
	setCell,
	setColumnWidth,
	setHeader,
} from "@/core/operations";
import type { TableDocument } from "@/core/types";
import {
	alignmentArbitrary,
	cellRectArbitrary,
	cellStringArbitrary,
	documentPositionArbitrary,
	PROPERTY_RUNS,
	tableDocumentArbitrary,
} from "@/testing/property-arbitraries";

function cloneDocument(document: TableDocument): TableDocument {
	return structuredClone(document);
}

function expectValidDocument(document: TableDocument): void {
	expect(document.columns.length).toBeGreaterThan(0);
	expect(document.rows.length).toBeGreaterThan(0);
	expect(new Set(document.columns.map((column) => column.id)).size).toBe(
		document.columns.length,
	);
	expect(new Set(document.rows.map((row) => row.id)).size).toBe(
		document.rows.length,
	);
	const columnIds = document.columns.map((column) => column.id).toSorted();
	for (const row of document.rows) {
		expect(Object.keys(row.cells).toSorted()).toEqual(columnIds);
	}
}

function operationCaseArbitrary() {
	return tableDocumentArbitrary.chain((document) =>
		fc
			.record({
				position: documentPositionArbitrary(document),
				rect: cellRectArbitrary(document),
				value: cellStringArbitrary,
				alignment: alignmentArbitrary,
				width: fc.option(fc.integer({ min: 4, max: 48 }), {
					nil: undefined,
				}),
			})
			.map((parameters) => ({ document, ...parameters })),
	);
}

describe("document operation properties", () => {
	test.prop(
		{ operation: operationCaseArbitrary() },
		{ numRuns: PROPERTY_RUNS },
	)(
		"cell and column edits leave every neighbour untouched",
		({ operation }) => {
			const { document, position, rect, value, alignment, width } = operation;
			const before = cloneDocument(document);
			const { rowIndex, columnIndex } = position;

			const cellResult = setCell(document, rowIndex, columnIndex, value);
			const headerResult = setHeader(document, columnIndex, value);
			const alignmentResult = setAlignment(document, columnIndex, alignment);
			const widthResult = setColumnWidth(document, columnIndex, width);
			const clearResult = clearCells(document, [rect]);

			expect(document).toEqual(before);
			expect(
				cellResult.rows[rowIndex]?.cells[
					document.columns[columnIndex]?.id ?? ""
				],
			).toBe(value);
			expect(headerResult.columns[columnIndex]?.header).toBe(value);
			expect(alignmentResult.columns[columnIndex]?.align).toBe(alignment);
			expect(widthResult.columns[columnIndex]?.width).toBe(width);
			for (const [index, row] of document.rows.entries()) {
				if (index !== rowIndex) expect(cellResult.rows[index]).toBe(row);
			}
			for (const [index, column] of document.columns.entries()) {
				if (index === columnIndex) continue;
				expect(headerResult.columns[index]).toBe(column);
				expect(alignmentResult.columns[index]).toBe(column);
				expect(widthResult.columns[index]).toBe(column);
			}

			for (const [currentRow, row] of document.rows.entries()) {
				for (const [currentColumn, column] of document.columns.entries()) {
					const covered =
						currentRow >= rect.top &&
						currentRow <= rect.bottom &&
						currentColumn >= rect.left &&
						currentColumn <= rect.right;
					if (!covered) {
						expect(clearResult.rows[currentRow]?.cells[column.id]).toBe(
							row.cells[column.id],
						);
					}
				}
			}
			for (const [currentColumn, column] of document.columns.entries()) {
				const covered =
					rect.top === -1 &&
					currentColumn >= rect.left &&
					currentColumn <= rect.right;
				expect(clearResult.columns[currentColumn]?.header).toBe(
					covered ? "" : column.header,
				);
			}
			expectValidDocument(cellResult);
			expectValidDocument(clearResult);
		},
	);

	test.prop(
		{ document: tableDocumentArbitrary, count: fc.integer({ min: 1, max: 3 }) },
		{ numRuns: PROPERTY_RUNS },
	)("insert then delete restores rows and columns", ({ document, count }) => {
		const before = cloneDocument(document);
		const rowIndex = Math.floor(document.rows.length / 2);
		const columnIndex = Math.floor(document.columns.length / 2);

		const withRows = insertRows(document, rowIndex, count);
		const restoredRows = deleteRows(
			withRows,
			Array.from({ length: count }, (_, offset) => rowIndex + offset),
		);
		const withColumns = insertColumns(document, columnIndex, count);
		const restoredColumns = deleteColumns(
			withColumns,
			Array.from({ length: count }, (_, offset) => columnIndex + offset),
		);

		expect(restoredRows).toEqual(document);
		expect(restoredColumns).toEqual(document);
		expect(document).toEqual(before);
	});

	test.prop({ document: tableDocumentArbitrary }, { numRuns: PROPERTY_RUNS })(
		"duplicates copy bytes and metadata with fresh ids",
		({ document }) => {
			const before = cloneDocument(document);
			const rowIndex = Math.floor(document.rows.length / 2);
			const columnIndex = Math.floor(document.columns.length / 2);
			const rows = duplicateRows(document, [rowIndex]);
			const columns = duplicateColumns(document, [columnIndex]);

			expect(rows.rows[rowIndex + 1]?.cells).toEqual(
				document.rows[rowIndex]?.cells,
			);
			expect(rows.rows[rowIndex + 1]?.id).not.toBe(document.rows[rowIndex]?.id);
			expect(columns.columns[columnIndex + 1]).toMatchObject({
				header: document.columns[columnIndex]?.header,
				align: document.columns[columnIndex]?.align,
				width: document.columns[columnIndex]?.width,
			});
			expect(columns.columns[columnIndex + 1]?.id).not.toBe(
				document.columns[columnIndex]?.id,
			);
			for (const [rowIndex, row] of document.rows.entries()) {
				const sourceId = document.columns[columnIndex]?.id ?? "";
				const copyId = columns.columns[columnIndex + 1]?.id ?? "";
				expect(columns.rows[rowIndex]?.cells[copyId]).toBe(row.cells[sourceId]);
			}
			expect(document).toEqual(before);
			expectValidDocument(rows);
			expectValidDocument(columns);
		},
	);

	test.prop({ document: tableDocumentArbitrary }, { numRuns: PROPERTY_RUNS })(
		"moving an entity away and back restores the document",
		({ document }) => {
			const before = cloneDocument(document);
			const rowFrom = 0;
			const rowTo = document.rows.length - 1;
			const columnFrom = 0;
			const columnTo = document.columns.length - 1;

			expect(
				moveRow(moveRow(document, rowFrom, rowTo), rowTo, rowFrom),
			).toEqual(document);
			expect(
				moveColumn(
					moveColumn(document, columnFrom, columnTo),
					columnTo,
					columnFrom,
				),
			).toEqual(document);
			expect(document).toEqual(before);
		},
	);

	test.prop({ document: tableDocumentArbitrary }, { numRuns: PROPERTY_RUNS })(
		"deletion preserves survivor ids and a valid table",
		({ document }) => {
			const before = cloneDocument(document);
			const removedRow = Math.floor(document.rows.length / 2);
			const removedColumn = Math.floor(document.columns.length / 2);
			const rows = deleteRows(document, [removedRow]);
			const columns = deleteColumns(document, [removedColumn]);

			if (document.rows.length > 1) {
				expect(rows.rows.map((row) => row.id)).toEqual(
					document.rows
						.filter((_, index) => index !== removedRow)
						.map((row) => row.id),
				);
			}
			if (document.columns.length > 1) {
				expect(columns.columns.map((column) => column.id)).toEqual(
					document.columns
						.filter((_, index) => index !== removedColumn)
						.map((column) => column.id),
				);
			}
			expect(document).toEqual(before);
			expectValidDocument(rows);
			expectValidDocument(columns);
		},
	);

	test.prop(
		{
			document: tableDocumentArbitrary,
			payload: fc.array(
				fc.array(cellStringArbitrary, { minLength: 1, maxLength: 3 }),
				{ minLength: 1, maxLength: 3 },
			),
		},
		{ numRuns: PROPERTY_RUNS },
	)(
		"paste grows without changing cells outside its target",
		({ document, payload }) => {
			const before = cloneDocument(document);
			const at = {
				rowIndex: document.rows.length - 1,
				columnIndex: document.columns.length - 1,
			};
			const next = pasteMatrix(document, at, payload);

			for (const [rowIndex, row] of document.rows.entries()) {
				for (const [columnIndex, column] of document.columns.entries()) {
					const payloadRow = payload[rowIndex - at.rowIndex];
					const covered =
						payloadRow !== undefined &&
						columnIndex >= at.columnIndex &&
						columnIndex < at.columnIndex + payloadRow.length;
					if (!covered) {
						expect(next.rows[rowIndex]?.cells[column.id]).toBe(
							row.cells[column.id],
						);
					}
				}
			}
			expect(document).toEqual(before);
			expectValidDocument(next);
		},
	);

	test.prop(
		{ operation: operationCaseArbitrary() },
		{ numRuns: PROPERTY_RUNS },
	)(
		"operations are deterministic at their observable seam",
		({ operation }) => {
			const { document, position, value, alignment, rect } = operation;
			const first = [
				setCell(document, position.rowIndex, position.columnIndex, value),
				setHeader(document, position.columnIndex, value),
				setAlignment(document, position.columnIndex, alignment),
				moveRow(document, 0, document.rows.length - 1),
				moveColumn(document, 0, document.columns.length - 1),
				clearCells(document, [rect]),
			];
			const second = [
				setCell(document, position.rowIndex, position.columnIndex, value),
				setHeader(document, position.columnIndex, value),
				setAlignment(document, position.columnIndex, alignment),
				moveRow(document, 0, document.rows.length - 1),
				moveColumn(document, 0, document.columns.length - 1),
				clearCells(document, [rect]),
			];

			expect(second).toEqual(first);

			const firstCreating = [
				insertRows(document, 0),
				insertColumns(document, 0),
				duplicateRows(document, [0]),
				duplicateColumns(document, [0]),
			].map((candidate) => documentToMatrix(candidate));
			const secondCreating = [
				insertRows(document, 0),
				insertColumns(document, 0),
				duplicateRows(document, [0]),
				duplicateColumns(document, [0]),
			].map((candidate) => documentToMatrix(candidate));
			expect(secondCreating).toEqual(firstCreating);
		},
	);
});
