import { describe, expect, it } from "vitest";
import { dataEdgeTarget, type JumpDirection } from "./navigation";
import { HEADER_ROW } from "./selection";
import type { CellValue, TableDocument } from "./types";

// A table written the way it reads on screen: the first array is the header
// row, every later array is a data row. `null` stands for a cell someone left
// deliberately empty and is expected to navigate exactly like `""`.
function tableOf(
	header: readonly string[],
	...rows: readonly (readonly CellValue[])[]
): TableDocument {
	return {
		columns: header.map((text, index) => ({
			id: `c${index}`,
			header: text,
			align: "default" as const,
			expectedType: "text" as const,
		})),
		rows: rows.map((cells, index) => ({
			id: `r${index}`,
			cells: Object.fromEntries(cells.map((value, at) => [`c${at}`, value])),
		})),
	};
}

function jump(
	document: TableDocument,
	from: readonly [number, number],
	direction: JumpDirection,
): [number, number] {
	const target = dataEdgeTarget(
		document,
		{ row: from[0], column: from[1] },
		direction,
	);
	return [target.row, target.column];
}

const column = tableOf(
	["Name"],
	["Ingrid"],
	["Paulo"],
	[""],
	[""],
	["Mabel"],
	[""],
	["Felix"],
);

describe("jumping down a column", () => {
	it("stops at the far edge of the run it is already in", () => {
		expect(jump(column, [0, 0], "down")).toEqual([1, 0]);
	});

	it("crosses a gap to the next cell with content", () => {
		expect(jump(column, [1, 0], "down")).toEqual([4, 0]);
	});

	it("crosses a gap from inside the gap", () => {
		expect(jump(column, [2, 0], "down")).toEqual([4, 0]);
	});

	it("lands on the last row when nothing below holds content", () => {
		expect(
			jump(tableOf(["Name"], ["Ingrid"], [""], [""]), [0, 0], "down"),
		).toEqual([2, 0]);
	});

	it("stays put at the last row", () => {
		expect(jump(column, [6, 0], "down")).toEqual([6, 0]);
	});
});

describe("jumping up a column", () => {
	it("stops at the far edge of the run it is already in", () => {
		expect(jump(column, [1, 0], "up")).toEqual([0, 0]);
	});

	it("crosses a gap to the next cell with content", () => {
		expect(jump(column, [4, 0], "up")).toEqual([1, 0]);
	});

	it("reaches the header row from the first data row", () => {
		expect(jump(column, [0, 0], "up")).toEqual([HEADER_ROW, 0]);
	});

	it("lands on the header row when nothing above holds content", () => {
		expect(
			jump(tableOf(["Name"], [""], [""], ["Felix"]), [2, 0], "up"),
		).toEqual([HEADER_ROW, 0]);
	});

	it("stays on the header row", () => {
		expect(jump(column, [HEADER_ROW, 0], "up")).toEqual([HEADER_ROW, 0]);
	});
});

describe("the header row as a vertical endpoint", () => {
	it("starts a downward jump at the first data row rather than continuing its own text", () => {
		// `Name` and `Ingrid` would form one run if the header counted as data,
		// which would send this jump to row 1 instead.
		expect(jump(column, [HEADER_ROW, 0], "down")).toEqual([0, 0]);
	});

	it("crosses a leading gap on the way down from the header", () => {
		expect(
			jump(tableOf(["Name"], [""], [""], ["Felix"]), [HEADER_ROW, 0], "down"),
		).toEqual([2, 0]);
	});

	it("lands on the last row when the whole column is empty", () => {
		expect(
			jump(tableOf(["Name"], [""], [""]), [HEADER_ROW, 0], "down"),
		).toEqual([1, 0]);
	});
});

describe("jumping across a row", () => {
	const row = tableOf(
		["Name", "City", "Role", "Age"],
		["Ingrid", "Rio", "", "35"],
	);

	it("stops at the far edge of the run", () => {
		expect(jump(row, [0, 0], "right")).toEqual([0, 1]);
	});

	it("crosses a gap to the next cell with content", () => {
		expect(jump(row, [0, 1], "right")).toEqual([0, 3]);
	});

	it("stays put at the last column", () => {
		expect(jump(row, [0, 3], "right")).toEqual([0, 3]);
	});

	it("walks the header row like any other row", () => {
		expect(jump(row, [HEADER_ROW, 0], "right")).toEqual([HEADER_ROW, 3]);
	});

	it("stops at the first column when nothing to the left holds content", () => {
		expect(
			jump(tableOf(["", "", "Role"], ["", "", "Analyst"]), [0, 2], "left"),
		).toEqual([0, 0]);
	});
});

describe("cells that only look empty", () => {
	it("treats a stored null as empty, the way the grid draws it", () => {
		const document = tableOf(["Name"], ["Ingrid"], [null], ["Mabel"]);
		expect(jump(document, [0, 0], "down")).toEqual([2, 0]);
	});

	it("treats a number and a false as content", () => {
		const document = tableOf(["Age"], [0], [false], ["Mabel"]);
		expect(jump(document, [0, 0], "down")).toEqual([2, 0]);
	});
});

describe("degenerate tables", () => {
	it("returns the header row for a table with no data rows", () => {
		const empty = tableOf(["Name"]);
		expect(jump(empty, [HEADER_ROW, 0], "down")).toEqual([HEADER_ROW, 0]);
		expect(jump(empty, [HEADER_ROW, 0], "up")).toEqual([HEADER_ROW, 0]);
	});

	it("stays put on a single-cell table", () => {
		const single = tableOf(["Name"], ["Ingrid"]);
		expect(jump(single, [0, 0], "down")).toEqual([0, 0]);
		expect(jump(single, [0, 0], "left")).toEqual([0, 0]);
		expect(jump(single, [0, 0], "right")).toEqual([0, 0]);
	});
});
