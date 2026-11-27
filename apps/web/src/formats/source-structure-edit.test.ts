import { assert, describe, expect, it } from "vitest";
import { readCell } from "@/core/cell-value";
import { documentFromMatrix, reconcileDocument } from "@/core/document";
import type { Alignment, TableDocument } from "@/core/types";
import { csvCodec, getCodec, type TableCodec } from "@/formats";

// #546. Deleting or inserting a line or a column as source text must keep
// every other row and column as it was: its id, its cell types, its alignment,
// and its expected type. Reconciliation used to pair them by index, so each of
// those moved to the neighbour of the line or column the text removed.

function parseWith(codec: TableCodec, text: string): TableDocument {
	const result = codec.parse(text);
	assert(result.ok, `${codec.id} must parse ${JSON.stringify(text)}`);
	return result.document;
}

function withColumns(
	document: TableDocument,
	change: (index: number) => {
		readonly align?: Alignment;
		readonly expectedType?: "number";
	},
): TableDocument {
	return {
		...document,
		columns: document.columns.map((column, index) => ({
			...column,
			...change(index),
		})),
	};
}

describe("source text that inserts or deletes structure", () => {
	it("keeps a deleted Markdown column's expected type off its neighbour", () => {
		const markdown = getCodec("markdown");
		const current = withColumns(
			documentFromMatrix(
				[
					["Name", "Age", "City"],
					["Ingrid", "30", "Rio"],
				],
				{ headerRow: true },
			),
			(index) => (index === 1 ? { expectedType: "number" } : {}),
		);
		const [name, , city] = current.columns;
		assert(name && city);

		const next = reconcileDocument(
			current,
			parseWith(markdown, "| Name | City |\n| --- | --- |\n| Ingrid | Rio |\n"),
			markdown.reconciliation,
		);

		expect(next.columns.map((column) => column.id)).toEqual([name.id, city.id]);
		expect(next.columns.map((column) => column.expectedType)).toEqual([
			"text",
			"text",
		]);
	});

	it("keeps CSV alignment with its column when one is deleted or inserted", () => {
		const current = withColumns(
			documentFromMatrix(
				[
					["Name", "Age", "City"],
					["Ingrid", "30", "Rio"],
				],
				{ headerRow: true },
			),
			(index) => ({
				align: (["default", "right", "center"] as const)[index] ?? "default",
			}),
		);

		const deleted = reconcileDocument(
			current,
			parseWith(csvCodec, "Name,City\nIngrid,Rio\n"),
			csvCodec.reconciliation,
		);
		expect(deleted.columns.map((column) => column.align)).toEqual([
			"default",
			"center",
		]);

		const inserted = reconcileDocument(
			current,
			parseWith(csvCodec, "Role,Name,Age,City\nNurse,Ingrid,30,Rio\n"),
			csvCodec.reconciliation,
		);
		expect(inserted.columns.map((column) => column.align)).toEqual([
			"default",
			"default",
			"right",
			"center",
		]);
		expect(inserted.columns.slice(1).map((column) => column.id)).toEqual(
			current.columns.map((column) => column.id),
		);
	});

	it("keeps a CSV row's types and id when the line above it is deleted", () => {
		const parsed = documentFromMatrix(
			[
				["Name", "Age"],
				["Ingrid", "30"],
				["Paulo", "30"],
			],
			{ headerRow: true },
		);
		const [, age] = parsed.columns;
		const [ingrid, paulo] = parsed.rows;
		assert(age && ingrid && paulo);
		// Ingrid's age is a number; Paulo's is the string a text source stated.
		const current: TableDocument = {
			...parsed,
			rows: [{ ...ingrid, cells: { ...ingrid.cells, [age.id]: 30 } }, paulo],
		};

		const next = reconcileDocument(
			current,
			parseWith(csvCodec, "Name,Age\nPaulo,30\n"),
			csvCodec.reconciliation,
		);
		const [survivor] = next.rows;
		assert(survivor);

		expect(next.rows).toHaveLength(1);
		expect(survivor.id).toBe(paulo.id);
		expect(readCell(survivor, age.id)).toBe("30");
	});
});
