import { describe, expect, it } from "vitest";
import {
	createColumn,
	createEmptyDocument,
	createRow,
	documentFromMatrix,
	documentToMatrix,
	isDocumentBlank,
	reconcileDocument,
} from "./document";
import type { CellValue, TableDocument } from "./types";

function docOf(matrix: string[][]): TableDocument {
	return documentFromMatrix(matrix, { headerRow: true });
}

const people = [
	["Name", "City", "Age"],
	["Ingrid", "Rio", "34"],
	["Paulo", "Madrid", "29"],
	["Mabel", "Lisbon", "41"],
];

describe("the typed document foundation", () => {
	it("expects text until something says otherwise", () => {
		expect(createColumn("Name").expectedType).toBe("text");
		expect(
			createEmptyDocument().columns.every(
				(column) => column.expectedType === "text",
			),
		).toBe(true);
		expect(
			docOf(people).columns.every((column) => column.expectedType === "text"),
		).toBe(true);
	});

	// Typed entry belongs to a later change. A new row is empty text even in a
	// column that expects numbers, so nothing here invents a `0` or a `null`.
	it("starts a new row as empty text whatever the column expects", () => {
		const columns = [
			{ ...createColumn("Age"), expectedType: "number" as const },
		];
		expect(Object.values(createRow(columns).cells)).toEqual([""]);
	});

	it("carries scalars into a row and projects them at the matrix seam", () => {
		const columns = [createColumn("Name"), createColumn("Age")];
		const row = createRow(columns, ["Ingrid", 35]);
		const document: TableDocument = { columns, rows: [row] };

		expect(Object.values(row.cells)).toEqual(["Ingrid", 35]);
		expect(documentToMatrix(document, { includeHeader: false })).toEqual([
			["Ingrid", "35"],
		]);
	});

	// An explicit `null` projects to nothing and is still content: the guard in
	// front of the destructive actions must not read it as an untouched table.
	it("does not count an explicit null as a blank document", () => {
		const columns = [createColumn("")];
		expect(isDocumentBlank({ columns, rows: [createRow(columns)] })).toBe(true);
		expect(
			isDocumentBlank({ columns, rows: [createRow(columns, [null])] }),
		).toBe(false);
	});

	// A text format cannot express an expectation, so a parse must return it
	// from the current column rather than reset it to the default.
	it("keeps the expected type through a source edit", () => {
		const current = docOf(people);
		const typed: TableDocument = {
			...current,
			columns: current.columns.map((column, index) =>
				index === 2 ? { ...column, expectedType: "number" as const } : column,
			),
		};
		const edited = people.map((row, index) =>
			index === 0 ? ["Name", "City", "Years"] : row,
		);

		const next = reconcileDocument(typed, docOf(edited));

		expect(next.columns[2].header).toBe("Years");
		expect(next.columns[2].expectedType).toBe("number");
	});

	it("keeps unchanged native values while changed text becomes a string", () => {
		const columns = [
			createColumn("Name"),
			{ ...createColumn("Age"), expectedType: "number" as const },
			{ ...createColumn("Active"), expectedType: "boolean" as const },
			createColumn("Notes"),
		];
		const current: TableDocument = {
			columns,
			rows: [createRow(columns, ["Ingrid", 34, true, null])],
		};
		const parsed = docOf([
			["Name", "Age", "Active", "Notes"],
			["Mabel", "34", "true", ""],
		]);

		const next = reconcileDocument(current, parsed);
		const values = next.columns.map((column) => next.rows[0]?.cells[column.id]);

		expect(values).toEqual(["Mabel", 34, true, null] satisfies CellValue[]);
		expect(next.columns.map((column) => column.id)).toEqual(
			current.columns.map((column) => column.id),
		);
		expect(next.columns.map((column) => column.expectedType)).toEqual([
			"text",
			"number",
			"boolean",
			"text",
		]);
	});

	it("turns a changed native projection into text", () => {
		const columns = [
			{ ...createColumn("Age"), expectedType: "number" as const },
		];
		const current: TableDocument = {
			columns,
			rows: [createRow(columns, [34])],
		};
		const parsed = docOf([["Age"], ["35"]]);

		const next = reconcileDocument(current, parsed);

		expect(next.rows[0]?.cells[columns[0]?.id ?? ""]).toBe("35");
		expect(typeof next.rows[0]?.cells[columns[0]?.id ?? ""]).toBe("string");
	});

	it("preserves null separately from empty text only with a previous cell", () => {
		const columns = [createColumn("Null"), createColumn("Empty")];
		const current: TableDocument = {
			columns,
			rows: [createRow(columns, [null, ""])],
		};
		const parsed = docOf([
			["Null", "Empty"],
			["", ""],
			["", ""],
		]);

		const next = reconcileDocument(current, parsed);
		const first = next.rows[0];
		const inserted = next.rows[1];

		expect(first?.cells[columns[0]?.id ?? ""]).toBeNull();
		expect(first?.cells[columns[1]?.id ?? ""]).toBe("");
		expect(Object.values(inserted?.cells ?? {})).toEqual(["", ""]);
	});

	it("keeps alignment when the source syntax cannot express it", () => {
		const columns = [{ ...createColumn("Age"), align: "right" as const }];
		const current: TableDocument = {
			columns,
			rows: [createRow(columns, [34])],
		};
		const parsed = docOf([["Years"], ["34"]]);

		const next = reconcileDocument(current, parsed, {
			cellValues: "text",
			columnAlignment: "unexpressed",
		});

		expect(next.columns[0]?.header).toBe("Years");
		expect(next.columns[0]?.align).toBe("right");
	});
});

