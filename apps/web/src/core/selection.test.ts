import { describe, expect, it } from "vitest";
import {
	activeRange,
	clampSelection,
	createRange,
	createSelection,
	type GridSelection,
	HEADER_ROW,
	isContiguous,
	moveFocusKeepingRegions,
	rectCoversHeader,
	rectDataRows,
	selectedAxis,
	selectionColumns,
	selectionContains,
	selectionDataRows,
	selectionRect,
	selectionRects,
	structureDeletionGuard,
	toggleSelectionRegion,
} from "./selection";

function columnSelection(...columns: readonly number[]): GridSelection {
	return {
		ranges: columns.map((column) =>
			createRange({ row: HEADER_ROW, column }, "column"),
		),
		activeIndex: columns.length - 1,
	};
}

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
				ranges: [
					{
						anchor: { row: HEADER_ROW, column: 0 },
						focus: { row: 1, column: 1 },
						mode: "cell",
					},
				],
				activeIndex: 0,
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
		const selection = createSelection({ row: HEADER_ROW, column: 0 });

		expect(activeRange(clampSelection(selection, 2, 2)).anchor.row).toBe(
			HEADER_ROW,
		);
	});

	it("clamps a selection the document shrank underneath", () => {
		const selection: GridSelection = {
			ranges: [
				{
					anchor: { row: HEADER_ROW, column: 5 },
					focus: { row: 9, column: 9 },
					mode: "cell",
				},
			],
			activeIndex: 0,
		};

		expect(activeRange(clampSelection(selection, 2, 3))).toMatchObject({
			anchor: { row: HEADER_ROW, column: 2 },
			focus: { row: 1, column: 2 },
		});
	});

	it("never reports a header-only selection as covering every row", () => {
		const headerOnly = createSelection({ row: HEADER_ROW, column: 0 }, "row");

		expect(structureDeletionGuard(headerOnly, 3, 2).wouldRemoveAllRows).toBe(
			false,
		);
	});
});

describe("a selection of several regions", () => {
	it("starts as one region, which is what every unmodified gesture makes", () => {
		const selection = createSelection({ row: 0, column: 0 });

		expect(selection.ranges).toHaveLength(1);
		expect(isContiguous(selection)).toBe(true);
	});

	it("reports every region's rectangle, not only the active one", () => {
		expect(selectionRects(columnSelection(0, 2), 2, 3)).toEqual([
			{ top: HEADER_ROW, bottom: 1, left: 0, right: 0 },
			{ top: HEADER_ROW, bottom: 1, left: 2, right: 2 },
		]);
	});

	it("answers containment across every region", () => {
		const selection = columnSelection(0, 2);

		expect(selectionContains(selection, 2, 3, 0, 0)).toBe(true);
		expect(selectionContains(selection, 2, 3, 0, 2)).toBe(true);
		expect(selectionContains(selection, 2, 3, 0, 1)).toBe(false);
	});

	it("unions rows and columns rather than adding region sizes", () => {
		// Two regions that both cover column 1 still describe one column, which
		// is what keeps a delete from acting on it twice.
		const overlapping: GridSelection = {
			ranges: [
				createRange({ row: HEADER_ROW, column: 1 }, "column"),
				createRange({ row: HEADER_ROW, column: 1 }, "column"),
				createRange({ row: HEADER_ROW, column: 3 }, "column"),
			],
			activeIndex: 2,
		};

		expect(selectionColumns(overlapping, 2, 4)).toEqual([1, 3]);
		expect(selectionDataRows(overlapping, 2, 4)).toEqual([0, 1]);
	});

	it("extends only the active region's rect, leaving the rest alone", () => {
		const selection = columnSelection(0, 2);

		expect(selectionRect(selection, 2, 3)).toEqual({
			top: HEADER_ROW,
			bottom: 1,
			left: 2,
			right: 2,
		});
	});
});

describe("the modifier gesture", () => {
	it("adds a column that is not selected yet", () => {
		const next = toggleSelectionRegion(
			createSelection({ row: HEADER_ROW, column: 0 }, "column"),
			{ row: HEADER_ROW, column: 2 },
			"column",
		);

		expect(selectionColumns(next, 2, 3)).toEqual([0, 2]);
		expect(next.activeIndex).toBe(1);
	});

	it("removes a column that is already selected", () => {
		const next = toggleSelectionRegion(
			columnSelection(0, 2),
			{ row: HEADER_ROW, column: 2 },
			"column",
		);

		expect(selectionColumns(next, 2, 3)).toEqual([0]);
	});

	it("splits one region in two when the removed column sat in its middle", () => {
		const range = {
			anchor: { row: HEADER_ROW, column: 0 },
			focus: { row: HEADER_ROW, column: 2 },
			mode: "column" as const,
		};
		const next = toggleSelectionRegion(
			{ ranges: [range], activeIndex: 0 },
			{ row: HEADER_ROW, column: 1 },
			"column",
		);

		expect(next.ranges).toHaveLength(2);
		expect(selectionColumns(next, 2, 3)).toEqual([0, 2]);
	});

	it("refuses to empty the selection", () => {
		const only = createSelection({ row: HEADER_ROW, column: 0 }, "column");

		expect(
			toggleSelectionRegion(only, { row: HEADER_ROW, column: 0 }, "column"),
		).toBe(only);
	});

	it("adds and removes rows on the other axis the same way", () => {
		const added = toggleSelectionRegion(
			createSelection({ row: 0, column: 0 }, "row"),
			{ row: 2, column: 0 },
			"row",
		);
		expect(selectionDataRows(added, 3, 2)).toEqual([0, 2]);

		const removed = toggleSelectionRegion(added, { row: 0, column: 0 }, "row");
		expect(selectionDataRows(removed, 3, 2)).toEqual([2]);
	});

	// A rectangle has no axis to subtract along, so a cell click adds a region
	// unless it names one that is exactly that single cell.
	it("adds a cell region and removes it again", () => {
		const added = toggleSelectionRegion(
			createSelection({ row: 0, column: 0 }),
			{ row: 2, column: 1 },
			"cell",
		);
		expect(added.ranges).toHaveLength(2);

		const removed = toggleSelectionRegion(added, { row: 2, column: 1 }, "cell");
		expect(removed.ranges).toHaveLength(1);
		expect(activeRange(removed).focus).toEqual({ row: 0, column: 0 });
	});
});

