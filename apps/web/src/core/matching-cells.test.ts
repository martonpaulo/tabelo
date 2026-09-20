import { describe, expect, it } from "vitest";
import { documentFromMatrix } from "@/core/document";
import { nextMatchingCell } from "@/core/matching-cells";
import { createSelection, HEADER_ROW } from "@/core/selection";

// The roster's shape, with Rio twice and an age that looks like a city's text,
// so exactness is what decides every match.
const document = documentFromMatrix(
	[
		["Name", "City", "Age"],
		["Ingrid", "Rio", 35],
		["Paulo", "Madrid", 35],
		["Mabel", "Rio", "35"],
	],
	{ headerRow: true },
);

describe("nextMatchingCell", () => {
	it("adds the next cell with the same value in reading order", () => {
		const step = nextMatchingCell(
			document,
			createSelection({ row: 0, column: 1 }),
		);
		expect(step.selection?.ranges.at(-1)?.focus).toEqual({ row: 2, column: 1 });
		expect(step.selection?.activeIndex).toBe(1);
		expect([step.selected, step.total]).toEqual([2, 2]);
	});

	it("matches the carried type, never the text a value projects to", () => {
		const step = nextMatchingCell(
			document,
			createSelection({ row: 0, column: 2 }),
		);
		// The number 35 matches the number 35 below it, not the string "35".
		expect(step.selection?.ranges.at(-1)?.focus).toEqual({ row: 1, column: 2 });
		expect(step.total).toBe(2);
	});

	it("wraps around and stops once every match is selected", () => {
		let selection = createSelection({ row: 2, column: 1 });
		const first = nextMatchingCell(document, selection);
		expect(first.selection?.ranges.at(-1)?.focus).toEqual({
			row: 0,
			column: 1,
		});
		if (!first.selection) throw new Error("expected a match");
		selection = first.selection;
		const last = nextMatchingCell(document, selection);
		expect(last.selection).toBeNull();
		expect([last.selected, last.total]).toEqual([2, 2]);
	});

	it("wraps from the last cell in the table back to the header row", () => {
		const wrapping = documentFromMatrix(
			[
				["City", "Note"],
				["Rio", "Madrid"],
				["Tokyo", "City"],
			],
			{ headerRow: true },
		);
		// The gesture starts on the bottom-right cell, so the only other "City"
		// is the header cell the walk reaches by running off the table's end.
		const step = nextMatchingCell(
			wrapping,
			createSelection({ row: 1, column: 1 }),
		);
		expect(step.selection?.ranges.at(-1)?.focus).toEqual({
			row: HEADER_ROW,
			column: 0,
		});
		expect([step.selected, step.total]).toEqual([2, 2]);
	});

	it("starts at the first cell when the focus is outside the table", () => {
		const outside = documentFromMatrix(
			[
				["City", "Note"],
				["", "Rio"],
			],
			{ headerRow: true },
		);
		// A focus no cell holds reads as an empty value and has no place in
		// reading order, so the walk begins at the header row's first cell.
		const step = nextMatchingCell(
			outside,
			createSelection({ row: 9, column: 0 }),
		);
		expect(step.selection?.ranges.at(-1)?.focus).toEqual({
			row: 0,
			column: 0,
		});
	});

	it("reads the header row as cells, first in reading order", () => {
		const headers = documentFromMatrix(
			[
				["Rio", "City"],
				["Ingrid", "Rio"],
			],
			{ headerRow: true },
		);
		const step = nextMatchingCell(
			headers,
			createSelection({ row: 0, column: 1 }),
		);
		expect(step.selection?.ranges.at(-1)?.focus).toEqual({
			row: HEADER_ROW,
			column: 0,
		});
	});
});
