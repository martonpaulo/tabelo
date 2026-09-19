import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import {
	inlineContentArbitrary,
	inlineNodesArbitrary,
	PROPERTY_RUNS,
} from "@/testing/property-arbitraries";
import { cellText, cellValuesEqual } from "./cell-value";
import {
	inlineImages,
	inlineLength,
	inlineText,
	isValidInlineContent,
	markState,
	normalizeInline,
	removeLink,
	replaceRange,
	setLink,
	setMark,
	sliceInline,
	toggleMark,
} from "./inline-content";
import type { InlineMark, InlineNode, TextContent } from "./types";

// The invariants every later slice of #306 builds on: normalization never
// changes what content reads as, every operation keeps content in the one
// normalized form, and formatting operations never touch the text itself.

function rawText(nodes: readonly InlineNode[]): string {
	return nodes
		.map((node) => {
			if (node.kind === "image") return node.alt;
			if (node.kind === "link") {
				return node.children.map((child) => child.text).join("");
			}
			return node.text;
		})
		.join("");
}

function splitsPair(text: string, offset: number): boolean {
	const high = text.charCodeAt(offset - 1);
	const low = text.charCodeAt(offset);
	return (
		offset > 0 &&
		offset < text.length &&
		high >= 0xd800 &&
		high <= 0xdbff &&
		low >= 0xdc00 &&
		low <= 0xdfff
	);
}

function isCanonical(value: TextContent): boolean {
	return typeof value === "string" || isValidInlineContent(value);
}

const textContentArbitrary: fc.Arbitrary<TextContent> = fc.oneof(
	fc.string({ maxLength: 12 }),
	inlineContentArbitrary,
);

function withRange<Value extends TextContent>(arbitrary: fc.Arbitrary<Value>) {
	return arbitrary.chain((value) => {
		const length = inlineLength(value);
		return fc.record({
			value: fc.constant(value),
			start: fc.integer({ min: 0, max: length }),
			end: fc.integer({ min: 0, max: length }),
		});
	});
}

const markArbitrary = fc.constantFrom<InlineMark>(
	"bold",
	"italic",
	"underline",
	"strikethrough",
	"code",
);

describe("inline content properties", () => {
	test.prop({ nodes: inlineNodesArbitrary }, { numRuns: PROPERTY_RUNS })(
		"normalization keeps the text, is canonical, and is idempotent",
		({ nodes }) => {
			const normalized = normalizeInline(nodes);

			expect(cellText(normalized)).toBe(rawText(nodes));
			expect(isCanonical(normalized)).toBe(true);
			if (typeof normalized !== "string") {
				expect(normalizeInline(normalized.nodes)).toEqual(normalized);
				expect(inlineText(normalized)).toBe(rawText(nodes));
			}
		},
	);

	test.prop(
		{ input: withRange(textContentArbitrary), mark: markArbitrary },
		{ numRuns: PROPERTY_RUNS },
	)(
		"a mark changes formatting and never the text",
		({ input: { value, start, end }, mark }) => {
			for (const enabled of [true, false]) {
				const next = setMark(value, start, end, mark, enabled);
				expect(cellText(next)).toBe(cellText(value));
				expect(isCanonical(next)).toBe(true);
			}
			const toggled = toggleMark(value, start, end, mark);
			expect(cellText(toggled)).toBe(cellText(value));
			expect(isCanonical(toggled)).toBe(true);
		},
	);

	test.prop(
		{
			input: withRange(textContentArbitrary),
			mark: fc.constantFrom<InlineMark>(
				"bold",
				"italic",
				"underline",
				"strikethrough",
			),
		},
		{ numRuns: PROPERTY_RUNS },
	)(
		"toggling a mark the range lacks twice restores the content",
		({ input: { value, start, end }, mark }) => {
			fc.pre(markState(value, start, end, mark) === "off");
			const twice = toggleMark(
				toggleMark(value, start, end, mark),
				start,
				end,
				mark,
			);

			expect(cellValuesEqual(twice, value)).toBe(true);
		},
	);

	test.prop(
		{
			input: withRange(textContentArbitrary),
			url: fc.constantFrom(
				"https://example.com/rio",
				"mailto:ingrid@example.com",
			),
		},
		{ numRuns: PROPERTY_RUNS },
	)(
		"linking and unlinking keep the text",
		({ input: { value, start, end }, url }) => {
			const linked = setLink(value, start, end, url);
			if (linked !== null) {
				expect(cellText(linked)).toBe(cellText(value));
				expect(isCanonical(linked)).toBe(true);
			}
			const unlinked = removeLink(value, start, end);
			expect(cellText(unlinked)).toBe(cellText(value));
			expect(isCanonical(unlinked)).toBe(true);
		},
	);

	test.prop(
		{ input: withRange(textContentArbitrary), fragment: textContentArbitrary },
		{ numRuns: PROPERTY_RUNS },
	)(
		"replacing a range splices the fragment into the text",
		({ input: { value, start, end }, fragment }) => {
			const next = replaceRange(value, start, end, fragment);
			const text = cellText(value);

			// The range widens only to keep an image or a surrogate pair whole.
			let from = Math.min(start, end);
			let to = Math.max(start, end);
			for (const image of inlineImages(value)) {
				if (from > image.start && from < image.end) from = image.start;
				if (to > image.start && to < image.end) to = image.end;
			}
			if (splitsPair(text, from)) from -= 1;
			if (splitsPair(text, to)) to += 1;

			expect(isCanonical(next)).toBe(true);
			expect(cellText(next)).toBe(
				text.slice(0, from) + cellText(fragment) + text.slice(to),
			);
		},
	);

	test.prop(
		{ input: withRange(textContentArbitrary) },
		{ numRuns: PROPERTY_RUNS },
	)(
		"putting a slice back where it came from changes nothing",
		({ input: { value, start, end } }) => {
			const slice = sliceInline(value, start, end);
			const restored = replaceRange(value, start, end, slice);

			expect(isCanonical(slice)).toBe(true);
			expect(cellValuesEqual(restored, value)).toBe(true);
		},
	);
});
