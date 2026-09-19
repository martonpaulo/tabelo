import { assert, describe, expect, it } from "vitest";
import { readCell } from "./cell-value";
import {
	createEmptyDocument,
	documentFromMatrix,
	documentToMatrix,
	isDocumentBlank,
} from "./document";
import {
	blockMoveOffset,
	changeColumnType,
	clearCells,
	deleteColumns,
	deleteEmptyRowsAndColumns,
	deleteRows,
	duplicateColumns,
	duplicateRows,
	fillRange,
	insertColumns,
	insertRows,
	moveColumns,
	moveRows,
	pasteMatrix,
	promoteFirstRowToHeader,
	setAlignment,
	setCell,
	setCellType,
	setColumnExpectedType,
	sortRows,
	transposeDocument,
} from "./operations";
import { samplePeopleMatrix } from "./sample-data";
import { HEADER_ROW } from "./selection";
import type { CellValue, TableDocument } from "./types";

function docOf(matrix: CellValue[][]) {
	return documentFromMatrix(matrix, { headerRow: true });
}

const sample = () =>
	docOf([
		["A", "B"],
		["1", "2"],
		["3", "4"],
	]);

describe("row operations", () => {
	it("inserts a blank row at the given index", () => {
		// Index 1 is the second data row; the header is not part of the row list.
		const next = insertRows(sample(), 1);
		expect(documentToMatrix(next)).toEqual([
			["A", "B"],
			["1", "2"],
			["", ""],
			["3", "4"],
		]);
	});

	it("deletes rows and keeps identifiers stable for the survivors", () => {
		const before = sample();
		const survivor = before.rows[1];
		assert(survivor);
		const survivorId = survivor.id;
		const next = deleteRows(before, [0]);
		expect(next.rows).toHaveLength(1);
		expect(next.rows[0]?.id).toBe(survivorId);
	});

	it("never leaves the table without a row", () => {
		const next = deleteRows(sample(), [0, 1]);
		expect(next.rows).toHaveLength(1);
		expect(documentToMatrix(next)[1]).toEqual(["", ""]);
	});

	it("duplicates a row directly below itself with a fresh identifier", () => {
		const before = sample();
		const next = duplicateRows(before, [0]);
		expect(documentToMatrix(next)).toEqual([
			["A", "B"],
			["1", "2"],
			["1", "2"],
			["3", "4"],
		]);
		expect(next.rows[1]?.id).not.toBe(next.rows[2]?.id);
	});

	it("duplicates several rows without corrupting the order", () => {
		const next = duplicateRows(sample(), [0, 1]);
		expect(documentToMatrix(next)).toEqual([
			["A", "B"],
			["1", "2"],
			["1", "2"],
			["3", "4"],
			["3", "4"],
		]);
	});

	it.each([
		[{ from: 0, count: 2 }, 1, ["Mabel", "Ingrid", "Paulo", "Felix", "Amora"]],
		[{ from: 3, count: 2 }, -1, ["Ingrid", "Paulo", "Felix", "Amora", "Mabel"]],
		[{ from: 1, count: 2 }, 1, ["Ingrid", "Felix", "Paulo", "Mabel", "Amora"]],
		[{ from: 2, count: 2 }, -1, ["Ingrid", "Mabel", "Felix", "Paulo", "Amora"]],
		[{ from: 1, count: 3 }, 1, ["Ingrid", "Amora", "Paulo", "Mabel", "Felix"]],
		[{ from: 1, count: 3 }, -1, ["Paulo", "Mabel", "Felix", "Ingrid", "Amora"]],
	] as const)(
		"moves row block %o by %i without changing its order",
		(block, offset, expected) => {
			const next = moveRows(docOf(samplePeopleMatrix()), block, offset);
			expect(
				documentToMatrix(next)
					.slice(1)
					.map((row) => row[0]),
			).toEqual(expected);
		},
	);

	it("preserves row identities and cell contents while moving a block", () => {
		const before = docOf(samplePeopleMatrix());
		const moved = before.rows.slice(1, 3);
		const next = moveRows(before, { from: 1, count: 2 }, 1);

		expect(next.rows.slice(2, 4)).toEqual(moved);
		expect(documentToMatrix(next).slice(1)).toEqual([
			["Ingrid", "Rio", "Designer", "35"],
			["Felix", "Mexico City", "Analyst", "60"],
			["Paulo", "Madrid", "Developer", "35"],
			["Mabel", "Buenos Aires", "Writer", "45"],
			["Amora", "Tokyo", "Doctor", "25"],
		]);
	});

	it.each([
		[{ from: 0, count: 2 }, -1],
		[{ from: 3, count: 2 }, 1],
		[{ from: -1, count: 2 }, 1],
		[{ from: 1, count: 0 }, 1],
		[{ from: 4, count: 2 }, -1],
	] as const)(
		"returns the original document for row block %o moved by %i",
		(block, offset) => {
			const before = docOf(samplePeopleMatrix());
			expect(moveRows(before, block, offset)).toBe(before);
		},
	);
});

