import { cellText, cellValueType } from "./cell-value";
import type { CellValue, CellValueType, ExpectedColumnType } from "./types";

type NativeExpectedType = Exclude<ExpectedColumnType, "text">;
type NativeCellValue = number | boolean;

export type ExpectedTypeParseResult =
	| { readonly kind: "typed"; readonly value: string | NativeCellValue }
	| { readonly kind: "escaped-string"; readonly value: string }
	| {
			readonly kind: "lossy-choice";
			readonly expectedType: NativeExpectedType;
			readonly typedValue: NativeCellValue;
			readonly stringValue: string;
	  }
	| {
			readonly kind: "invalid";
			readonly expectedType: NativeExpectedType;
			readonly stringValue: string;
	  };

// Why a conversion the user chose should still be confirmed before it runs
// (#371): it either loses the value it replaces, or it invents a value for an
// empty cell. Null means it can run at once.
export type ConversionConfirmation =
	| {
			readonly kind: "loses-original";
			// What converting the new value back to the original type gives,
			// which is how the loss is shown: `2` becomes `true`, and `true` back
			// is `1`. Null when no value of the original type comes back.
			readonly back: CellValue | null;
	  }
	| { readonly kind: "fills-empty" };

export type CellTypeConversionResult =
	| {
			readonly ok: true;
			readonly value: CellValue;
			readonly confirm: ConversionConfirmation | null;
	  }
	| { readonly ok: false };

// Decimal input accepts the familiar forms a person can deliberately type,
// including leading zeroes, a leading plus, and exponent notation. It rejects
// JavaScript-only spellings such as hex, Infinity, and NaN. Representation is
// decided separately by comparing the parsed value's one canonical projection.
const DECIMAL_INPUT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function parseNativeValue(
	input: string,
	expectedType: NativeExpectedType,
): NativeCellValue | null {
	const candidate = input.trim();
	if (expectedType === "number") {
		if (candidate === "" || !DECIMAL_INPUT.test(candidate)) return null;
		const value = Number(candidate);
		return Number.isFinite(value) ? value : null;
	}

	const normalized = candidate.toLowerCase();
	if (normalized === "true") return true;
	if (normalized === "false") return false;
	return null;
}

// This is the reusable seam for typed grid entry, later typed paste, and
// explicit series conversion. It reports the decision without writing a
// document or depending on React, copy, or history.
export function parseExpectedValue(
	input: string,
	expectedType: ExpectedColumnType,
): ExpectedTypeParseResult {
	if (expectedType === "text") return { kind: "typed", value: input };
	if (input.startsWith("'")) {
		return { kind: "escaped-string", value: input.slice(1) };
	}

	const value = parseNativeValue(input, expectedType);
	if (value === null) {
		return { kind: "invalid", expectedType, stringValue: input };
	}
	if (cellText(value) === input) return { kind: "typed", value };
	return {
		kind: "lossy-choice",
		expectedType,
		typedValue: value,
		stringValue: input,
	};
}

// The conversion table for the Cell type command (#371, docs/adr/0008). Each
// target accepts what it can represent and refuses the rest:
//
// - string: every value, as the text every view shows for it.
// - null: every value. An empty cell is null or the empty string.
// - number: decimal text (the same forms typed entry accepts), and booleans as
//   0 and 1. Empty cells and other text are refused: no number is there.
// - boolean: the text "true" or "false" (trimmed, any case), numbers as zero
//   for false and anything else for true, and empty cells as false.
//
// This reads the value the user is converting and nothing else; it is not type
// inference, because the user chose the target.
function convertRaw(
	value: CellValue,
	target: CellValueType,
): CellValue | undefined {
	if (cellValueType(value) === target) return value;
	switch (target) {
		case "string":
			return cellText(value);
		case "null":
			return null;
		case "number":
			if (typeof value === "boolean") return value ? 1 : 0;
			if (typeof value === "string") {
				return parseNativeValue(value, "number") ?? undefined;
			}
			return undefined;
		case "boolean":
			if (value === null || value === "") return false;
			if (typeof value === "number") return value !== 0;
			if (typeof value === "string") {
				return parseNativeValue(value, "boolean") ?? undefined;
			}
			return undefined;
	}
}

const isEmptyValue = (value: CellValue) => value === null || value === "";

// The same carried type and the same value: `35` and `"35"` differ.
const sameValue = (left: CellValue, right: CellValue) =>
	cellValueType(left) === cellValueType(right) && left === right;

// Selecting a cell type is an explicit conversion command, so it may replace a
// value. What it may not do is replace one silently: a conversion that loses
// the original, meaning converting back does not return it exactly, asks
// first, and so does inventing a boolean for an empty cell. Everything else,
// including every conversion of an empty cell to null, runs at once.
export function convertCellValue(
	value: CellValue,
	targetType: CellValueType,
): CellTypeConversionResult {
	const converted = convertRaw(value, targetType);
	if (converted === undefined) return { ok: false };
	if (sameValue(converted, value)) {
		return { ok: true, value: converted, confirm: null };
	}
	if (isEmptyValue(value) && targetType === "boolean") {
		return { ok: true, value: converted, confirm: { kind: "fills-empty" } };
	}
	const back = convertRaw(converted, cellValueType(value));
	const lossless = back !== undefined && sameValue(back, value);
	return {
		ok: true,
		value: converted,
		confirm: lossless
			? null
			: { kind: "loses-original", back: back === undefined ? null : back },
	};
}