// A source parser builds fresh identifiers every time, so reconciliation is the
// only thing standing between a keystroke and 200 newly allocated rows. These
// assertions are about object identity rather than values: identity is what the
// grid's memoised rows compare, and what selection and column preferences
// hang off.
describe("reconcileDocument identity preservation", () => {
	it("returns the current document when nothing changed", () => {
		const current = docOf(people);
		expect(reconcileDocument(current, docOf(people))).toBe(current);
	});

	it("keeps every untouched row when one row's text changed", () => {
		const current = docOf(people);
		const edited = people.map((row, index) =>
			index === 1 ? ["Ingrid", "Oslo", "34"] : row,
		);

		const next = reconcileDocument(current, docOf(edited));

		expect(next).not.toBe(current);
		expect(next.rows[0]).not.toBe(current.rows[0]);
		expect(next.rows[0].cells[next.columns[1].id]).toBe("Oslo");
		// The rows nobody typed into come back as the very same objects.
		expect(next.rows[1]).toBe(current.rows[1]);
		expect(next.rows[2]).toBe(current.rows[2]);
		// A body edit leaves the header alone, so the columns array is shared too.
		expect(next.columns).toBe(current.columns);
	});

	it("keeps every untouched column when one header changed", () => {
		const current = docOf(people);
		const edited = people.map((row, index) =>
			index === 0 ? ["Name", "Town", "Age"] : row,
		);

		const next = reconcileDocument(current, docOf(edited));

		expect(next.columns[0]).toBe(current.columns[0]);
		expect(next.columns[1]).not.toBe(current.columns[1]);
		expect(next.columns[1].header).toBe("Town");
		expect(next.columns[2]).toBe(current.columns[2]);
		// Renaming a column changes no cell, so the rows keep their identity.
		expect(next.rows).toBe(current.rows);
	});

	it("preserves row and column ids across a change", () => {
		const current = docOf(people);
		const edited = people.map((row, index) =>
			index === 2 ? ["Paulo", "Porto", "29"] : row,
		);

		const next = reconcileDocument(current, docOf(edited));

		expect(next.columns.map((column) => column.id)).toEqual(
			current.columns.map((column) => column.id),
		);
		expect(next.rows.map((row) => row.id)).toEqual(
			current.rows.map((row) => row.id),
		);
	});

	it("rebuilds rows when the column set changes rather than reusing a stale shape", () => {
		const current = docOf(people);
		const narrowed = people.map((row) => row.slice(0, 2));

		const next = reconcileDocument(current, docOf(narrowed));

		expect(next.columns).toHaveLength(2);
		for (const row of next.rows) {
			// No cell may survive keyed by the column that is gone.
			expect(Object.keys(row.cells)).toHaveLength(2);
		}
		expect(next.rows[0]).not.toBe(current.rows[0]);
	});

	it("still produces the same values it always did", () => {
		const current = docOf(people);
		const edited = [
			["Name", "City", "Age"],
			["Ingrid", "Rio", "34"],
			["Paulo", "Madrid", "30"],
			["Mabel", "Lisbon", "41"],
			["Felix", "Oslo", "52"],
		];

		const next = reconcileDocument(current, docOf(edited));

		expect(
			next.rows.map((row) =>
				next.columns.map((column) => row.cells[column.id]),
			),
		).toEqual([
			["Ingrid", "Rio", "34"],
			["Paulo", "Madrid", "30"],
			["Mabel", "Lisbon", "41"],
			["Felix", "Oslo", "52"],
		]);
	});
});