// A pointer drop names a gap between two rows, while Alt+arrow names an offset
// directly. These cover the translation between the two, because getting it
// wrong is invisible until a downward drag lands one short.
describe("insertion boundaries", () => {
	it.each([
		[{ from: 0, count: 1 }, 3, ["Paulo", "Mabel", "Ingrid", "Felix", "Amora"]],
		[{ from: 3, count: 1 }, 1, ["Ingrid", "Felix", "Paulo", "Mabel", "Amora"]],
		[{ from: 1, count: 2 }, 5, ["Ingrid", "Felix", "Amora", "Paulo", "Mabel"]],
		[{ from: 1, count: 2 }, 0, ["Paulo", "Mabel", "Ingrid", "Felix", "Amora"]],
		[{ from: 4, count: 1 }, 0, ["Amora", "Ingrid", "Paulo", "Mabel", "Felix"]],
	] as const)("lands block %o at boundary %i", (block, boundary, expected) => {
		const next = moveRows(
			docOf(samplePeopleMatrix()),
			block,
			blockMoveOffset(boundary, block),
		);
		expect(
			documentToMatrix(next)
				.slice(1)
				.map((row) => row[0]),
		).toEqual(expected);
	});

	// Every gap the block already touches describes the arrangement the list is
	// in, so it must move nothing rather than drift by the block's length.
	it.each([
		[{ from: 1, count: 2 }, 1],
		[{ from: 1, count: 2 }, 2],
		[{ from: 1, count: 2 }, 3],
		[{ from: 0, count: 1 }, 0],
	] as const)(
		"moves nothing for block %o dropped at boundary %i",
		(block, boundary) => {
			expect(blockMoveOffset(boundary, block)).toBe(0);
		},
	);
});

describe("column operations", () => {
	it("inserts a column and gives every row a cell for it", () => {
		const next = insertColumns(sample(), 1);
		expect(next.columns).toHaveLength(3);
		for (const row of next.rows) {
			expect(Object.keys(row.cells)).toHaveLength(3);
		}
	});

	it("deletes a column and drops its cells", () => {
		const before = sample();
		const removed = before.columns[0];
		assert(removed);
		const removedId = removed.id;
		const next = deleteColumns(before, [0]);
		expect(next.columns).toHaveLength(1);
		expect(next.rows.every((row) => !(removedId in row.cells))).toBe(true);
	});

	it("never leaves the table without a column", () => {
		const next = deleteColumns(sample(), [0, 1]);
		expect(next.columns).toHaveLength(1);
	});

	it("duplicates a column with its values and alignment", () => {
		// One document throughout: column ids are the keys into every row's
		// cells, so mixing columns from a second document empties the table.
		const source = sample();
		const before = {
			...source,
			columns: source.columns.map((column, index) =>
				index === 0 ? { ...column, align: "right" as const } : column,
			),
		};
		const next = duplicateColumns(before, [0]);
		expect(next.columns[1]?.align).toBe("right");
		expect(documentToMatrix(next)).toEqual([
			["A", "A", "B"],
			["1", "1", "2"],
			["3", "3", "4"],
		]);
	});

	it.each([
		[{ from: 0, count: 2 }, 1, ["role", "name", "city", "age"]],
		[{ from: 2, count: 2 }, -1, ["name", "role", "age", "city"]],
		[{ from: 1, count: 2 }, 1, ["name", "age", "city", "role"]],
		[{ from: 1, count: 2 }, -1, ["city", "role", "name", "age"]],
		[{ from: 0, count: 3 }, 1, ["age", "name", "city", "role"]],
		[{ from: 1, count: 3 }, -1, ["city", "role", "age", "name"]],
	] as const)(
		"moves column block %o by %i without changing its order",
		(block, offset, expected) => {
			const next = moveColumns(docOf(samplePeopleMatrix()), block, offset);
			expect(documentToMatrix(next)[0]).toEqual(expected);
		},
	);

	it("preserves column identities, metadata, headers, and values", () => {
		const source = docOf(samplePeopleMatrix());
		const before = {
			...source,
			columns: source.columns.map((column, index) =>
				index === 1
					? { ...column, align: "right" as const, width: 12 }
					: column,
			),
		};
		const moved = before.columns.slice(1, 3);
		const next = moveColumns(before, { from: 1, count: 2 }, 1);

		expect(next.columns.slice(2, 4)).toEqual(moved);
		expect(next.columns[2]).toMatchObject({ align: "right", width: 12 });
		expect(documentToMatrix(next)).toEqual([
			["name", "age", "city", "role"],
			["Ingrid", "35", "Rio", "Designer"],
			["Paulo", "35", "Madrid", "Developer"],
			["Mabel", "45", "Buenos Aires", "Writer"],
			["Felix", "60", "Mexico City", "Analyst"],
			["Amora", "25", "Tokyo", "Doctor"],
		]);
	});

	it.each([
		[{ from: 0, count: 2 }, -1],
		[{ from: 2, count: 2 }, 1],
		[{ from: -1, count: 2 }, 1],
		[{ from: 1, count: 0 }, 1],
		[{ from: 3, count: 2 }, -1],
	] as const)(
		"returns the original document for column block %o moved by %i",
		(block, offset) => {
			const before = docOf(samplePeopleMatrix());
			expect(moveColumns(before, block, offset)).toBe(before);
		},
	);
});

