import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { readCell } from "@/core/cell-value";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import type { CellValue, TableDocument } from "@/core/types";
import {
	cellStringArbitrary,
	PROPERTY_RUNS,
} from "@/testing/property-arbitraries";
import { jsonCodec } from "./json";

function valuesOf(document: TableDocument): CellValue[][] {
	return document.rows.map((row) =>
		document.columns.map((column) => readCell(row, column.id)),
	);
}

describe("json parsing", () => {
	it("reads every JSON scalar without coercing its type", () => {
		const result = jsonCodec.parse(
			'[{"qty":1,"ok":true,"note":null,"name":"x","code":"007","truth":"true","nil":"null"}]',
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.document.columns.map((column) => column.header)).toEqual([
			"qty",
			"ok",
			"note",
			"name",
			"code",
			"truth",
			"nil",
		]);
		expect(valuesOf(result.document)).toEqual([
			[1, true, null, "x", "007", "true", "null"],
		]);
	});

	it("rejects malformed JSON, positional rows, and non-scalar cells", () => {
		expect(jsonCodec.parse("[").ok).toBe(false);
		expect(jsonCodec.parse('{"Name":"Ingrid"}').ok).toBe(false);
		expect(jsonCodec.parse('[["Name"], ["Ingrid"]]').ok).toBe(false);
		expect(jsonCodec.parse('[{"Name":{"first":"Ingrid"}}]').ok).toBe(false);
		expect(jsonCodec.parse('[{"Name":["Ingrid"]}]').ok).toBe(false);
		expect(jsonCodec.parse("[{}]").ok).toBe(false);
	});

	it("accepts mixed types under one key", () => {
		const result = jsonCodec.parse('[{"a":1},{"a":"x"}]');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(valuesOf(result.document)).toEqual([[1], ["x"]]);
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

	it("keeps a missing key as an empty string and explicit null as null", () => {
		const result = jsonCodec.parse('[{"A":null},{"B":false}]');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(valuesOf(result.document)).toEqual([
			[null, ""],
			["", false],
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
				["Ingrid", "Designer"],
			],
			{ headerRow: true },
		);
		expect(jsonCodec.serialize(document)).toBe(
			'[\n  {"Name":"Ingrid","Role":"Designer"}\n]',
		);
	});

	it("serializes canonical values as their native JSON scalars", () => {
		const document = documentFromMatrix(
			[
				["qty", "ok", "note", "name"],
				[1, true, null, "x"],
			],
			{ headerRow: true },
		);
		expect(jsonCodec.serialize(document)).toBe(
			'[\n  {"qty":1,"ok":true,"note":null,"name":"x"}\n]',
		);
	});

	const scalarArbitrary: fc.Arbitrary<CellValue> = fc.oneof(
		cellStringArbitrary,
		fc.integer(),
		fc.boolean(),
		fc.constant(null),
		fc.constantFrom("007", "true", "null"),
	);
	const recordArbitrary = fc.dictionary(
		fc.constantFrom("alpha", "beta", "gamma"),
		scalarArbitrary,
		{ maxKeys: 3 },
	);

	test.prop(
		{
			records: fc
				.array(recordArbitrary, { minLength: 1, maxLength: 8 })
				.filter((records) =>
					records.some((record) => Object.keys(record).length),
				),
		},
		{ numRuns: PROPERTY_RUNS },
	)(
		"round-trips bounded mixed scalar records, missing keys, and lookalikes",
		({ records }) => {
			const headers = [
				...new Set(records.flatMap((record) => Object.keys(record))),
			];
			const expected = records.map((record) =>
				headers.map((header) =>
					Object.hasOwn(record, header) ? record[header] : "",
				),
			);
			const parsed = jsonCodec.parse(JSON.stringify(records));
			expect(parsed.ok).toBe(true);
			if (!parsed.ok) return;
			expect(parsed.document.columns.map((column) => column.header)).toEqual(
				headers,
			);
			expect(valuesOf(parsed.document)).toEqual(expected);

			const reparsed = jsonCodec.parse(jsonCodec.serialize(parsed.document));
			expect(reparsed.ok).toBe(true);
			if (!reparsed.ok) return;
			expect(valuesOf(reparsed.document)).toEqual(expected);
		},
	);
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
