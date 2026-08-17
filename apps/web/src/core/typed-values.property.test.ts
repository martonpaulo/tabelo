import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { cellText, readCell } from "@/core/cell-value";
import {
	documentFromMatrix,
	documentToMatrix,
	isDocumentBlank,
	reconcileDocument,
} from "@/core/document";
import {
	clearCells,
	deleteColumns,
	deleteRows,
	duplicateColumns,
	duplicateRows,
	insertColumns,
	insertRows,
	moveColumns,
	moveRows,
	pasteMatrix,
	setCell,
} from "@/core/operations";
import type { CellValue, TableDocument } from "@/core/types";
import {
	cellRectArbitrary,
	cellValueArbitrary,
	documentPositionArbitrary,
	PROPERTY_RUNS,
	typedTableDocumentArbitrary,
} from "@/testing/property-arbitraries";

// The document widened to carry native scalars. These invariants exist to
// prove the operations carry a value rather than reading it: a `0`, a `false`,
// and a `null` all survive an operation as themselves, and nothing anywhere
// turns one into the text it happens to project to. See docs/adr/0008.

function valuesOf(document: TableDocument): CellValue[][] {
	return document.rows.map((row) =>
		document.columns.map((column) => readCell(row, column.id)),
	);
}

function typedCaseArbitrary() {
	return typedTableDocumentArbitrary.chain((document) =>
		fc
			.record({
				position: documentPositionArbitrary(document),
				rect: cellRectArbitrary(document),
				value: cellValueArbitrary,
			})
			.map((parameters) => ({ document, ...parameters })),
	);
}