describe("cell operations", () => {
	it("returns the same document when a write changes nothing", () => {
		const before = sample();
		expect(setCell(before, 0, 0, "1")).toBe(before);
	});

	it("changes a cell type through an explicit valid conversion", () => {
		const before = sample();
		const next = setCellType(before, 0, 0, "number");
		const column = next.columns[0];

		expect(next.rows[0]?.cells[column?.id ?? ""]).toBe(1);
		expect(setCellType(next, 0, 0, "number")).toBe(next);
	});

	it("refuses an explicit cell type that cannot represent the value", () => {
		const before = sample();
		expect(setCellType(before, 0, 0, "boolean")).toBe(before);
	});

	it("changes only the requested column expectation", () => {
		const before = sample();
		const next = setColumnExpectedType(before, 1, "number");

		expect(next.columns.map((column) => column.expectedType)).toEqual([
			"text",
			"number",
		]);
		expect(next.rows).toBe(before.rows);
		expect(setColumnExpectedType(next, 1, "number")).toBe(next);
	});

	describe("changing a column's expected type (#392)", () => {
		const column = (
			matrix: CellValue[][],
			type: "text" | "number" | "boolean",
		) => {
			const before = docOf(matrix);
			const change = changeColumnType(before, 0, type);
			const id = change.document.columns[0]?.id ?? "";
			return {
				before,
				change,
				values: change.document.rows.map((row) => row.cells[id]),
			};
		};

		it("converts every cell that loses nothing and leaves empty cells empty", () => {
			const { change, values } = column([["n"], ["1"], ["2"], [""]], "number");
			expect(values).toEqual([1, 2, ""]);
			expect(change.unconverted).toBe(0);
			expect(change.document.columns[0]?.expectedType).toBe("number");
		});

		it("counts the cells that cannot follow and keeps their value and type", () => {
			const { change, values } = column(
				[["n"], ["abc"], ["007"], ["3"]],
				"number",
			);
			// "abc" has no number; "007" would come back as "7".
			expect(change.unconverted).toBe(2);
			expect(values).toEqual(["abc", "007", 3]);
		});

		it("keeps null distinct from the empty string", () => {
			const { change, values } = column([["n"], [null], [""], [35]], "text");
			expect(values).toEqual([null, "", "35"]);
			expect(change.unconverted).toBe(0);
		});

		it("never invents a boolean and never drops a number's magnitude", () => {
			const { change, values } = column(
				[["n"], [0], [1], [2], ["TRUE"], [""]],
				"boolean",
			);
			expect(values).toEqual([false, true, 2, "TRUE", ""]);
			expect(change.unconverted).toBe(2);
		});

		it("keeps the rows untouched when no cell changes", () => {
			const { before, change } = column([["n"], ["abc"], [""]], "number");
			expect(change.document.rows).toBe(before.rows);
			expect(change.unconverted).toBe(1);
		});
	});

	it("clears a rectangle without touching its neighbours", () => {
		const next = clearCells(sample(), [
			{ top: 0, bottom: 0, left: 0, right: 0 },
		]);
		expect(documentToMatrix(next)).toEqual([
			["A", "B"],
			["", "2"],
			["3", "4"],
		]);
	});

	// The selection can cover the header row, so the operation behind Backspace
	// has to reach it. Clearing a header leaves it empty; nothing renames it.
	it("clears header text and cells together across the boundary", () => {
		const next = clearCells(sample(), [
			{ top: HEADER_ROW, bottom: 0, left: 0, right: 0 },
		]);
		expect(documentToMatrix(next)).toEqual([
			["", "B"],
			["", "2"],
			["3", "4"],
		]);
	});

	it("clears the header row alone", () => {
		const next = clearCells(sample(), [
			{ top: HEADER_ROW, bottom: HEADER_ROW, left: 0, right: 1 },
		]);
		expect(documentToMatrix(next)).toEqual([
			["", ""],
			["1", "2"],
			["3", "4"],
		]);
	});

	it("leaves the header alone when the rect starts below it", () => {
		const next = clearCells(sample(), [
			{ top: 0, bottom: 1, left: 0, right: 1 },
		]);
		expect(documentToMatrix(next)).toEqual([
			["A", "B"],
			["", ""],
			["", ""],
		]);
	});

	it("returns the same document when the header is already empty", () => {
		const before = docOf([
			["", ""],
			["1", "2"],
		]);
		expect(
			clearCells(before, [
				{ top: HEADER_ROW, bottom: HEADER_ROW, left: 0, right: 1 },
			]),
		).toBe(before);
	});

	// A selection made with the modifier holds several regions, and Backspace
	// over it is one operation and one undo step.
	it("clears several separate rectangles at once", () => {
		const next = clearCells(
			docOf([
				["A", "B", "C"],
				["1", "2", "3"],
				["4", "5", "6"],
			]),
			[
				{ top: HEADER_ROW, bottom: 1, left: 0, right: 0 },
				{ top: HEADER_ROW, bottom: 1, left: 2, right: 2 },
			],
		);
		expect(documentToMatrix(next)).toEqual([
			["", "B", ""],
			["", "2", ""],
			["", "5", ""],
		]);
	});

	it("clears a cell two regions both cover exactly once", () => {
		const next = clearCells(sample(), [
			{ top: 0, bottom: 0, left: 0, right: 1 },
			{ top: 0, bottom: 1, left: 0, right: 0 },
		]);
		expect(documentToMatrix(next)).toEqual([
			["A", "B"],
			["", ""],
			["", "4"],
		]);
	});
});

