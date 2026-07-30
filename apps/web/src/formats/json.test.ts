import { describe, expect, it } from "vitest";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { jsonCodec } from "./json";

describe("json parsing", () => {
	it("reads an array of row objects without coercing cell values", () => {
		const result = jsonCodec.parse('[ { "Name": "Inez", "Active": "true" } ]');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(documentToMatrix(result.document)).toEqual([
			["Name", "Active"],
			["Inez", "true"],
		]);
	});

	it("rejects malformed JSON, the positional shape, and non-string cells", () => {
		expect(jsonCodec.parse("[").ok).toBe(false);
		expect(jsonCodec.parse('{"Name":"Inez"}').ok).toBe(false);
		expect(jsonCodec.parse('[["Name"], ["Inez"]]').ok).toBe(false);
		expect(jsonCodec.parse('[{"Name": 42}]').ok).toBe(false);
		expect(jsonCodec.parse("[{}]").ok).toBe(false);
	});

	it("warns about ragged rows without dropping their values", () => {
		const result = jsonCodec.parse(
			'[ { "A": "one" }, { "A": "two", "B": "three" } ]',
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// B is only discovered on the second record, so the first one is short.
		expect(result.warnings).toEqual([
			{ code: "row-column-count", row: 1, actual: 1, expected: 2 },
		]);
		expect(documentToMatrix(result.document)).toEqual([
			["A", "B"],
			["one", ""],
			["two", "three"],
		]);
	});

	it("keeps a column that only a later record introduces", () => {
		const result = jsonCodec.parse('[ { "A": "one" }, { "Z": "two" } ]');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(documentToMatrix(result.document)).toEqual([
			["A", "Z"],
			["one", ""],
			["", "two"],
		]);
	});
});

describe("json serialization", () => {
	it("round-trips empty strings, line breaks, quotes, and backslashes", () => {
		const matrix = [
			["First", "Second"],
			["", "line 1\nline 2"],
			['a "quote"', "\\path"],
		];
		const document = documentFromMatrix(matrix, { headerRow: true });
		const reparsed = jsonCodec.parse(jsonCodec.serialize(document));
		expect(reparsed.ok).toBe(true);
		if (!reparsed.ok) return;
		expect(documentToMatrix(reparsed.document)).toEqual(matrix);
	});

	it("writes an array of row objects keyed by the headers", () => {
		const document = documentFromMatrix(
			[
				["Name", "Role"],
				["Inez", "Designer"],
			],
			{ headerRow: true },
		);
		expect(jsonCodec.serialize(document)).toBe(
			'[\n  {"Name":"Inez","Role":"Designer"}\n]',
		);
	});
});

describe("json header precondition", () => {
	function preconditionFor(headers: readonly string[]) {
		const document = documentFromMatrix(
			[[...headers], headers.map(() => "value")],
			{ headerRow: true },
		);
		return jsonCodec.precondition?.(document) ?? null;
	}

	it("accepts headers that can be object keys", () => {
		expect(preconditionFor(["Name", "Role"])).toBeNull();
	});

	it("declines empty and whitespace-only headers", () => {
		expect(preconditionFor(["", "Valid"])).toEqual({
			code: "json-empty-header",
			columns: [0],
		});
		expect(preconditionFor(["Valid", "   "])).toEqual({
			code: "json-empty-header",
			columns: [1],
		});
	});

	it("declines duplicates, naming every position of the repeated header", () => {
		expect(preconditionFor(["Dup", "Other", "Dup"])).toEqual({
			code: "json-duplicate-header",
			columns: [0, 2],
		});
	});

	it("treats headers differing only in surrounding space as distinct keys", () => {
		expect(preconditionFor(["Name", "Name "])).toBeNull();
	});

	it("declines headers that are canonical array indices", () => {
		expect(preconditionFor(["Year", "2024"])).toEqual({
			code: "json-numeric-header",
			columns: [1],
		});
		expect(preconditionFor(["0"])).toEqual({
			code: "json-numeric-header",
			columns: [0],
		});
	});

	it("allows numeric-looking headers that are not array indices", () => {
		expect(preconditionFor(["01", "1.5", "-1", "1e3"])).toBeNull();
	});

	// The reason the precondition exists at all: an array index key is listed
	// ahead of every other key by the engine, so the decided array-of-row-objects
	// shape cannot preserve column order for one.
	it("proves an array index header would reorder columns on reparse", () => {
		expect(Object.keys(JSON.parse('{"Year":"a","2024":"b"}'))).toEqual([
			"2024",
			"Year",
		]);
	});
});
