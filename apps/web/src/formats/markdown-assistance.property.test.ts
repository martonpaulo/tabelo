import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { markdownCodec } from "@/formats/markdown";
import { markdownDividerAssistance } from "@/formats/markdown-assistance";
import { displayWidth } from "@/formats/markdown-grammar";
import { lineSpans, pipeCellSpans } from "@/formats/parse";
import { applyEdits } from "@/testing/assistance";
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
			for (const edit of assisted) {
				expect(edit.from).toBeGreaterThanOrEqual(divider.from);
				expect(edit.to).toBeLessThanOrEqual(divider.to);
				expect(edit.insert).not.toMatch(/[\r\n]/);
			}
		},
	);
});

// The column padding invariants (#401): typing into one cell of a table the
// serializer wrote leaves that column aligned in every row, and nothing but
// blank padding outside the divider changes, so the table still reads as the
// same values.
const cellTypingArbitrary = fc.record({
	line: fc.nat(),
	cell: fc.nat(),
	offset: fc.nat(),
	insert: fc.string({
		unit: fc.constantFrom("a", "東", " ", "Z"),
		minLength: 1,
		maxLength: 12,
	}),
});

describe("markdown column padding assistance properties", () => {
	test.prop([markdownDocument, cellTypingArbitrary], {
		numRuns: PROPERTY_RUNS,
	})(
		"keeps the typed column aligned and changes only padding",
		(document, { line, cell, offset, insert }) => {
			const assist = markdownCodec.structuralAssistance;
			if (!assist) throw new Error("Markdown declares no assistance.");
			const before = markdownCodec.serialize(document);
			const lines = before.split("\n");
			// Any line but the divider.
			const candidates = [...lines.keys()].filter((index) => index !== 1);
			const lineIndex = candidates[line % candidates.length];
			if (lineIndex === undefined) return;
			const lineFrom = lineSpans(before)[lineIndex]?.from ?? 0;
			const cells = pipeCellSpans(lines[lineIndex] ?? "");
			const column = cell % cells.length;
			const span = cells[column];
			if (!span) return;
			const at = lineFrom + span.from + (offset % (span.to - span.from + 1));
			const after = before.slice(0, at) + insert + before.slice(at);
			const edits = assist(before, after, [
				{ from: at, to: at + insert.length },
			]);
			// An insertion right after a backslash can turn an escaped pipe into
			// a delimiter, which is no longer an edit inside one cell.
			if (!edits) return;

			const divider = lineSpans(after)[1];
			if (!divider) throw new Error("The table has no divider.");
			for (const edit of edits) {
				if (edit.from >= divider.from && edit.to <= divider.to) continue;
				expect(after.slice(edit.from, edit.to)).toMatch(/^ *$/);
				expect(edit.insert).toMatch(/^ *$/);
			}

			const result = applyEdits(after, edits);
			const widths = result
				.split("\n")
				.filter((_, index) => index !== 1)
				.map((text) => {
					const own = pipeCellSpans(text)[column];
					return own ? displayWidth(text.slice(own.from, own.to)) : null;
				});
			expect(new Set(widths).size).toBe(1);

			const reread = markdownCodec.parse(result);
			const typed = markdownCodec.parse(after);
			if (!reread.ok || !typed.ok) throw new Error("A draft stopped parsing.");
			expect(markdownCodec.serialize(reread.document)).toBe(
				markdownCodec.serialize(typed.document),
			);
		},
	);
});
