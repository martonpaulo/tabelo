import { describe, expect, it } from "vitest";
import {
	clampSelection,
	createSelection,
	HEADER_ROW,
	rectCoversHeader,
	rectDataRows,
	selectionRect,
	structureDeletionGuard,
} from "./selection";

describe("the header row as a selection coordinate", () => {
	it("covers the header when a whole column is selected", () => {
		const rect = selectionRect(
			createSelection({ row: 0, column: 1 }, "column"),
			3,
			2,
		);

		expect(rect).toEqual({ top: HEADER_ROW, bottom: 2, left: 1, right: 1 });
		expect(rectCoversHeader(rect)).toBe(true);
	});

	it("keeps a cell rect that starts on the header", () => {
		const rect = selectionRect(
			{
				anchor: { row: HEADER_ROW, column: 0 },
				focus: { row: 1, column: 1 },
				mode: "cell",
			},
			3,
			2,
		);

		expect(rect).toEqual({ top: HEADER_ROW, bottom: 1, left: 0, right: 1 });
	});

	it("separates the data rows a rect covers from the header", () => {
		const rect = { top: HEADER_ROW, bottom: 1, left: 0, right: 0 };

		expect(rectDataRows(rect)).toEqual([0, 1]);
		expect(rectDataRows({ ...rect, bottom: HEADER_ROW })).toEqual([]);
	});

	it("clamps to the header rather than to the first data row", () => {
		const selection = {
			anchor: { row: HEADER_ROW, column: 0 },
			focus: { row: HEADER_ROW, column: 0 },
			mode: "cell" as const,
		};

		expect(clampSelection(selection, 2, 2).anchor.row).toBe(HEADER_ROW);
	});

	it("clamps a selection the document shrank underneath", () => {
		const selection = {
			anchor: { row: HEADER_ROW, column: 5 },
			focus: { row: 9, column: 9 },
			mode: "cell" as const,
		};

		expect(clampSelection(selection, 2, 3)).toMatchObject({
			anchor: { row: HEADER_ROW, column: 2 },
			focus: { row: 1, column: 2 },
		});
	});

	it("never reports a header-only selection as covering every row", () => {
		const headerOnly = createSelection({ row: HEADER_ROW, column: 0 }, "row");

		expect(structureDeletionGuard([headerOnly], 3, 2).wouldRemoveAllRows).toBe(
			false,
		);
	});
});

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