describe("fill", () => {
	const source = { top: 1, bottom: 2, left: 1, right: 2 };
	const fillSample = () =>
		docOf([
			["A", "B", "C", "D", "E"],
			["0", "0", "0", "0", "0"],
			["0", "a", "b", "0", "0"],
			["0", "c", "d", "0", "0"],
			["0", "0", "0", "0", "0"],
			["0", "0", "0", "0", "0"],
		]);

	it.each([
		[
			"downward",
			{ top: 1, bottom: 4, left: 1, right: 2 },
			[
				["a", "b"],
				["c", "d"],
				["a", "b"],
				["c", "d"],
			],
		],
		[
			"upward with a partial repetition",
			{ top: 0, bottom: 2, left: 1, right: 2 },
			[
				["c", "d"],
				["a", "b"],
				["c", "d"],
			],
		],
		[
			"rightward with a partial repetition",
			{ top: 1, bottom: 2, left: 1, right: 4 },
			[
				["a", "b", "a", "b"],
				["c", "d", "c", "d"],
			],
		],
		[
			"leftward",
			{ top: 1, bottom: 2, left: 0, right: 2 },
			[
				["b", "a", "b"],
				["d", "c", "d"],
			],
		],
	] as const)("tiles a rectangular source %s", (_, target, expected) => {
		const next = fillRange(fillSample(), source, target);
		const matrix = documentToMatrix(next).slice(
			target.top + 1,
			target.bottom + 2,
		);
		expect(
			matrix.map((row) => row.slice(target.left, target.right + 1)),
		).toEqual(expected);
	});

	it("preserves opaque values and existing row and column identities", () => {
		let before = fillSample();
		before = setCell(before, 1, 1, "007");
		before = setCell(before, 1, 2, "a|b\n");
		before = setCell(before, 2, 1, "");
		before = setCell(before, 2, 2, null);
		const rowIds = before.rows.map((row) => row.id);
		const columnIds = before.columns.map((column) => column.id);

		const next = fillRange(before, source, {
			top: 1,
			bottom: 4,
			left: 1,
			right: 2,
		});

		expect(next.rows.map((row) => row.id)).toEqual(rowIds);
		expect(next.columns.map((column) => column.id)).toEqual(columnIds);
		const firstSourceColumn = next.columns[1];
		const secondSourceColumn = next.columns[2];
		assert(firstSourceColumn);
		assert(secondSourceColumn);
		expect(
			next.rows
				.slice(3, 5)
				.map((row) => [
					row.cells[firstSourceColumn.id],
					row.cells[secondSourceColumn.id],
				]),
		).toEqual([
			["007", "a|b\n"],
			["", null],
		]);
	});

	it.each([
		[
			"a header source",
			{ top: HEADER_ROW, bottom: 1, left: 1, right: 2 },
			{ top: HEADER_ROW, bottom: 2, left: 1, right: 2 },
		],
		[
			"a header target",
			source,
			{ top: HEADER_ROW, bottom: 2, left: 1, right: 2 },
		],
		[
			"a target outside the table",
			source,
			{ top: 1, bottom: 8, left: 1, right: 2 },
		],
		[
			"a target that does not contain the source",
			source,
			{ top: 2, bottom: 4, left: 1, right: 2 },
		],
		["an unchanged target", source, source],
	] as const)(
		"returns the original document for %s",
		(_, candidateSource, target) => {
			const before = fillSample();
			expect(fillRange(before, candidateSource, target)).toBe(before);
		},
	);
});

