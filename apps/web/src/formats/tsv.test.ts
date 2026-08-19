import { describe, expect, it } from "vitest";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { tsvCodec } from "./tsv";

// TSV is only ever tab-separated, so its risk is not delimiter choice but the
// fact that tabs and line breaks are whitespace to String.trim. A table whose
// cells are all empty writes nothing but separators, and #217 recorded that
// the codec then refused to read its own output.

function matrixOf(text: string) {
	const result = tsvCodec.parse(text);
	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error("expected a valid parse");
	return documentToMatrix(result.document);
}

describe("tsv parsing", () => {
	it.each([1, 2, 3])("reads back an all-empty %i-column table", (width) => {
		const original = [Array(width).fill(""), Array(width).fill("")];
		const document = documentFromMatrix(original, { headerRow: true });
		expect(matrixOf(tsvCodec.serialize(document))).toEqual(original);
	});

	it("still treats a cleared editor as empty source", () => {
		expect(tsvCodec.parse("").ok).toBe(false);
	});

	it("keeps a comma as content", () => {
		expect(matrixOf("A\tB\n1,2\t3")).toEqual([
			["A", "B"],
			["1,2", "3"],
		]);
	});

	it("ignores a trailing newline rather than inventing a row", () => {
		expect(matrixOf("A\tB\n1\t2\n")).toEqual([
			["A", "B"],
			["1", "2"],
		]);
	});

	it("preserves a trailing row whose cells are all empty", () => {
		const original = [
			["A", "B"],
			["1", "2"],
			["", ""],
		];
		const document = documentFromMatrix(original, { headerRow: true });
		expect(matrixOf(tsvCodec.serialize(document))).toEqual(original);
	});
});
