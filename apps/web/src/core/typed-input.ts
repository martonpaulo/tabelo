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

export type CellTypeConversionResult =
	| { readonly ok: true; readonly value: CellValue }
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

// Selecting a cell type is already an explicit conversion command, so a valid
// non-canonical spelling can convert immediately. Apostrophe escaping belongs
// to editor input and is deliberately not reinterpreted in an existing value.
export function convertCellValue(
	value: CellValue,
	targetType: CellValueType,
): CellTypeConversionResult {
	if (cellValueType(value) === targetType) return { ok: true, value };
	if (targetType === "null") return { ok: true, value: null };
	if (targetType === "string") return { ok: true, value: cellText(value) };

	const converted = parseNativeValue(cellText(value), targetType);
	return converted === null ? { ok: false } : { ok: true, value: converted };
}