describe("paste", () => {
	it("accepts an oversized ragged matrix and grows to its widest row", () => {
		const matrix = Array.from({ length: 130_000 }, () => [] as string[]);
		matrix[matrix.length - 1] = ["last", "widest", "value"];

		const next = pasteMatrix(sample(), { rowIndex: 0, columnIndex: 0 }, matrix);

		expect(next.columns).toHaveLength(3);
		expect(next.rows).toHaveLength(matrix.length);
		expect(documentToMatrix(next).at(-1)).toEqual(["last", "widest", "value"]);
	});

	it.each([
		[0, ["a", "b", "c"]],
		[1, ["1", "a", "b", "c"]],
		[3, ["1", "3", "", "a", "b", "c"]],
	] as const)(
		"writes every payload row from row index %i",
		(rowIndex, expected) => {
			const next = pasteMatrix(sample(), { rowIndex, columnIndex: 0 }, [
				["a"],
				["b"],
				["c"],
			]);
			const firstColumn = next.columns[0];
			assert(firstColumn);

			expect(next.rows.map((row) => row.cells[firstColumn.id] ?? "")).toEqual(
				expected,
			);
		},
	);

	it("grows the table when the payload runs past its edges", () => {
		const next = pasteMatrix(sample(), { rowIndex: 1, columnIndex: 1 }, [
			["x", "y"],
			["z", "w"],
		]);
		expect(documentToMatrix(next)).toEqual([
			["A", "B", ""],
			["1", "2", ""],
			["3", "x", "y"],
			["", "z", "w"],
		]);
	});

	it("writes in place when the payload fits", () => {
		const next = pasteMatrix(sample(), { rowIndex: 0, columnIndex: 0 }, [
			["x"],
		]);
		expect(documentToMatrix(next)).toEqual([
			["A", "B"],
			["x", "2"],
			["3", "4"],
		]);
	});
});

describe("header handling", () => {
	// The table still has exactly one header row; it simply has no text yet.
	// Inventing "Column 1" here would write content the user never typed and
	// then serialize it into every format.
	it("leaves the header row empty when row 1 is data", () => {
		const document = documentFromMatrix(
			[
				["Ingrid", "31"],
				["Paulo", "24"],
			],
			{ headerRow: false },
		);
		expect(document.columns.map((column) => column.header)).toEqual(["", ""]);
		expect(document.rows).toHaveLength(2);
	});

	it("keeps a blank header from the source blank", () => {
		const document = documentFromMatrix(
			[
				["Name", ""],
				["Ingrid", "Designer"],
			],
			{ headerRow: true },
		);
		expect(document.columns.map((column) => column.header)).toEqual([
			"Name",
			"",
		]);
	});
});

describe("promoting a row into the header", () => {
	it("moves the first row's values up and removes that row", () => {
		const document = promoteFirstRowToHeader(sample());

		expect(document.columns.map((column) => column.header)).toEqual(["1", "2"]);
		expect(documentToMatrix(document)).toEqual([
			["1", "2"],
			["3", "4"],
		]);
	});

	// The header holds text, so a typed value arrives as its projection. What
	// must not happen is the column keeping the type of a value that is gone.
	it("projects a typed value into the header and takes its row with it", () => {
		const document = promoteFirstRowToHeader(
			docOf([
				["name", "age"],
				["Ingrid", 35],
				["Paulo", 35],
			]),
		);

		expect(document.columns.map((column) => column.header)).toEqual([
			"Ingrid",
			"35",
		]);
		expect(document.rows).toHaveLength(1);
	});

	it("leaves column identity and metadata with the column", () => {
		const before = setColumnExpectedType(
			setAlignment(sample(), 1, "right"),
			1,
			"number",
		);
		const after = promoteFirstRowToHeader(before);

		expect(after.columns.map((column) => column.id)).toEqual(
			before.columns.map((column) => column.id),
		);
		expect(after.columns.map((column) => column.align)).toEqual(
			before.columns.map((column) => column.align),
		);
		expect(after.columns.map((column) => column.expectedType)).toEqual(
			before.columns.map((column) => column.expectedType),
		);
	});

	// The invariant the whole feature rests on: one header row before, one
	// header row after, and a row under it in every case. Promoting the only
	// data row leaves the blank survivor `withRows` guarantees.
	it("keeps a row under the header when it consumed the only one", () => {
		const document = promoteFirstRowToHeader(
			docOf([
				["A", "B"],
				["1", "2"],
			]),
		);

		expect(document.columns.map((column) => column.header)).toEqual(["1", "2"]);
		expect(documentToMatrix(document)).toEqual([
			["1", "2"],
			["", ""],
		]);
	});
});

