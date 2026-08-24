import { describe, expect, it } from "vitest";
import type { CellValue, ExpectedColumnType } from "@/core/types";
import {
	CELL_TYPE_MARKS,
	cellTypeDiverges,
	cellTypePresentationClass,
	cellValueType,
	expectedCellValueType,
} from "./cell-type";

describe("grid cell type presentation", () => {
	it.each([
		["007", "string"],
		[7, "number"],
		[true, "boolean"],
		[false, "boolean"],
		[null, "null"],
	] as const)("derives the real type of %p", (value, expected) => {
		expect(cellValueType(value)).toBe(expected);
	});

	it.each([
		["text", "string"],
		["number", "number"],
		["boolean", "boolean"],
	] as const)("maps the %s expectation to %s", (expected, real) => {
		expect(expectedCellValueType(expected)).toBe(real);
	});

	it.each([
		["007", "text", false],
		[7, "number", false],
		[true, "boolean", false],
		[null, "text", true],
		["7", "number", true],
		[7, "text", true],
		[false, "number", true],
	] as const satisfies readonly [CellValue, ExpectedColumnType, boolean][])(
		"reports whether %p diverges from %s",
		(value, expected, diverges) => {
			expect(cellTypeDiverges(value, expected)).toBe(diverges);
		},
	);

	it("assigns one distinct textual mark to every real type", () => {
		expect(CELL_TYPE_MARKS).toEqual({
			string: "text",
			number: "num",
			boolean: "bool",
			null: "null",
		});
		expect(new Set(Object.values(CELL_TYPE_MARKS))).toHaveLength(4);
	});

	it.each([
		["string", "text-value-string"],
		["number", "text-value-number font-semibold tabular-nums"],
		["boolean", "text-value-boolean font-semibold italic"],
		["null", "text-value-null italic"],
	] as const)("maps %s to its semantic presentation", (type, className) => {
		expect(cellTypePresentationClass(type)).toBe(className);
	});
});