describe("typed cell value properties", () => {
	test.prop(
		{ document: typedTableDocumentArbitrary },
		{
			numRuns: PROPERTY_RUNS,
		},
	)("the matrix projection is cellText of every value", ({ document }) => {
		expect(documentToMatrix(document, { includeHeader: false })).toEqual(
			valuesOf(document).map((row) => row.map(cellText)),
		);
	});

	test.prop({ case: typedCaseArbitrary() }, { numRuns: PROPERTY_RUNS })(
		"a written scalar reads back as itself, not as its text",
		({ case: { document, position, value } }) => {
			const { rowIndex, columnIndex } = position;
			const columnId = document.columns[columnIndex]?.id ?? "";
			const next = setCell(document, rowIndex, columnIndex, value);
			const row = next.rows[rowIndex];
			if (!row) throw new Error("the written row must exist");

			expect(readCell(row, columnId)).toBe(value);
		},
	);

	test.prop(
		{ document: typedTableDocumentArbitrary },
		{
			numRuns: PROPERTY_RUNS,
		},
	)("structural operations carry every scalar unchanged", ({ document }) => {
		const rowIndex = Math.floor(document.rows.length / 2);
		const columnIndex = Math.floor(document.columns.length / 2);

		// Inserting then deleting the same span, and moving a block away and
		// back, are both round trips: the values must come back identical, and
		// `toEqual` compares the scalars themselves rather than their text.
		expect(
			valuesOf(
				deleteRows(insertRows(document, rowIndex, 2), [rowIndex, rowIndex + 1]),
			),
		).toEqual(valuesOf(document));
		expect(
			valuesOf(
				deleteColumns(insertColumns(document, columnIndex, 2), [
					columnIndex,
					columnIndex + 1,
				]),
			),
		).toEqual(valuesOf(document));

		const rowOffset = document.rows.length - 1;
		const columnOffset = document.columns.length - 1;
		expect(
			moveRows(
				moveRows(document, { from: 0, count: 1 }, rowOffset),
				{ from: rowOffset, count: 1 },
				-rowOffset,
			),
		).toEqual(document);
		expect(
			moveColumns(
				moveColumns(document, { from: 0, count: 1 }, columnOffset),
				{ from: columnOffset, count: 1 },
				-columnOffset,
			),
		).toEqual(document);

		// A duplicate is the same scalar, never a re-parse of its text.
		const rows = duplicateRows(document, [rowIndex]);
		expect(rows.rows[rowIndex + 1]?.cells).toEqual(
			document.rows[rowIndex]?.cells,
		);
		const columns = duplicateColumns(document, [columnIndex]);
		const sourceId = document.columns[columnIndex]?.id ?? "";
		const copyId = columns.columns[columnIndex + 1]?.id ?? "";
		for (const [index, row] of document.rows.entries()) {
			const copied = columns.rows[index];
			if (!copied) throw new Error("the duplicated row must exist");
			expect(readCell(copied, copyId)).toBe(readCell(row, sourceId));
		}
		expect(columns.columns[columnIndex + 1]?.expectedType).toBe(
			document.columns[columnIndex]?.expectedType,
		);
	});

	test.prop({ case: typedCaseArbitrary() }, { numRuns: PROPERTY_RUNS })(
		"clearing empties covered cells and leaves the rest identical",
		({ case: { document, rect } }) => {
			const cleared = clearCells(document, [rect]);

			for (const [rowIndex, row] of document.rows.entries()) {
				for (const [columnIndex, column] of document.columns.entries()) {
					const covered =
						rowIndex >= rect.top &&
						rowIndex <= rect.bottom &&
						columnIndex >= rect.left &&
						columnIndex <= rect.right;
					const next = cleared.rows[rowIndex];
					if (!next) throw new Error("every row survives clearing");
					expect(readCell(next, column.id)).toBe(
						covered ? "" : readCell(row, column.id),
					);
				}
			}
		},
	);

	test.prop(
		{ document: typedTableDocumentArbitrary },
		{
			numRuns: PROPERTY_RUNS,
		},
	)("only the empty string counts as blank", ({ document }) => {
		const holdsValue = document.rows.some((row) =>
			document.columns.some((column) => readCell(row, column.id) !== ""),
		);
		const headersBlank = document.columns.every(
			(column) => column.header === "",
		);

		expect(isDocumentBlank(document)).toBe(headersBlank && !holdsValue);
	});

	test.prop(
		{ document: typedTableDocumentArbitrary },
		{
			numRuns: PROPERTY_RUNS,
		},
	)(
		"reconciling the same text projection preserves every value",
		({ document }) => {
			const parsed = documentFromMatrix(documentToMatrix(document), {
				headerRow: true,
				alignments: document.columns.map((column) => column.align),
			});

			expect(reconcileDocument(document, parsed)).toBe(document);
		},
	);

	test.prop({ case: typedCaseArbitrary() }, { numRuns: PROPERTY_RUNS })(
		"retyping one projection changes only that cell to a string",
		({ case: { document, position } }) => {
			const parsed = documentFromMatrix(documentToMatrix(document), {
				headerRow: true,
				alignments: document.columns.map((column) => column.align),
			});
			const oldValue =
				valuesOf(document)[position.rowIndex]?.[position.columnIndex];
			if (oldValue === undefined)
				throw new Error("the generated cell must exist");
			const replacement = `${cellText(oldValue)}!`;
			const changed = setCell(
				parsed,
				position.rowIndex,
				position.columnIndex,
				replacement,
			);

			const next = reconcileDocument(document, changed);
			const expected = valuesOf(document).map((row) => [...row]);
			const expectedRow = expected[position.rowIndex];
			if (!expectedRow) throw new Error("the generated row must exist");
			expectedRow[position.columnIndex] = replacement;

			expect(valuesOf(next)).toEqual(expected);
			expect(next.columns.map((column) => column.id)).toEqual(
				document.columns.map((column) => column.id),
			);
			expect(next.rows.map((row) => row.id)).toEqual(
				document.rows.map((row) => row.id),
			);
			expect(next.columns.map((column) => column.expectedType)).toEqual(
				document.columns.map((column) => column.expectedType),
			);
		},
	);

	test.prop(
		{
			document: typedTableDocumentArbitrary,
			payload: fc.array(
				fc.array(cellValueArbitrary, { minLength: 1, maxLength: 3 }),
				{ minLength: 1, maxLength: 3 },
			),
		},
		{ numRuns: PROPERTY_RUNS },
	)("paste writes its scalars verbatim", ({ document, payload }) => {
		const at = { rowIndex: 0, columnIndex: 0 };
		const next = pasteMatrix(document, at, payload);

		payload.forEach((values, rowOffset) => {
			values.forEach((value, columnOffset) => {
				const row = next.rows[rowOffset];
				const column = next.columns[columnOffset];
				if (!row || !column) throw new Error("paste grows the table to fit");
				expect(readCell(row, column.id)).toBe(value);
			});
		});
	});
});
