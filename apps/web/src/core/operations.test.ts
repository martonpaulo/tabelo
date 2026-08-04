import { describe, expect, it } from "vitest";
import {
	createEmptyDocument,
	detectHeaderRow,
	documentFromMatrix,
	documentToMatrix,
	isDocumentBlank,
} from "./document";
import {
	clearCells,
	deleteColumns,
	deleteRows,
	demoteHeaderToRow,
	duplicateColumns,
	duplicateRows,
	insertColumns,
	insertRows,
	moveColumn,
	moveRow,
	pasteMatrix,
	setCell,
} from "./operations";
import { HEADER_ROW } from "./selection";

function docOf(matrix: string[][]) {
	return documentFromMatrix(matrix, { headerRow: true });
}

const sample = () =>
	docOf([
		["A", "B"],
		["1", "2"],
		["3", "4"],
	]);

describe("row operations", () => {
	it("inserts a blank row at the given index", () => {
		// Index 1 is the second data row; the header is not part of the row list.
		const next = insertRows(sample(), 1);
		expect(documentToMatrix(next)).toEqual([
			["A", "B"],
			["1", "2"],
			["", ""],
			["3", "4"],
		]);
	});

	it("deletes rows and keeps identifiers stable for the survivors", () => {
		const before = sample();
		const survivorId = before.rows[1].id;
		const next = deleteRows(before, [0]);
		expect(next.rows).toHaveLength(1);
		expect(next.rows[0].id).toBe(survivorId);
	});

	it("never leaves the table without a row", () => {
		const next = deleteRows(sample(), [0, 1]);
		expect(next.rows).toHaveLength(1);
		expect(documentToMatrix(next)[1]).toEqual(["", ""]);
	});

	it("duplicates a row directly below itself with a fresh identifier", () => {
		const before = sample();
		const next = duplicateRows(before, [0]);
		expect(documentToMatrix(next)).toEqual([
			["A", "B"],
			["1", "2"],
			["1", "2"],
			["3", "4"],
		]);
		expect(next.rows[1].id).not.toBe(next.rows[2].id);
	});

	it("duplicates several rows without corrupting the order", () => {
		const next = duplicateRows(sample(), [0, 1]);
		expect(documentToMatrix(next)).toEqual([
			["A", "B"],
			["1", "2"],
			["1", "2"],
			["3", "4"],
			["3", "4"],
		]);
	});

	it("moves a row", () => {
		expect(documentToMatrix(moveRow(sample(), 0, 1))).toEqual([
			["A", "B"],
			["3", "4"],
			["1", "2"],
		]);
	});
});

describe("column operations", () => {
	it("inserts a column and gives every row a cell for it", () => {
		const next = insertColumns(sample(), 1);
		expect(next.columns).toHaveLength(3);
		for (const row of next.rows) {
			expect(Object.keys(row.cells)).toHaveLength(3);
		}
	});

	it("deletes a column and drops its cells", () => {
		const before = sample();
		const removedId = before.columns[0].id;
		const next = deleteColumns(before, [0]);
		expect(next.columns).toHaveLength(1);
		expect(next.rows.every((row) => !(removedId in row.cells))).toBe(true);
	});

	it("never leaves the table without a column", () => {
		const next = deleteColumns(sample(), [0, 1]);
		expect(next.columns).toHaveLength(1);
	});

	it("duplicates a column with its values and alignment", () => {
		// One document throughout: column ids are the keys into every row's
		// cells, so mixing columns from a second document empties the table.
		const source = sample();
		const before = {
			...source,
			columns: source.columns.map((column, index) =>
				index === 0 ? { ...column, align: "right" as const } : column,
			),
		};
		const next = duplicateColumns(before, [0]);
		expect(next.columns[1].align).toBe("right");
		expect(documentToMatrix(next)).toEqual([
			["A", "A", "B"],
			["1", "1", "2"],
			["3", "3", "4"],
		]);
	});

	it("moves a column and carries its cells", () => {
		expect(documentToMatrix(moveColumn(sample(), 0, 1))).toEqual([
			["B", "A"],
			["2", "1"],
			["4", "3"],
		]);
	});
});

describe("cell operations", () => {
	it("returns the same document when a write changes nothing", () => {
		const before = sample();
		expect(setCell(before, 0, 0, "1")).toBe(before);
	});

	it("clears a rectangle without touching its neighbours", () => {
		const next = clearCells(sample(), { top: 0, bottom: 0, left: 0, right: 0 });
		expect(documentToMatrix(next)).toEqual([
			["A", "B"],
			["", "2"],
			["3", "4"],
		]);
	});

	// The selection can cover the header row, so the operation behind Backspace
	// has to reach it. Clearing a header leaves it empty; nothing renames it.
	it("clears header text and cells together across the boundary", () => {
		const next = clearCells(sample(), {
			top: HEADER_ROW,
			bottom: 0,
			left: 0,
			right: 0,
		});
		expect(documentToMatrix(next)).toEqual([
			["", "B"],
			["", "2"],
			["3", "4"],
		]);
	});

	it("clears the header row alone", () => {
		const next = clearCells(sample(), {
			top: HEADER_ROW,
			bottom: HEADER_ROW,
			left: 0,
			right: 1,
		});
		expect(documentToMatrix(next)).toEqual([
			["", ""],
			["1", "2"],
			["3", "4"],
		]);
	});

	it("leaves the header alone when the rect starts below it", () => {
		const next = clearCells(sample(), { top: 0, bottom: 1, left: 0, right: 1 });
		expect(documentToMatrix(next)).toEqual([
			["A", "B"],
			["", ""],
			["", ""],
		]);
	});

	it("returns the same document when the header is already empty", () => {
		const before = docOf([
			["", ""],
			["1", "2"],
		]);
		expect(
			clearCells(before, {
				top: HEADER_ROW,
				bottom: HEADER_ROW,
				left: 0,
				right: 1,
			}),
		).toBe(before);
	});
});

