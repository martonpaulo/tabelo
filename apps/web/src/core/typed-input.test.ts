import { describe, expect, it } from "vitest";
import { cellValueType } from "./cell-value";
import { convertCellValue, parseExpectedValue } from "./typed-input";
import type { CellValue, CellValueType } from "./types";

describe("expected-type input", () => {
	it.each(["007", "1e5", "true", "0123", "'hello"])(
		"keeps %s opaque in a text column",
		(input) => {
			expect(parseExpectedValue(input, "text")).toEqual({
				kind: "typed",
				value: input,
			});
		},
	);

	it.each([
		["0", 0],
		["-12", -12],
		["1.5", 1.5],
		["true", true],
		["false", false],
	] as const)("accepts canonical %s as a typed value", (input, value) => {
		const expectedType = typeof value === "number" ? "number" : "boolean";
		expect(parseExpectedValue(input, expectedType)).toEqual({
			kind: "typed",
			value,
		});
	});

	it.each([
		["007", "number", 7],
		["1e5", "number", 100000],
		["+1", "number", 1],
		[".5", "number", 0.5],
		["1.", "number", 1],
		["-0", "number", -0],
		[" 1 ", "number", 1],
		["TRUE", "boolean", true],
		[" false ", "boolean", false],
	] as const)(
		"requires a choice before %s becomes a %s",
		(input, expectedType, typedValue) => {
			expect(parseExpectedValue(input, expectedType)).toEqual({
				kind: "lossy-choice",
				expectedType,
				typedValue,
				stringValue: input,
			});
		},
	);

	it.each([
		["", "number"],
		[" ", "number"],
		["1,5", "number"],
		["0x10", "number"],
		["Infinity", "number"],
		["NaN", "number"],
		["yes", "boolean"],
		["1", "boolean"],
	] as const)("keeps invalid %p recoverable for %s", (input, expectedType) => {
		expect(parseExpectedValue(input, expectedType)).toEqual({
			kind: "invalid",
			expectedType,
			stringValue: input,
		});
	});

	it.each([
		["'hello", "hello"],
		["''hello", "'hello"],
		["'", ""],
	] as const)("uses one apostrophe to force %p to text", (input, value) => {
		expect(parseExpectedValue(input, "number")).toEqual({
			kind: "escaped-string",
			value,
		});
	});
});

// The conversion table the Cell type command uses (#371, docs/adr/0008). Each
// row is a value, a target, and what comes out: the new value and whether the
// user is asked first, or a refusal.
describe("explicit cell type conversion", () => {
	const lossOf = (back: CellValue | null) => ({ kind: "loses-original", back });
	const empty = { kind: "fills-empty" };

	it.each<[CellValue, CellValueType, CellValue | "refused", object | null]>([
		// To string: always, and back again whenever the text reads back.
		[35, "string", "35", null],
		[true, "string", "true", null],
		[null, "string", "", null],
		// To null: always. Only an empty cell goes without asking.
		["", "null", null, null],
		["Rio", "null", null, lossOf("")],
		[35, "null", null, lossOf(null)],
		// Converting back fills the empty cell with false again, so nothing
		// is lost and nothing is asked.
		[false, "null", null, null],
		// To number: decimal text and booleans; empty cells have no number.
		["35", "number", 35, null],
		["007", "number", 7, lossOf("7")],
		[" 35 ", "number", 35, lossOf("35")],
		[false, "number", 0, null],
		[true, "number", 1, null],
		["", "number", "refused", null],
		[null, "number", "refused", null],
		["Rio", "number", "refused", null],
		["'7", "number", "refused", null],
		// To boolean: its words, zero and non-zero, and empty as false.
		["true", "boolean", true, null],
		["false", "boolean", false, null],
		["TRUE", "boolean", true, lossOf("true")],
		[0, "boolean", false, null],
		[1, "boolean", true, null],
		[2, "boolean", true, lossOf(1)],
		[-0.5, "boolean", true, lossOf(1)],
		["", "boolean", false, empty],
		[null, "boolean", false, empty],
		["yes", "boolean", "refused", null],
		["1", "boolean", "refused", null],
		// The same type is never a change.
		[false, "boolean", false, null],
		["Rio", "string", "Rio", null],
	])("%j to %s gives %j", (value, target, expected, confirm) => {
		const result = convertCellValue(value, target);
		if (expected === "refused") {
			expect(result).toEqual({ ok: false });
			return;
		}
		expect(result).toEqual({ ok: true, value: expected, confirm });
	});

	it("never asks about a conversion that converts back exactly", () => {
		const values: CellValue[] = [
			"",
			"Rio",
			"35",
			"true",
			0,
			1,
			35,
			true,
			false,
			null,
		];
		const targets: CellValueType[] = ["string", "number", "boolean", "null"];
		for (const value of values) {
			for (const target of targets) {
				const result = convertCellValue(value, target);
				if (!result.ok || result.confirm?.kind !== "loses-original") continue;
				const back = convertCellValue(result.value, cellValueType(value));
				expect(back.ok && back.value === value).toBe(false);
			}
		}
	});
});
