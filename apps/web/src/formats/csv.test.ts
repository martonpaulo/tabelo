import { describe, expect, it } from "vitest";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { csvCodec } from "./csv";

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
		expect(matrixOf('Name,Note\nIngrid,"a,b"')).toEqual([
			["Name", "Note"],
			["Ingrid", "a,b"],
		]);
	});

	it("keeps a line break inside a quoted value", () => {
		expect(matrixOf('Name,Note\nIngrid,"line one\nline two"')).toEqual([
			["Name", "Note"],
			["Ingrid", "line one\nline two"],
		]);
	});

	it("unescapes doubled quotes", () => {
		expect(matrixOf('Name,Note\nIngrid,"he said ""hi"""')).toEqual([
			["Name", "Note"],
			["Ingrid", 'he said "hi"'],
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
		if (result.ok) return;
		expect(result.issues).toEqual([
			{ code: "delimited-unclosed-quote", line: 2 },
		]);
	});

	// #217: Papa Parse's own guess counted fields and picked a separator that
	// only occurred inside cell data, so canonical output failed to parse back.
	it("keeps a semicolon that is content rather than structure", () => {
		const document = documentFromMatrix([["column-1:&#32;&#92;"], ["row-1:"]], {
			headerRow: true,
		});
		expect(matrixOf(csvCodec.serialize(document))).toEqual([
			["column-1:&#32;&#92;"],
			["row-1:"],
		]);
	});

	it("keeps a tab that is content rather than structure", () => {
		const document = documentFromMatrix([["h"], ["a\tb\tc"]], {
			headerRow: true,
		});
		expect(matrixOf(csvCodec.serialize(document))).toEqual([
			["h"],
			["a\tb\tc"],
		]);
	});

	it("reads back canonical output whose header holds semicolons", () => {
		const original = [
			["a", "x:&#32;y", "c"],
			["1", "2", "3"],
		];
		const document = documentFromMatrix(original, { headerRow: true });
		expect(matrixOf(csvCodec.serialize(document))).toEqual(original);
	});

	// Detecting the separator belongs to the seam that receives text this
	// product did not write. A source view reads back the codec's own output,
	// where the separator is always the declared one, and guessing there let
	// cell data masquerade as structure (#217).
	it("detects a semicolon-delimited file on import", () => {
		const result = csvCodec.parseMatrix("A;B\n1;2");
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("expected a valid parse");
		expect(result.table.matrix).toEqual([
			["A", "B"],
			["1", "2"],
		]);
	});

	it("reads its own view as comma-separated", () => {
		expect(matrixOf("A;B\n1;2")).toEqual([["A;B"], ["1;2"]]);
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
		expect(csvCodec.serialize(document, { includeHeader: false })).toBe("1,2");
		// The choice belongs to the file, never to the table.
		expect(csvCodec.serialize(document)).toBe("A,B\n1,2");
		expect(document.columns.map((column) => column.header)).toEqual(["A", "B"]);
	});

	it("declares the header choice so the download chooser can offer it", () => {
		expect(csvCodec.outputOptions).toEqual(["includeHeader"]);
	});

	it("round-trips hostile values", () => {
		const original = [
			["Name", "Note"],
			["Ingrid", 'a,b\nc"d'],
			["", ""],
		];
		const document = documentFromMatrix(original, { headerRow: true });
		expect(matrixOf(csvCodec.serialize(document))).toEqual(original);
	});
});
