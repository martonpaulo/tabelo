import { describe, expect, it } from "vitest";
import type { CellRect } from "@/core/selection";
import { coveredBySpans, decodeSpans, spansOf } from "./selection-spans";

// The encoding and the two readings of it have to agree exactly: a cell the
// grid paints as selected is a cell `spansOf` wrote and `coveredBySpans` read
// back, and nothing else decides it.
function covers(rects: readonly CellRect[], row: number, column: number) {
	return coveredBySpans(decodeSpans(spansOf(rects, row)), column);
}

const overlapping: readonly CellRect[] = [
	{ top: 0, bottom: 7, left: 0, right: 2 },
	{ top: 2, bottom: 4, left: 5, right: 7 },
];

describe("a row's selected spans", () => {
	it("names only the regions the row sits inside", () => {
		expect(spansOf(overlapping, 0)).toBe("0:2");
		expect(spansOf(overlapping, 3)).toBe("0:2,5:7");
		expect(spansOf(overlapping, 9)).toBe("");
	});

	it("reads back every column of every region, and no column between them", () => {
		const row = 3;
		const covered = Array.from({ length: 9 }, (_, column) =>
			covers(overlapping, row, column),
		);

		expect(covered).toEqual([
			true,
			true,
			true,
			false,
			false,
			true,
			true,
			true,
			false,
		]);
	});

	it("covers nothing for a row inside no region", () => {
		expect(covers(overlapping, 9, 0)).toBe(false);
		expect(decodeSpans("")).toEqual([]);
	});

	it("reads a single-column region as that one column", () => {
		const single: readonly CellRect[] = [
			{ top: 1, bottom: 1, left: 4, right: 4 },
		];

		expect(covers(single, 1, 3)).toBe(false);
		expect(covers(single, 1, 4)).toBe(true);
		expect(covers(single, 1, 5)).toBe(false);
	});

	it("keeps the header row's spans like any other row's", () => {
		const header: readonly CellRect[] = [
			{ top: -1, bottom: 0, left: 1, right: 2 },
		];

		expect(spansOf(header, -1)).toBe("1:2");
		expect(covers(header, -1, 1)).toBe(true);
		expect(covers(header, -1, 0)).toBe(false);
	});

	it("ignores a span it cannot read both bounds of", () => {
		// Nothing writes this, but the reader must not turn a broken pair into a
		// covered column: it says nothing rather than guessing a bound.
		expect(coveredBySpans(decodeSpans("3"), 3)).toBe(false);
		expect(coveredBySpans(decodeSpans("0:2,3"), 1)).toBe(true);
	});
});
