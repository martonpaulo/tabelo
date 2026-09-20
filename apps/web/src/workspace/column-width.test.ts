import { describe, expect, it } from "vitest";
import {
	atMaximumColumnWidth,
	atMinimumColumnWidth,
	COLUMN_WIDTH_STEP,
	clampColumnWidth,
	DEFAULT_COLUMN_WIDTH,
	distributeColumnWidths,
	fitColumnWidth,
	isSameColumnWidth,
	MAX_COLUMN_WIDTH,
	MIN_COLUMN_WIDTH,
	parseColumnWidth,
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

describe("typed column width", () => {
	it("accepts a plain number of rem, with or without the unit", () => {
		expect(parseColumnWidth("12")).toEqual({ ok: true, width: 12 });
		expect(parseColumnWidth(" 12.5 rem ")).toEqual({ ok: true, width: 12.5 });
		expect(parseColumnWidth(".5e1")).toEqual({
			ok: false,
			reason: "not-a-number",
		});
	});

	it("keeps the stored precision of one sixteenth of a rem", () => {
		expect(parseColumnWidth("12.03")).toEqual({ ok: true, width: 12 });
	});

	it("refuses anything that is not a number", () => {
		for (const text of ["", " ", "wide", "12px", "-5", "1,5", "Infinity"]) {
			expect(parseColumnWidth(text)).toEqual({
				ok: false,
				reason: "not-a-number",
			});
		}
	});

	it("refuses a width outside the bounds instead of silently clamping it", () => {
		expect(parseColumnWidth(String(MIN_COLUMN_WIDTH - 1))).toEqual({
			ok: false,
			reason: "too-small",
		});
		expect(parseColumnWidth(String(MAX_COLUMN_WIDTH + 1))).toEqual({
			ok: false,
			reason: "too-large",
		});
		expect(parseColumnWidth(String(MIN_COLUMN_WIDTH))).toEqual({
			ok: true,
			width: MIN_COLUMN_WIDTH,
		});
		expect(parseColumnWidth(String(MAX_COLUMN_WIDTH))).toEqual({
			ok: true,
			width: MAX_COLUMN_WIDTH,
		});
	});
});

const sumWidths = (widths: readonly number[]) =>
	widths.reduce((total, width) => total + width, 0);

describe("distributing column widths", () => {
	it("fills the pane exactly when nothing is clamped", () => {
		const result = distributeColumnWidths([10.5, 10.5, 10.5], 60) ?? [];
		expect(sumWidths(result)).toBeCloseTo(60, 10);
	});

	it("keeps proportions", () => {
		const result = distributeColumnWidths([10, 20, 30], 90) ?? [];
		expect((result[1] ?? 0) / (result[0] ?? 1)).toBeCloseTo(2, 1);
		expect(sumWidths(result)).toBeCloseTo(90, 10);
	});

	it("pins the narrow ones at the minimum and spreads the rest", () => {
		const result = distributeColumnWidths([5, 40, 40], 30) ?? [];
		expect(result[0]).toBe(MIN_COLUMN_WIDTH);
		expect(sumWidths(result)).toBeCloseTo(30, 10);
	});

	it("never exceeds the maximum", () => {
		const result = distributeColumnWidths([10, 10], 400) ?? [];
		expect(result).toEqual([MAX_COLUMN_WIDTH, MAX_COLUMN_WIDTH]);
	});

	it("refuses an empty table or a broken measurement", () => {
		expect(distributeColumnWidths([], 40)).toBeUndefined();
		expect(distributeColumnWidths([10], Number.NaN)).toBeUndefined();
	});

	it("never goes under the minimum, whatever is asked", () => {
		const result = distributeColumnWidths([10, 10, 10], 1) ?? [];
		expect(result).toEqual([
			MIN_COLUMN_WIDTH,
			MIN_COLUMN_WIDTH,
			MIN_COLUMN_WIDTH,
		]);
	});
});
