import { describe, expect, it } from "vitest";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { csvCodec, serializeCsvWith } from "./csv";

// The CSV cases the product promises to handle, stated as tests so a future
// parser swap has to keep them.

function matrixOf(text: string) {
	const result = csvCodec.parse(text);
	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error("expected a valid parse");
	return documentToMatrix(result.document);
}

describe("csv parsing", () => {
	it("keeps a delimiter inside a quoted value", () => {
		expect(matrixOf('Name,Note\nAna,"a,b"')).toEqual([
			["Name", "Note"],
			["Ana", "a,b"],
		]);
	});

	it("keeps a line break inside a quoted value", () => {
		expect(matrixOf('Name,Note\nAna,"line one\nline two"')).toEqual([
			["Name", "Note"],
			["Ana", "line one\nline two"],
		]);
	});

	it("unescapes doubled quotes", () => {
		expect(matrixOf('Name,Note\nAna,"he said ""hi"""')).toEqual([
			["Name", "Note"],
			["Ana", 'he said "hi"'],
		]);
	});

	it("preserves empty cells", () => {
		expect(matrixOf("A,B,C\n1,,3")).toEqual([
			["A", "B", "C"],
			["1", "", "3"],
		]);
	});

	it("preserves an empty row between data rows", () => {
		const matrix = matrixOf("A,B\n1,2\n\n3,4");
		expect(matrix).toHaveLength(4);
		expect(matrix[2]).toEqual(["", ""]);
	});

	it("reads CRLF the same as LF", () => {
		expect(matrixOf("A,B\r\n1,2")).toEqual(matrixOf("A,B\n1,2"));
	});

	it("ignores a trailing newline rather than inventing a row", () => {
		expect(matrixOf("A,B\n1,2\n")).toEqual([
			["A", "B"],
			["1", "2"],
		]);
	});

	it("pads a ragged row to the table width", () => {
		expect(matrixOf("A,B,C\n1,2")).toEqual([
			["A", "B", "C"],
			["1", "2", ""],
		]);
	});

	it("holds back on an unterminated quote so the last good table survives", () => {
		const result = csvCodec.parse('A,B\n1,"unterminated');
		expect(result.ok).toBe(false);
	});

	it("detects a semicolon-delimited file", () => {
		expect(matrixOf("A;B\n1;2")).toEqual([
			["A", "B"],
			["1", "2"],
		]);
	});
});

describe("csv serialization", () => {
	it("quotes only what needs quoting", () => {
		const document = documentFromMatrix(
			[
				["A", "B"],
				["plain", "has,comma"],
			],
			{ headerRow: true },
		);
		const out = csvCodec.serialize(document);
		expect(out).toBe('A,B\nplain,"has,comma"');
	});

	it("can omit the header row on export", () => {
		const document = documentFromMatrix(
			[
				["A", "B"],
				["1", "2"],
			],
			{ headerRow: true },
		);
		expect(serializeCsvWith(document, { includeHeader: false })).toBe("1,2");
	});

	it("round-trips hostile values", () => {
		const original = [
			["Name", "Note"],
			["Ana", 'a,b\nc"d'],
			["", ""],
		];
		const document = documentFromMatrix(original, { headerRow: true });
		expect(matrixOf(csvCodec.serialize(document))).toEqual(original);
	});
});
