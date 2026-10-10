// @vitest-environment happy-dom
// Every registered codec runs through the same public parse/serialize seam.
// HTML needs DOMParser, so this matrix uses the same lightweight environment
// as the HTML codec's own focused tests.

import { describe, expect, it } from "vitest";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { canSerialize, listCodecs } from "@/formats";

const hostileValues = [
	"",
	" leading",
	"trailing ",
	"  repeated  ",
	"\tvalue\t",
	"\u00a0value\u00a0",
	"   ",
	"&",
	"&amp;",
	"&#32;",
	"&#92;",
	"has | pipe",
	"back\\slash",
	"line one\nline two",
	"\n\\",
	"\\\n",
	"<br>",
	"everything & | \n \\ at once",
] as const;

describe("registered codec byte round trips", () => {
	const matrix = [
		["Key", "Value"],
		...hostileValues.map((value, index) => [`case-${index + 1}`, value]),
	];
	const document = documentFromMatrix(matrix, { headerRow: true });

	for (const codec of listCodecs()) {
		it(`${codec.id} preserves the shared hostile matrix`, () => {
			expect(canSerialize(codec, document)).toBeNull();
			const parsed = codec.parse(codec.serialize(document));

			expect(parsed.ok, `${codec.id} failed to parse its own output`).toBe(
				true,
			);
			if (!parsed.ok) return;
			expect(documentToMatrix(parsed.document)).toEqual(matrix);
		});
	}
});

// #484: a format that offers the boolean spelling says which tokens it writes,
// and only such a format does, so reconciliation always has the text to fall
// back to and no pane offers a spelling that would write nothing. Written and
// read in that spelling, a boolean comes back as itself (#485: HTML's checkbox
// has no text, so its fallback text is empty for both values).
describe("registered boolean spellings", () => {
	const document = documentFromMatrix(
		[
			["Name", "Active"],
			["Ingrid", true],
			["Paulo", false],
		],
		{ headerRow: true },
	);

	it("declare their tokens exactly when they offer the spelling", () => {
		for (const codec of listCodecs()) {
			const offers = codec.spellings?.includes("booleanMarks") === true;
			expect(codec.booleanTokens !== undefined, codec.id).toBe(offers);
			if (!offers) continue;
			const text = codec.serialize(document, { booleanMarks: true });
			expect(text, codec.id).not.toBe(codec.serialize(document));
			const parsed = codec.parse(text, { booleanMarks: true });
			expect(parsed.ok, codec.id).toBe(true);
			if (!parsed.ok) continue;
			expect(documentToMatrix(parsed.document), codec.id).toEqual(
				documentToMatrix(document),
			);
		}
	});
});