// The keyboard's half of the modifier. Without a way to move the focus that
// keeps the other areas, a second column is unreachable without a pointer.
describe("moving the focus while keeping the regions", () => {
	it("moves the single cell the focus sits on rather than piling areas up", () => {
		const moved = moveFocusKeepingRegions(
			createSelection({ row: 0, column: 0 }),
			{
				row: 0,
				column: 1,
			},
		);

		expect(moved.ranges).toHaveLength(1);
		expect(activeRange(moved).focus).toEqual({ row: 0, column: 1 });
	});

	it("lands in a new area beside one the user chose", () => {
		const moved = moveFocusKeepingRegions(
			createSelection({ row: HEADER_ROW, column: 0 }, "column"),
			{ row: 0, column: 2 },
		);

		expect(moved.ranges).toHaveLength(2);
		expect(selectionColumns(moved, 2, 3)).toEqual([0, 2]);
	});

	it("upgrades that provisional cell instead of painting it twice", () => {
		const walked = moveFocusKeepingRegions(
			createSelection({ row: HEADER_ROW, column: 0 }, "column"),
			{ row: 0, column: 2 },
		);
		const built = toggleSelectionRegion(
			walked,
			{ row: 0, column: 2 },
			"column",
		);

		expect(built.ranges).toHaveLength(2);
		expect(built.ranges.every((range) => range.mode === "column")).toBe(true);
		expect(selectionColumns(built, 2, 3)).toEqual([0, 2]);
	});
});

describe("clamping across regions", () => {
	it("clamps every region, not only the active one", () => {
		const selection: GridSelection = {
			ranges: [
				createRange({ row: 9, column: 9 }),
				createRange({ row: 0, column: 0 }),
			],
			activeIndex: 1,
		};

		const clamped = clampSelection(selection, 2, 2);
		expect(clamped.ranges[0]?.anchor).toEqual({ row: 1, column: 1 });
		expect(clamped.ranges[1]?.anchor).toEqual({ row: 0, column: 0 });
	});

	it("drops a region that clamped onto another, and never empties the list", () => {
		const selection: GridSelection = {
			ranges: [
				createRange({ row: HEADER_ROW, column: 4 }, "column"),
				createRange({ row: HEADER_ROW, column: 5 }, "column"),
			],
			activeIndex: 1,
		};

		const clamped = clampSelection(selection, 2, 2);
		expect(clamped.ranges).toHaveLength(1);
		expect(clamped.activeIndex).toBe(0);
		expect(selectionColumns(clamped, 2, 2)).toEqual([1]);
	});
});

describe("the axis a region was selected on", () => {
	it("reports only the columns picked as columns", () => {
		const mixed: GridSelection = {
			ranges: [
				createRange({ row: HEADER_ROW, column: 0 }, "column"),
				{
					anchor: { row: 0, column: 2 },
					focus: { row: 1, column: 3 },
					mode: "cell",
				},
			],
			activeIndex: 1,
		};

		expect(selectedAxis(mixed, "column", 2, 4)).toEqual([0]);
		expect(selectionColumns(mixed, 2, 4)).toEqual([0, 2, 3]);
	});
});

describe("structure deletion guard", () => {
	it("guards a full column selection but permits a partial selection", () => {
		const full: GridSelection = {
			ranges: [
				{
					anchor: { row: 0, column: 0 },
					focus: { row: 0, column: 2 },
					mode: "column",
				},
			],
			activeIndex: 0,
		};
		const partial = createSelection({ row: 0, column: 1 }, "column");

		expect(structureDeletionGuard(full, 2, 3)).toEqual({
			wouldRemoveAllRows: true,
			wouldRemoveAllColumns: true,
		});
		expect(structureDeletionGuard(partial, 2, 3)).toEqual({
			wouldRemoveAllRows: true,
			wouldRemoveAllColumns: false,
		});
	});

	it("guards a full row selection but permits a single cell", () => {
		const full: GridSelection = {
			ranges: [
				{
					anchor: { row: 0, column: 0 },
					focus: { row: 2, column: 0 },
					mode: "row",
				},
			],
			activeIndex: 0,
		};
		const cell = createSelection({ row: 1, column: 1 });

		expect(structureDeletionGuard(full, 3, 2).wouldRemoveAllRows).toBe(true);
		expect(structureDeletionGuard(cell, 3, 2)).toEqual({
			wouldRemoveAllRows: false,
			wouldRemoveAllColumns: false,
		});
	});

	it("counts distinct coverage across multiple regions", () => {
		const spread: GridSelection = {
			ranges: [
				createRange({ row: HEADER_ROW, column: 0 }, "column"),
				createRange({ row: HEADER_ROW, column: 0 }, "column"),
				{
					anchor: { row: HEADER_ROW, column: 1 },
					focus: { row: HEADER_ROW, column: 2 },
					mode: "column",
				},
			],
			activeIndex: 2,
		};

		expect(structureDeletionGuard(spread, 2, 3).wouldRemoveAllColumns).toBe(
			true,
		);
		expect(
			structureDeletionGuard(columnSelection(0, 2), 2, 3).wouldRemoveAllColumns,
		).toBe(false);
	});
});
