// @vitest-environment happy-dom
// Every codec is exercised here, and the HTML one parses with the platform's
// DOMParser, so this file needs a DOM the way html.test.ts does.

import { describe, expect, it } from "vitest";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { canSerialize, listCodecs } from "@/formats";

// Empty headers are now a legal, and default, state: nothing generates a
// `Column N` name for a column the user has not named. That makes "a header
// with no text" a value every codec has to carry, and duplicate headers a shape
// they must not deduplicate. Driven off the registry so a new format is covered
// the moment it is registered, per docs/adr/0005.

// Two headers blank, two sharing a name, and one ordinary one.
const awkward = [
	["", "Name", "", "Name", "City"],
	["1", "Ingrid", "2", "Designer", "Rio"],
	["3", "Paulo", "4", "Developer", "Madrid"],
];

describe("unnamed and duplicate columns survive every codec", () => {
	const document = documentFromMatrix(awkward, { headerRow: true });

	it("is the document the matrix described, with nothing invented", () => {
		expect(document.columns.map((column) => column.header)).toEqual([
			"",
			"Name",
			"",
			"Name",
			"City",
		]);
	});

	for (const codec of listCodecs()) {
		// A codec may decline a document it cannot represent; that is its own
		// contract and not this test's subject.
		const refusal = canSerialize(codec, document);
		const run = refusal === null ? it : it.skip;

		run(`${codec.id} round-trips it byte-exact`, () => {
			const text = codec.serialize(document, {});
			const parsed = codec.parse(text);

			expect(parsed.ok, `${codec.id} failed to parse its own output`).toBe(
				true,
			);
			if (!parsed.ok) return;

			expect(documentToMatrix(parsed.document)).toEqual(awkward);
		});
	}
});

describe("a wholly unnamed table survives every codec", () => {
	// What a new table is: a header row with no text in it at all.
	const blankHeaders = [
		["", "", ""],
		["a", "b", "c"],
	];
	const document = documentFromMatrix(blankHeaders, { headerRow: true });

	// JSON is the one format that cannot carry an unnamed column back. It keys
	// on the column's letter so the view can open at all, and parsing that key
	// necessarily produces a column named after the letter (#145). The
	// asymmetry is asserted below rather than skipped, because it is a decided
	// contract and not a gap.
	const asymmetric = new Set(["json"]);

	for (const codec of listCodecs()) {
		const refusal = canSerialize(codec, document);
		const run = refusal === null ? it : it.skip;

		run(`${codec.id} keeps the header row present and empty`, () => {
			const parsed = codec.parse(codec.serialize(document, {}));
			expect(parsed.ok, `${codec.id} failed to parse its own output`).toBe(
				true,
			);
			if (!parsed.ok) return;

			expect(documentToMatrix(parsed.document)).toEqual(
				asymmetric.has(codec.id)
					? [["A", "B", "C"], ...blankHeaders.slice(1)]
					: blankHeaders,
			);
		});

		run(`${codec.id} re-serializes its own output unchanged`, () => {
			const text = codec.serialize(document, {});
			const parsed = codec.parse(text);
			expect(parsed.ok).toBe(true);
			if (!parsed.ok) return;

			expect(codec.serialize(parsed.document, {})).toBe(text);
		});
	}
});
