import { describe, expect, it } from "vitest";
import {
	atMinimumColumnWidth,
	COLUMN_WIDTH_STEP,
	clampColumnWidth,
	DEFAULT_COLUMN_WIDTH,
	isDefaultColumnWidth,
	MIN_COLUMN_WIDTH,
	resolveColumnWidth,
	stepColumnWidth,
} from "./column-width";

// Dragging and the column menu are two ways to reach the same numbers, so the
// floor and the step live here rather than in either of them.

describe("resolving a width", () => {
	it("treats an untouched column as the default", () => {
		expect(resolveColumnWidth(undefined)).toBe(DEFAULT_COLUMN_WIDTH);
		expect(resolveColumnWidth(200)).toBe(200);
	});
});

describe("stepping a width", () => {
	it("moves one step from wherever the column is", () => {
		expect(stepColumnWidth(200, 1)).toBe(200 + COLUMN_WIDTH_STEP);
		expect(stepColumnWidth(200, -1)).toBe(200 - COLUMN_WIDTH_STEP);
	});

	it("starts from the default when the column was never resized", () => {
		expect(stepColumnWidth(undefined, 1)).toBe(
			DEFAULT_COLUMN_WIDTH + COLUMN_WIDTH_STEP,
		);
	});

	it("stops at the floor rather than collapsing the column", () => {
		expect(stepColumnWidth(MIN_COLUMN_WIDTH, -1)).toBe(MIN_COLUMN_WIDTH);
		expect(stepColumnWidth(MIN_COLUMN_WIDTH + 1, -1)).toBe(MIN_COLUMN_WIDTH);
	});

	it("reaches the floor from the default in a countable number of presses", () => {
		let width: number | undefined;
		let presses = 0;
		while (!atMinimumColumnWidth(width) && presses < 100) {
			width = stepColumnWidth(width, -1);
			presses += 1;
		}
		expect(atMinimumColumnWidth(width)).toBe(true);
		expect(presses).toBeLessThanOrEqual(5);
	});

	it("is reversible away from the floor", () => {
		const widened = stepColumnWidth(200, 1);
		expect(stepColumnWidth(widened, -1)).toBe(200);
	});
});

describe("clamping a dragged width", () => {
	it("honours the same floor the menu does", () => {
		expect(clampColumnWidth(10)).toBe(MIN_COLUMN_WIDTH);
		expect(clampColumnWidth(MIN_COLUMN_WIDTH - 0.4)).toBe(MIN_COLUMN_WIDTH);
	});

	it("rounds to whole pixels so a drag cannot store a fraction", () => {
		expect(clampColumnWidth(200.6)).toBe(201);
	});
});

describe("reporting a width", () => {
	it("knows an untouched column from a resized one", () => {
		expect(isDefaultColumnWidth(undefined)).toBe(true);
		expect(isDefaultColumnWidth(DEFAULT_COLUMN_WIDTH)).toBe(true);
		expect(isDefaultColumnWidth(200)).toBe(false);
	});

	it("knows when narrowing can go no further", () => {
		expect(atMinimumColumnWidth(MIN_COLUMN_WIDTH)).toBe(true);
		expect(atMinimumColumnWidth(undefined)).toBe(false);
		expect(atMinimumColumnWidth(MIN_COLUMN_WIDTH + 1)).toBe(false);
	});
});