describe("empty document", () => {
	it("starts with something to type into", () => {
		const document = createEmptyDocument();
		expect(document.columns.length).toBeGreaterThan(0);
		expect(document.rows.length).toBeGreaterThan(0);
	});

	it("starts with unnamed columns rather than seeded names", () => {
		expect(
			createEmptyDocument().columns.map((column) => column.header),
		).toEqual(["", "", ""]);
	});

	it("is blank when nothing has been typed", () => {
		expect(isDocumentBlank(createEmptyDocument())).toBe(true);
	});

	// The trap this closes: while "Column 1" was a generated name, a user who
	// deliberately typed it had a document Tabelo considered untouched and would
	// clear without confirming.
	it("is not blank when a header literally reads Column 1", () => {
		const document = documentFromMatrix(
			[
				["Column 1", ""],
				["", ""],
			],
			{
				headerRow: true,
			},
		);
		expect(isDocumentBlank(document)).toBe(false);
	});

	it("is not blank when only a cell holds content", () => {
		expect(
			isDocumentBlank(
				docOf([
					["", ""],
					["x", ""],
				]),
			),
		).toBe(false);
	});
});

describe("blank headers survive structural edits", () => {
	const unnamed = () =>
		documentFromMatrix(
			[
				["", ""],
				["1", "2"],
			],
			{
				headerRow: true,
			},
		);

	it("does not rename a blank header when a column is inserted", () => {
		const next = insertColumns(unnamed(), 0);
		expect(next.columns.map((column) => column.header)).toEqual(["", "", ""]);
	});

	it("does not rename a blank header when a column is deleted", () => {
		const next = deleteColumns(unnamed(), [0]);
		expect(next.columns.map((column) => column.header)).toEqual([""]);
	});

	it("keeps a named neighbour named when a column is inserted", () => {
		const next = insertColumns(
			docOf([
				["Name", ""],
				["Ingrid", ""],
			]),
			1,
		);
		expect(next.columns.map((column) => column.header)).toEqual([
			"Name",
			"",
			"",
		]);
	});
});

describe("sorting rows by a column", () => {
	// Column ids are generated, so every case names its target by position and
	// resolves the id the way the store does.
	function columnId(document: ReturnType<typeof docOf>, index: number) {
		const column = document.columns[index];
		assert(column);
		return column.id;
	}

	// Read as canonical values rather than through `documentToMatrix`, whose
	// text projection would hide exactly the carried types these cases are
	// about, and would make `null` indistinguishable from the empty string.
	function sortedColumn(
		matrix: CellValue[][],
		direction: "ascending" | "descending",
		index = 0,
	) {
		const document = docOf(matrix);
		const id = columnId(document, index);
		const result = sortRows(document, id, direction);
		return result.document.rows.map((row) => readCell(row, id));
	}

	it("compares two numbers numerically, not as text", () => {
		const matrix: CellValue[][] = [["n"], [10], [9], [100]];
		expect(sortedColumn(matrix, "ascending")).toEqual([9, 10, 100]);
		expect(sortedColumn(matrix, "descending")).toEqual([100, 10, 9]);
	});

	it("compares numeric-looking strings as strings, through the collator", () => {
		// Every value here is a string, so nothing is parsed. The collator's
		// numeric ordering is what puts "9" before "10" without concluding that
		// either one is a number.
		const matrix: CellValue[][] = [["n"], ["10"], ["9"], ["100"]];
		expect(sortedColumn(matrix, "ascending")).toEqual(["9", "10", "100"]);
	});

	it("sorts false before true", () => {
		const matrix: CellValue[][] = [["flag"], [true], [false], [true]];
		expect(sortedColumn(matrix, "ascending")).toEqual([false, true, true]);
		expect(sortedColumn(matrix, "descending")).toEqual([true, true, false]);
	});

	it("orders mixed carried types as number, boolean, then string", () => {
		const matrix: CellValue[][] = [["mixed"], ["b"], [true], [2], ["a"], [1]];
		expect(sortedColumn(matrix, "ascending")).toEqual([1, 2, true, "a", "b"]);
		expect(sortedColumn(matrix, "descending")).toEqual(["b", "a", true, 2, 1]);
	});

	it("places null and the empty string last in both directions", () => {
		const matrix: CellValue[][] = [["v"], ["b"], [null], ["a"], [""]];
		expect(sortedColumn(matrix, "ascending")).toEqual(["a", "b", null, ""]);
		expect(sortedColumn(matrix, "descending")).toEqual(["b", "a", null, ""]);
	});

	it("treats a whitespace-only string as content rather than as empty", () => {
		const matrix: CellValue[][] = [["v"], [""], [" "], ["a"]];
		expect(sortedColumn(matrix, "ascending")).toEqual([" ", "a", ""]);
	});

	it("keeps the original order for values that compare equal", () => {
		// The collator ignores case, so these three compare equal and stability
		// is the only thing that decides their order.
		const document = docOf([
			["name", "seq"],
			["ana", "1"],
			["Ana", "2"],
			["ANA", "3"],
		]);
		const result = sortRows(document, columnId(document, 0), "ascending");
		expect(documentToMatrix(result.document).slice(1)).toEqual([
			["ana", "1"],
			["Ana", "2"],
			["ANA", "3"],
		]);
	});

	it("preserves row identity and the exact cell values it moved", () => {
		const document = docOf([
			["name", "age"],
			["Paulo", 35],
			["Ingrid", 35],
		]);
		const ids = document.rows.map((row) => row.id);
		const cells = document.rows.map((row) => ({ ...row.cells }));
		const result = sortRows(document, columnId(document, 0), "ascending");

		expect(result.document.rows.map((row) => row.id)).toEqual([ids[1], ids[0]]);
		expect(result.document.rows.map((row) => row.cells)).toEqual([
			cells[1],
			cells[0],
		]);
		// The input document is untouched: these are the same row objects, moved.
		expect(document.rows.map((row) => row.id)).toEqual(ids);
	});

	it("reports where every row went", () => {
		const document = docOf([["v"], ["c"], ["a"], ["b"]]);
		const result = sortRows(document, columnId(document, 0), "ascending");
		expect(result.nextRowOf).toEqual([2, 0, 1]);
	});

	it("returns the same document for an order that is already sorted", () => {
		const document = docOf([["v"], ["a"], ["b"]]);
		const result = sortRows(document, columnId(document, 0), "ascending");
		expect(result.document).toBe(document);
		expect(result.nextRowOf).toEqual([0, 1]);
	});

	it("returns the same document for a single row or an unknown column", () => {
		const single = docOf([["v"], ["a"]]);
		expect(sortRows(single, columnId(single, 0), "ascending").document).toBe(
			single,
		);
		const document = docOf([["v"], ["b"], ["a"]]);
		expect(sortRows(document, "no-such-column", "ascending").document).toBe(
			document,
		);
	});

	it("never touches the header row", () => {
		const document = docOf([
			["zebra", "apple"],
			["b", "b"],
			["a", "a"],
		]);
		const result = sortRows(document, columnId(document, 0), "ascending");
		expect(result.document.columns.map((column) => column.header)).toEqual([
			"zebra",
			"apple",
		]);
	});

	it("keeps every row of a table at the documented scale", () => {
		const rows = Array.from({ length: 200 }, (_, index) => [
			String((index * 7) % 200),
			index,
		]);
		const document = docOf([["key", "seq"], ...rows]);
		const result = sortRows(document, columnId(document, 0), "ascending");
		expect(result.document.rows).toHaveLength(200);
		expect(new Set(result.document.rows.map((row) => row.id)).size).toBe(200);
	});
});

