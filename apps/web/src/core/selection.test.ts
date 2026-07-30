import { describe, expect, it } from "vitest";
import { createSelection, structureDeletionGuard } from "./selection";

describe("structure deletion guard", () => {
	it("guards a full column selection but permits a partial selection", () => {
		const full = {
			...createSelection({ row: 0, column: 0 }, "column"),
			focus: { row: 0, column: 2 },
		};
		const partial = createSelection({ row: 0, column: 1 }, "column");

		expect(structureDeletionGuard([full], 2, 3)).toEqual({
			wouldRemoveAllRows: true,
			wouldRemoveAllColumns: true,
		});
		expect(structureDeletionGuard([partial], 2, 3)).toEqual({
			wouldRemoveAllRows: true,
			wouldRemoveAllColumns: false,
		});
	});

	it("guards a full row selection but permits a single cell", () => {
		const full = {
			...createSelection({ row: 0, column: 0 }, "row"),
			focus: { row: 2, column: 0 },
		};
		const cell = createSelection({ row: 1, column: 1 });

		expect(structureDeletionGuard([full], 3, 2).wouldRemoveAllRows).toBe(true);
		expect(structureDeletionGuard([cell], 3, 2)).toEqual({
			wouldRemoveAllRows: false,
			wouldRemoveAllColumns: false,
		});
	});

	it("counts distinct coverage across multiple ranges", () => {
		const first = createSelection({ row: 0, column: 0 }, "column");
		const rest = {
			...createSelection({ row: 0, column: 1 }, "column"),
			focus: { row: 0, column: 2 },
		};

		expect(
			structureDeletionGuard([first, first, rest], 2, 3).wouldRemoveAllColumns,
		).toBe(true);
	});
});
