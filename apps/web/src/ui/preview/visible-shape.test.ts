import { describe, expect, it } from "vitest";
import { documentFromMatrix } from "@/core/document";
import type { TableDocument } from "@/core/types";
import { visibleShape } from "./visible-shape";

function docOf(matrix: string[][]): TableDocument {
	return documentFromMatrix(matrix, { headerRow: true });
}

function headersOf(document: { columns: readonly { header: string }[] }) {
	return document.columns.map((column) => column.header);
}

describe("visibleShape", () => {
	it("leaves out a column with no value in any row", () => {
		const shape = visibleShape(
			docOf([
				["Name", "City", "Notes"],
				["Ingrid", "Rio", ""],
				["Paulo", "Madrid", ""],
			]),
		);

		expect(headersOf(shape)).toEqual(["Name", "City"]);
		expect(shape.rows).toHaveLength(2);
	});

	it("leaves out a row with no value in any column", () => {
		const document = docOf([
			["Name", "City"],
			["Ingrid", "Rio"],
			["", ""],
			["Paulo", "Madrid"],
		]);

		const shape = visibleShape(document);

		expect(shape.rows).toEqual([document.rows[0], document.rows[2]]);
		expect(shape.columns).toBe(document.columns);
	});

	// Headers are not cell values, so a table whose columns are named but whose
	// body is untouched has not been filled in. It keeps every row and column
	// rather than collapsing to nothing.
	it("keeps the whole shape when no cell anywhere holds a value", () => {
		const document = docOf([
			["Name", "City"],
			["", ""],
			["", ""],
		]);

		const shape = visibleShape(document);

		expect(shape.columns).toBe(document.columns);
		expect(shape.rows).toBe(document.rows);
	});

	it("treats a missing cell key as empty", () => {
		const document: TableDocument = {
			columns: [
				{ id: "column-name", header: "Name", align: "default" },
				{ id: "column-city", header: "City", align: "default" },
			],
			// The city cell is absent rather than empty, which is a shape the
			// document type explicitly allows.
			rows: [{ id: "row-one", cells: { "column-name": "Ingrid" } }],
		};

		expect(headersOf(visibleShape(document))).toEqual(["Name"]);
	});

	// Pinning the exact emptiness rule: a cell holding only spaces is content.
	// Tabelo never reformats or trims cell values, so a future change to this
	// has to be a deliberate one rather than a quiet side effect.
	it("counts a whitespace-only cell as content", () => {
		const shape = visibleShape(
			docOf([
				["Name", "City"],
				["Ingrid", " "],
			]),
		);

		expect(headersOf(shape)).toEqual(["Name", "City"]);
	});

	// Identity rather than equality, because this is what lets the rendered rows
	// sit behind a memo boundary that a fresh array on every keystroke would
	// defeat. See the comment on `visibleShape`.
	it("returns the document's own arrays when neither axis loses anything", () => {
		const document = docOf([
			["Name", "City"],
			["Ingrid", "Rio"],
			["Paulo", "Madrid"],
		]);

		const shape = visibleShape(document);

		expect(shape.columns).toBe(document.columns);
		expect(shape.rows).toBe(document.rows);
	});
});
