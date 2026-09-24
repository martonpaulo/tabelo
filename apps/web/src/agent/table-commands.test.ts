import type { TableOperation } from "@tabelo/agent-protocol";
import { describe, expect, it } from "vitest";
import { readCell } from "@/core/cell-value";
import { documentFromMatrix } from "@/core/document";
import { createSelection } from "@/core/selection";
import type { TableDocument } from "@/core/types";
import { prepareTable, preserveSelection } from "./table-commands";

describe("agent table batches", () => {
	it("refuses an unsupported operation without returning a partially prepared batch", () => {
		const original = documentFromMatrix([["Name"], ["Ingrid"]], {
			headerRow: true,
		});
		const outcome = prepareTable(original, [
			{
				kind: "set_header",
				columnId: required(original.columns[0]).id,
				value: "Changed",
			},
			{ kind: "unsupported" } as unknown as TableOperation,
		]);
		expect(outcome).toEqual({ ok: false, code: "invalid_request" });
		expect(original.columns[0]?.header).toBe("Name");
	});

	it("moves by entity identity and keeps the selected surviving row", () => {
		const original = documentFromMatrix(
			[
				["Name", "City"],
				["Ingrid", "Rio"],
				["Paulo", "Madrid"],
				["Mabel", "Buenos Aires"],
			],
			{ headerRow: true },
		);
		const first = required(original.rows[0]);
		const last = required(original.rows[2]);
		const outcome = prepareTable(original, [
			{
				kind: "move_row",
				id: first.id,
				anchor: { side: "after", id: last.id },
			},
		]);
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(outcome.document.rows.map((row) => row.id)).toEqual([
			required(original.rows[1]).id,
			last.id,
			first.id,
		]);
		expect(
			preserveSelection(
				createSelection({ row: 0, column: 0 }),
				original,
				outcome.document,
			).ranges[0]?.focus,
		).toEqual({ row: 2, column: 0 });
	});

	it("requires an explicit choice before replacing inline content", () => {
		const base = documentFromMatrix([["Name"], ["Ingrid"]], {
			headerRow: true,
		});
		const row = required(base.rows[0]);
		const column = required(base.columns[0]);
		const original: TableDocument = {
			...base,
			rows: [
				{
					...row,
					cells: {
						[column.id]: {
							kind: "inline",
							nodes: [{ kind: "text", text: "Ingrid", marks: ["bold"] }],
						},
					},
				},
			],
		};
		const write = { rowId: row.id, columnId: column.id, value: "Paulo" };
		expect(
			prepareTable(original, [{ kind: "set_cells", cells: [write] }]),
		).toEqual({ ok: false, code: "would_drop_inline_content" });
		const replaced = prepareTable(original, [
			{ kind: "set_cells", cells: [{ ...write, replaceInline: true }] },
		]);
		expect(
			replaced.ok && readCell(required(replaced.document.rows[0]), column.id),
		).toBe("Paulo");
	});

	it("refuses oversized insertion and duplicate references before committing", () => {
		const original = documentFromMatrix([["Name"], ["Ingrid"], ["Paulo"]], {
			headerRow: true,
		});
		expect(
			prepareTable(original, [
				{
					kind: "insert_rows",
					anchor: { edge: "end" },
					refs: Array.from({ length: 500 }, (_, index) => `$row${index}`),
				},
			]),
		).toEqual({ ok: false, code: "table_too_large" });
		expect(
			prepareTable(original, [
				{
					kind: "insert_rows",
					anchor: { edge: "end" },
					refs: ["$row", "$row"],
				},
			]),
		).toEqual({ ok: false, code: "duplicate_reference" });
		expect(original.rows).toHaveLength(2);
	});

	it("preserves the minimum shape when asked to remove every row or column", () => {
		const original = documentFromMatrix([["Name"], ["Ingrid"]], {
			headerRow: true,
		});
		expect(
			prepareTable(original, [
				{ kind: "delete_rows", ids: [required(original.rows[0]).id] },
			]),
		).toEqual({ ok: false, code: "last_row" });
		expect(
			prepareTable(original, [
				{ kind: "delete_columns", ids: [required(original.columns[0]).id] },
			]),
		).toEqual({ ok: false, code: "last_column" });
	});
	it("creates and fills a column by reference without changing existing values", () => {
		const original = documentFromMatrix([["Name"], ["Ingrid"], ["Paulo"]], {
			headerRow: true,
		});
		const rowId = original.rows[0]?.id ?? "";
		const outcome = prepareTable(original, [
			{
				kind: "insert_columns",
				anchor: { edge: "end" },
				columns: [{ ref: "$count", header: "Count" }],
			},
			{ kind: "set_cells", cells: [{ rowId, columnId: "$count", value: 3 }] },
		]);
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(outcome.document.columns.map((column) => column.header)).toEqual([
			"Name",
			"Count",
		]);
		expect(
			readCell(
				required(outcome.document.rows[0]),
				required(outcome.created.$count),
			),
		).toBe(3);
		expect(original.columns).toHaveLength(1);
		expect(
			readCell(
				required(outcome.document.rows[1]),
				required(original.columns[0]).id,
			),
		).toBe("Paulo");
	});

	it("rejects the entire proposal when a later target is missing", () => {
		const original = documentFromMatrix([["Name"], ["Ingrid"]], {
			headerRow: true,
		});
		const outcome = prepareTable(original, [
			{
				kind: "insert_columns",
				anchor: { edge: "end" },
				columns: [{ ref: "$extra", header: "Extra" }],
			},
			{
				kind: "set_cells",
				cells: [{ rowId: "deleted", columnId: "$extra", value: "lost" }],
			},
		]);
		expect(outcome).toEqual({ ok: false, code: "target_missing" });
		expect(original.columns).toHaveLength(1);
	});
});

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("Expected fixture value.");
	return value;
}