// The header row and every cell as carried values, so an assertion sees a
// number as a number and `null` as `null` rather than their shared text.
function valuesOf(document: TableDocument): CellValue[][] {
	return [
		document.columns.map((column) => column.header),
		...document.rows.map((row) =>
			document.columns.map((column) => readCell(row, column.id)),
		),
	];
}

describe("transposeDocument", () => {
	it("turns the first column into the header row and the header row into the first column", () => {
		const document = docOf([
			["name", "city", "age"],
			["Ingrid", "Rio", 35],
			["Paulo", "Madrid", null],
		]);
		expect(valuesOf(transposeDocument(document))).toEqual([
			["name", "Ingrid", "Paulo"],
			["city", "Rio", "Madrid"],
			["age", 35, null],
		]);
	});

	it("moves values without touching their type, and keeps null apart from the empty string", () => {
		const document = docOf([
			["key", "a", "b"],
			["row", null, ""],
			["other", true, 0],
		]);
		const next = transposeDocument(document);
		expect(valuesOf(next)).toEqual([
			["key", "row", "other"],
			["a", null, true],
			["b", "", 0],
		]);
	});

	it("carries delimiters and line breaks through unchanged", () => {
		const document = docOf([
			["h", "x"],
			["a", 'one | two\nthree, "four"'],
		]);
		expect(valuesOf(transposeDocument(transposeDocument(document)))).toEqual(
			valuesOf(document),
		);
	});

	it("mints new identifiers and resets alignment and expected type", () => {
		const document = setColumnExpectedType(
			setAlignment(sample(), 1, "right"),
			1,
			"number",
		);
		const next = transposeDocument(document);
		const oldColumnIds = new Set(document.columns.map((column) => column.id));
		const oldRowIds = new Set(document.rows.map((row) => row.id));
		for (const column of next.columns) {
			expect(oldColumnIds.has(column.id)).toBe(false);
			expect(column.align).toBe("default");
			expect(column.expectedType).toBe("text");
		}
		for (const row of next.rows) expect(oldRowIds.has(row.id)).toBe(false);
	});

	// Identifiers, alignment, and expected types are deliberately not restored:
	// they described columns that no longer exist. Values and types are, apart
	// from the values that spent the round trip in the header, which a header
	// can only hold as text.
	it("restores every value and type after two transposes, except the first column's, which pass through the header as text", () => {
		const document = docOf([
			["name", "age", "active"],
			["Ingrid", 35, true],
			[7, null, ""],
		]);
		const twice = transposeDocument(transposeDocument(document));
		expect(valuesOf(twice)).toEqual([
			["name", "age", "active"],
			["Ingrid", 35, true],
			["7", null, ""],
		]);
		expect(documentToMatrix(twice)).toEqual(documentToMatrix(document));
	});

	it("turns a one-column table into a header row over one empty row", () => {
		const document = docOf([["name"], ["Ingrid"], ["Paulo"]]);
		const next = transposeDocument(document);
		expect(valuesOf(next)).toEqual([
			["name", "Ingrid", "Paulo"],
			["", "", ""],
		]);
	});

	it("turns a table with one data row into two columns", () => {
		const document = docOf([
			["name", "city"],
			["Ingrid", "Rio"],
		]);
		expect(valuesOf(transposeDocument(document))).toEqual([
			["name", "Ingrid"],
			["city", "Rio"],
		]);
	});

	it("transposes a single cell table", () => {
		const document = docOf([["name"], [""]]);
		expect(valuesOf(transposeDocument(document))).toEqual([
			["name", ""],
			["", ""],
		]);
	});

	it("does not change the document it was given", () => {
		const document = sample();
		const before = structuredClone(document);
		transposeDocument(document);
		expect(document).toEqual(before);
	});

	it("rotates a table at the documented scale", () => {
		const rows = Array.from({ length: 200 }, (_, index) => [
			`row ${index}`,
			index,
			index % 2 === 0,
		]);
		const document = docOf([["key", "seq", "even"], ...rows]);
		const next = transposeDocument(document);
		expect(next.columns).toHaveLength(201);
		expect(next.rows).toHaveLength(2);
	});
});

