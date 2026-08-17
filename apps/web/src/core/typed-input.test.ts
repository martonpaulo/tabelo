import { describe, expect, it } from "vitest";
import { convertCellValue, parseExpectedValue } from "./typed-input";

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

describe("explicit cell type conversion", () => {
	it("converts through the canonical text projection", () => {
		expect(convertCellValue("007", "number")).toEqual({ ok: true, value: 7 });
		expect(convertCellValue(7, "string")).toEqual({ ok: true, value: "7" });
		expect(convertCellValue("TRUE", "boolean")).toEqual({
			ok: true,
			value: true,
		});
	});

	it("does not treat an existing apostrophe as editor escape syntax", () => {
		expect(convertCellValue("'7", "number")).toEqual({ ok: false });
	});

	it("refuses incompatible scalar conversions", () => {
		expect(convertCellValue(true, "number")).toEqual({ ok: false });
		expect(convertCellValue(1, "boolean")).toEqual({ ok: false });
	});

	it("allows an explicit null and preserves an already matching type", () => {
		expect(convertCellValue("content", "null")).toEqual({
			ok: true,
			value: null,
		});
		expect(convertCellValue(false, "boolean")).toEqual({
			ok: true,
			value: false,
		});
	});
});
