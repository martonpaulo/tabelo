import { describe, expect, it } from "vitest";
import { documentFromMatrix } from "./document";
import { createColumnId, createRowId } from "./ids";
import { deleteRows, insertRows } from "./operations";

// The counter is module-level and shared across every test in this file, so
// none of these may assert a literal identifier value: only distinctness,
// prefix, and absence from a prior set.

describe("createRowId and createColumnId", () => {
	it("never mints the same identifier twice, across both factories", () => {
		const rowIds = Array.from({ length: 300 }, () => createRowId());
		const columnIds = Array.from({ length: 300 }, () => createColumnId());

		expect(new Set(rowIds).size).toBe(rowIds.length);
		expect(new Set(columnIds).size).toBe(columnIds.length);
		expect(new Set([...rowIds, ...columnIds]).size).toBe(
			rowIds.length + columnIds.length,
		);
	});

	it("prefixes row identifiers with r_ and column identifiers with c_", () => {
		expect(createRowId()).toMatch(/^r_/);
		expect(createColumnId()).toMatch(/^c_/);
	});

	it("does not reuse a row identifier once its row is deleted", () => {
		const document = documentFromMatrix(
			[["Name"], ["Ingrid"], ["Paulo"], ["Mabel"]],
			{ headerRow: true },
		);
		const idsBeforeDeletion = document.rows.map((row) => row.id);

		const afterDeletion = deleteRows(document, [0, 1, 2]);
		const afterInsertion = insertRows(afterDeletion, 1);
		const newId = afterInsertion.rows[1]?.id;

		expect(newId).toBeDefined();
		expect(idsBeforeDeletion).not.toContain(newId);
	});
});