describe("paste", () => {
	it("grows the table when the payload runs past its edges", () => {
		const next = pasteMatrix(sample(), { rowIndex: 1, columnIndex: 1 }, [
			["x", "y"],
			["z", "w"],
		]);
		expect(documentToMatrix(next)).toEqual([
			["A", "B", ""],
			["1", "2", ""],
			["3", "x", "y"],
			["", "z", "w"],
		]);
	});

	it("writes in place when the payload fits", () => {
		const next = pasteMatrix(sample(), { rowIndex: 0, columnIndex: 0 }, [
			["x"],
		]);
		expect(documentToMatrix(next)).toEqual([
			["A", "B"],
			["x", "2"],
			["3", "4"],
		]);
	});
});

describe("header handling", () => {
	it("treats an all-text first row as headers", () => {
		expect(
			detectHeaderRow([
				["Name", "Role"],
				["Ingrid", "Designer"],
			]),
		).toBe(true);
	});

	it("treats a first row containing a number as data", () => {
		expect(
			detectHeaderRow([
				["Ingrid", "31"],
				["Paulo", "24"],
			]),
		).toBe(false);
	});

	it("treats a first row with a blank cell as data", () => {
		expect(
			detectHeaderRow([
				["Ingrid", ""],
				["Paulo", "x"],
			]),
		).toBe(false);
	});

	// The table still has exactly one header row; it simply has no text yet.
	// Inventing "Column 1" here would write content the user never typed and
	// then serialize it into every format.
	it("leaves the header row empty when row 1 is data", () => {
		const document = documentFromMatrix(
			[
				["Ingrid", "31"],
				["Paulo", "24"],
			],
			{ headerRow: false },
		);
		expect(document.columns.map((column) => column.header)).toEqual(["", ""]);
		expect(document.rows).toHaveLength(2);
	});

	it("keeps a blank header from the source blank", () => {
		const document = documentFromMatrix(
			[
				["Name", ""],
				["Ingrid", "Designer"],
			],
			{ headerRow: true },
		);
		expect(document.columns.map((column) => column.header)).toEqual([
			"Name",
			"",
		]);
	});

	it("demotes the header row into data and leaves the header empty", () => {
		const next = demoteHeaderToRow(sample());
		expect(documentToMatrix(next)).toEqual([
			["", ""],
			["A", "B"],
			["1", "2"],
			["3", "4"],
		]);
	});
});

describe("empty document", () => {
	it("starts with something to type into", () => {
		const document = createEmptyDocument();
		expect(document.columns.length).toBeGreaterThan(0);
		expect(document.rows.length).toBeGreaterThan(0);
	});

	it("starts with unnamed columns rather than seeded names", () => {
		expect(
			createEmptyDocument().columns.map((column) => column.header),
		).toEqual(["", "", ""]);
	});

	it("is blank when nothing has been typed", () => {
		expect(isDocumentBlank(createEmptyDocument())).toBe(true);
	});

	// The trap this closes: while "Column 1" was a generated name, a user who
	// deliberately typed it had a document Tabelo considered untouched and would
	// clear without confirming.
	it("is not blank when a header literally reads Column 1", () => {
		const document = documentFromMatrix(
			[
				["Column 1", ""],
				["", ""],
			],
			{
				headerRow: true,
			},
		);
		expect(isDocumentBlank(document)).toBe(false);
	});

	it("is not blank when only a cell holds content", () => {
		expect(
			isDocumentBlank(
				docOf([
					["", ""],
					["x", ""],
				]),
			),
		).toBe(false);
	});
});

describe("blank headers survive structural edits", () => {
	const unnamed = () =>
		documentFromMatrix(
			[
				["", ""],
				["1", "2"],
			],
			{
				headerRow: true,
			},
		);

	it("does not rename a blank header when a column is inserted", () => {
		const next = insertColumns(unnamed(), 0);
		expect(next.columns.map((column) => column.header)).toEqual(["", "", ""]);
	});

	it("does not rename a blank header when a column is deleted", () => {
		const next = deleteColumns(unnamed(), [0]);
		expect(next.columns.map((column) => column.header)).toEqual([""]);
	});

	it("keeps a named neighbour named when a column is inserted", () => {
		const next = insertColumns(
			docOf([
				["Name", ""],
				["Ingrid", ""],
			]),
			1,
		);
		expect(next.columns.map((column) => column.header)).toEqual([
			"Name",
			"",
			"",
		]);
	});
});
