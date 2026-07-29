import { describe, expect, it } from "vitest";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { jsonCodec } from "./json";

describe("json parsing", () => {
	it("reads a header-first matrix without coercing cell values", () => {
		const result = jsonCodec.parse('[ ["Name", "Active"], ["Inez", "true"] ]');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(documentToMatrix(result.document)).toEqual([
			["Name", "Active"],
			["Inez", "true"],
		]);
	});

	it("rejects malformed JSON, object-shaped data, and non-string cells", () => {
		expect(jsonCodec.parse("[").ok).toBe(false);
		expect(jsonCodec.parse('{"Name":"Inez"}').ok).toBe(false);
		expect(jsonCodec.parse('[["Name"], [42]]').ok).toBe(false);
	});

	it("warns about ragged rows without dropping their values", () => {
		const result = jsonCodec.parse('[["A", "B"], ["one"], ["two", "three"]]');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.warnings).toEqual([
			{
				code: "row-column-count",
				row: 1,
				actual: 1,
				expected: 2,
			},
		]);
	});
});

describe("json serialization", () => {
	it("round-trips duplicate headers, empty strings, line breaks, and quotes", () => {
		const matrix = [
			["Same", "Same"],
			["", "line 1\nline 2"],
			['a "quote"', "\\path"],
		];
		const document = documentFromMatrix(matrix, { headerRow: true });
		const reparsed = jsonCodec.parse(jsonCodec.serialize(document));
		expect(reparsed.ok).toBe(true);
		if (!reparsed.ok) return;
		expect(documentToMatrix(reparsed.document)).toEqual(matrix);
	});
});
