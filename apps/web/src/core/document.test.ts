import { describe, expect, it } from "vitest";
import { documentFromMatrix, reconcileDocument } from "./document";
import type { TableDocument } from "./types";

function docOf(matrix: string[][]): TableDocument {
	return documentFromMatrix(matrix, { headerRow: true });
}

const people = [
	["Name", "City", "Age"],
	["Ingrid", "Rio", "34"],
	["Paulo", "Madrid", "29"],
	["Mabel", "Lisbon", "41"],
];

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
