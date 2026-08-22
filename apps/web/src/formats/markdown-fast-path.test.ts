import { test } from "@fast-check/vitest";
import stringWidth from "string-width";
import { describe, expect, it } from "vitest";
import { documentFromMatrix } from "@/core/document";
import {
	escapeAndMeasure,
	escapeCell,
	markdownCodec,
} from "@/formats/markdown";
import {
	cellStringArbitrary,
	PROPERTY_RUNS,
} from "@/testing/property-arbitraries";

// The serializer escapes and measures each cell once, and skips the escaping
// loop for cells that need none. That fast path is only safe while it stays a
// strict subset of the general one, so the properties below tie it to
// `escapeCell` and `string-width` rather than to a fixture that happens to be
// Latin. See #264.

describe("markdown escape-and-measure", () => {
	test.prop({ value: cellStringArbitrary }, { numRuns: PROPERTY_RUNS * 5 })(
		"agrees with the general escaper and its measurement",
		({ value }) => {
			const escaped = escapeCell(value);
			expect(escapeAndMeasure(value)).toEqual({
				text: escaped,
				width: stringWidth(escaped),
			});
		},
	);

	// #186 chose `string-width` so that CJK and emoji align in a monospaced
	// editor. A width shortcut that measured them by code-unit count would look
	// right in ASCII and misalign every column holding one of these.
	it.each([
		["CJK", "東京"],
		["an emoji ZWJ sequence", "👩‍💻"],
		["a combining accent", "é"],
		["a non-breaking space", "a b"],
		["an interior tab", "a\tb"],
	])("measures %s by display width, not length", (_case, value) => {
		expect(escapeAndMeasure(value).width).toBe(stringWidth(escapeCell(value)));
	});
});

describe("markdown column padding", () => {
	// The reserved room and the padding width disagree for exactly one input,
	// the empty cell, and carrying one measurement per cell is what could have
	// collapsed them. Every line coming out the same display width is the
	// observable form of that rule, and unlike splitting on the pipe it survives
	// a cell that contains an escaped one.
	it.each([
		["an empty cell beside a wide one", [["Note"], [""], ["a wide value"]]],
		[
			"a column of only empty cells",
			[
				["Note", "Other"],
				["", "x"],
				["", "y"],
			],
		],
		["a single space", [["Note"], [" "], ["wide"]]],
		[
			"mixed display widths",
			[
				["Note"],
				["\u6771\u4eac"],
				["\ud83d\udc69\u200d\ud83d\udcbb"],
				["ascii"],
			],
		],
		["escaped content", [["Note"], ["a | b"], ["back\\slash"], ["<br>"]]],
	])("gives every line one width for %s", (_case, matrix) => {
		const document = documentFromMatrix(matrix, { headerRow: true });
		const lines = markdownCodec.serialize(document).split("\n");

		expect(lines).toHaveLength(matrix.length + 1);
		const [first] = lines;
		expect(first).toBeDefined();
		for (const line of lines) {
			expect(stringWidth(line)).toBe(stringWidth(first ?? ""));
		}
	});
});
