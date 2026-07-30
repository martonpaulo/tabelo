import { describe, expect, it } from "vitest";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { jsonCodec } from "./json";

describe("json parsing", () => {
	it("reads a json with columns and rows arrays without coercing cell values", () => {
		const result = jsonCodec.parse(
			'{ "columns": ["Name", "Active"], "rows": [ {"Name": "Inez", "Active": "true"} ] }',
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(documentToMatrix(result.document)).toEqual([
			["Name", "Active"],
			["Inez", "true"],
		]);
	});

	it("rejects malformed JSON, old array-of-arrays, missing arrays, and non-string cells", () => {
		expect(jsonCodec.parse("[").ok).toBe(false);
		expect(jsonCodec.parse('{"Name":"Inez"}').ok).toBe(false);
		expect(jsonCodec.parse('[["Name"], ["Inez"]]').ok).toBe(false);
		expect(
			jsonCodec.parse('{ "columns": ["Name"], "rows": [{"Name": 42}] }').ok,
		).toBe(false);
	});

	it("warns about ragged rows without dropping their values", () => {
		const result = jsonCodec.parse(
			'{ "columns": ["A", "B"], "rows": [ {"A": "one"}, {"A": "two", "B": "three"} ] }',
		);
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
	it("proves that JSON.parse reorders numeric-string keys, requiring an explicit column list in the JSON shape", () => {
		const parsed = JSON.parse('{"Year": "a", "2024": "b", "Value": "c"}');
		const keys = Object.keys(parsed);
		expect(keys).toEqual(["2024", "Year", "Value"]);
	});

	it("round-trips duplicate headers, empty strings, line breaks, and quotes", () => {
		const matrix = [
			["Col 1", "Col 2"],
			["", "line 1\nline 2"],
			['a "quote"', "\\path"],
		];
		const document = documentFromMatrix(matrix, { headerRow: true });
		const reparsed = jsonCodec.parse(jsonCodec.serialize(document));
		expect(reparsed.ok).toBe(true);
		if (!reparsed.ok) return;
		expect(documentToMatrix(reparsed.document)).toEqual(matrix);
	});

	it("declines via precondition if headers are empty or duplicated", () => {
		const emptyDoc = documentFromMatrix(
			[
				["", "Valid"],
				["a", "b"],
			],
			{ headerRow: true },
		);
		const emptyPrecondition = jsonCodec.precondition?.(emptyDoc);
		expect(emptyPrecondition).toEqual({
			code: "json-empty-header",
			columns: [0],
		});

		const dupDoc = documentFromMatrix(
			[
				["Dup", "Dup"],
				["a", "b"],
			],
			{ headerRow: true },
		);
		const dupPrecondition = jsonCodec.precondition?.(dupDoc);
		expect(dupPrecondition).toEqual({
			code: "json-duplicate-header",
			columns: [1],
		});
	});
});