describe("deleteEmptyRowsAndColumns", () => {
	it("removes rows and columns whose every cell projects to empty text", () => {
		const document = docOf([
			["name", "", "city"],
			["Ingrid", null, "Rio"],
			["", "", null],
			["Paulo", "", "Madrid"],
		]);
		const result = deleteEmptyRowsAndColumns(document);
		expect(valuesOf(result.document)).toEqual([
			["name", "city"],
			["Ingrid", "Rio"],
			["Paulo", "Madrid"],
		]);
		expect(result.keptRows).toEqual([0, 2]);
		expect(result.keptColumns).toEqual([0, 2]);
	});

	it("keeps a named column that holds no values", () => {
		const document = docOf([
			["name", "notes"],
			["Ingrid", ""],
		]);
		expect(deleteEmptyRowsAndColumns(document).document).toBe(document);
	});

	it("removes a column with an empty header only when its cells are empty too", () => {
		const document = docOf([
			["name", ""],
			["Ingrid", "Rio"],
		]);
		expect(deleteEmptyRowsAndColumns(document).document).toBe(document);
	});

	it("keeps a row whose only content is zero, false, or whitespace", () => {
		const document = docOf([
			["n", "b", "s"],
			[0, "", ""],
			["", false, ""],
			["", "", " "],
		]);
		expect(deleteEmptyRowsAndColumns(document).document).toBe(document);
	});

	it("keeps identifiers and the null or empty string each survivor held", () => {
		const document = docOf([
			["a", "b"],
			[null, "x"],
			["", ""],
			["", "y"],
		]);
		const result = deleteEmptyRowsAndColumns(document);
		expect(result.document.rows.map((row) => row.id)).toEqual([
			document.rows[0]?.id,
			document.rows[2]?.id,
		]);
		expect(result.document.columns).toEqual(document.columns);
		expect(valuesOf(result.document)).toEqual([
			["a", "b"],
			[null, "x"],
			["", "y"],
		]);
	});

	it("keeps one row when every data row is empty but a header is named", () => {
		const document = docOf([
			["name", ""],
			["", ""],
			[null, ""],
		]);
		const result = deleteEmptyRowsAndColumns(document);
		expect(valuesOf(result.document)).toEqual([["name"], [""]]);
		expect(result.document.rows[0]?.id).toBe(document.rows[0]?.id);
	});

	it("leaves an entirely empty table untouched and says why", () => {
		const document = docOf([
			["", ""],
			[null, ""],
		]);
		const result = deleteEmptyRowsAndColumns(document);
		expect(result.document).toBe(document);
		expect(result.tableIsEmpty).toBe(true);
		expect(deleteEmptyRowsAndColumns(createEmptyDocument()).tableIsEmpty).toBe(
			true,
		);
		expect(deleteEmptyRowsAndColumns(sample()).tableIsEmpty).toBe(false);
	});

	it("returns the same document when nothing is empty", () => {
		const document = sample();
		expect(deleteEmptyRowsAndColumns(document).document).toBe(document);
	});
});
