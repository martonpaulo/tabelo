import { describe, expect, it } from "vitest";
import {
	atMaximumColumnWidth,
	atMinimumColumnWidth,
	COLUMN_WIDTH_STEP,
	clampColumnWidth,
	DEFAULT_COLUMN_WIDTH,
	fitColumnWidth,
	isSameColumnWidth,
	MAX_COLUMN_WIDTH,
	MIN_COLUMN_WIDTH,
	resolveColumnWidth,
	stepColumnWidth,
} from "./column-width";

describe("workspace column width arithmetic", () => {
	it("resolves an untouched column to the default", () => {
		expect(resolveColumnWidth(undefined)).toBe(DEFAULT_COLUMN_WIDTH);
		expect(resolveColumnWidth(12.5)).toBe(12.5);
	});

	it("steps from the current width and stops at both bounds", () => {
		expect(stepColumnWidth(12.5, 1)).toBe(12.5 + COLUMN_WIDTH_STEP);
		expect(stepColumnWidth(12.5, -1)).toBe(12.5 - COLUMN_WIDTH_STEP);
		expect(stepColumnWidth(undefined, 1)).toBe(
			DEFAULT_COLUMN_WIDTH + COLUMN_WIDTH_STEP,
		);
		expect(stepColumnWidth(MIN_COLUMN_WIDTH, -1)).toBe(MIN_COLUMN_WIDTH);
		expect(stepColumnWidth(MAX_COLUMN_WIDTH, 1)).toBe(MAX_COLUMN_WIDTH);
	});

	it("clamps pointer output to stable rem increments", () => {
		expect(clampColumnWidth(1)).toBe(MIN_COLUMN_WIDTH);
		expect(clampColumnWidth(12.54)).toBe(12.5625);
		expect(clampColumnWidth(MAX_COLUMN_WIDTH + 20)).toBe(MAX_COLUMN_WIDTH);
	});

	it("normalizes measured content independently of pane zoom", () => {
		const atOne = fitColumnWidth(320, 16, 1, 17);
		const atTwo = fitColumnWidth(640, 16, 2, 17);

		expect(atOne).toBe(21.0625);
		expect(atTwo).toBe(atOne);
	});

	it("refuses invalid DOM measurements", () => {
		expect(fitColumnWidth(Number.NaN, 16, 1, 17)).toBeUndefined();
		expect(fitColumnWidth(320, 0, 1, 17)).toBeUndefined();
		expect(fitColumnWidth(320, 16, 0, 17)).toBeUndefined();
	});

	it("compares normalized widths with stable arithmetic tolerance", () => {
		expect(isSameColumnWidth(12.5, 12.5 + 1 / 64)).toBe(true);
		expect(isSameColumnWidth(undefined, DEFAULT_COLUMN_WIDTH)).toBe(true);
		expect(isSameColumnWidth(12.5, 13)).toBe(false);
		expect(atMinimumColumnWidth(MIN_COLUMN_WIDTH)).toBe(true);
		expect(atMaximumColumnWidth(MAX_COLUMN_WIDTH)).toBe(true);
	});
});
