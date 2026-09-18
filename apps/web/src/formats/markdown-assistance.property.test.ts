import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { markdownCodec } from "@/formats/markdown";
import { markdownDividerAssistance } from "@/formats/markdown-assistance";
import { lineSpans } from "@/formats/parse";
import {
	codecDocumentArbitrary,
	PROPERTY_RUNS,
} from "@/testing/property-arbitraries";

// The two invariants the divider assistance must hold for any table and any
// edit (#297): the serializer's own output is already consistent, so it is
// never adjusted, and whatever the assistance does return stays inside the
// divider line, so no byte of anything the user wrote is ever touched.

const markdownDocument = codecDocumentArbitrary(markdownCodec);

// One arbitrary user edit: a range of the text replaced with arbitrary text,
// including pipes, dashes, colons, and line breaks.
const editArbitrary = fc.record({
	start: fc.nat(),
	length: fc.nat({ max: 12 }),
	insert: fc.string({
		unit: fc.constantFrom("|", "-", ":", " ", "\n", "a", "\\", "東"),
		maxLength: 8,
	}),
});

describe("markdown divider assistance properties", () => {
	test.prop([markdownDocument], { numRuns: PROPERTY_RUNS })(
		"never adjusts a table the serializer wrote",
		(document) => {
			const text = markdownCodec.serialize(document);
			expect(
				markdownDividerAssistance(text, text, [{ from: 0, to: text.length }]),
			).toBeNull();
		},
	);

	test.prop([markdownDocument, editArbitrary], { numRuns: PROPERTY_RUNS })(
		"changes nothing outside the divider line",
		(document, { start, length, insert }) => {
			const before = markdownCodec.serialize(document);
			const from = start % (before.length + 1);
			const to = Math.min(before.length, from + length);
			const after = before.slice(0, from) + insert + before.slice(to);
			const assisted = markdownDividerAssistance(before, after, [
				{ from, to: from + insert.length },
			]);
			if (!assisted) return;

			const lines = after.split(/\r?\n/);
			const firstLine = lines.findIndex((line) => line.trim() !== "");
			const divider = lineSpans(after)[firstLine + 1];
			if (!divider)
				throw new Error("assistance returned an edit with no divider");
			expect(assisted.from).toBeGreaterThanOrEqual(divider.from);
			expect(assisted.to).toBeLessThanOrEqual(divider.to);
			expect(assisted.insert).not.toMatch(/[\r\n]/);
		},
	);
});
