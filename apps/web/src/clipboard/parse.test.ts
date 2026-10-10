// @vitest-environment happy-dom

import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { readClipboardTable } from "./parse";
import { selectionClipboardPayload } from "./serialize";

describe("reading plain text with no delimiter", () => {
	// A terminal, an editor's line copy, and `pbcopy` all end the text with a
	// line break. Treating it as another line wrote an empty value over the
	// cell below the paste.
	it("drops the empty line a trailing break reports", () => {
		expect(readClipboardTable({ text: "Rio\n" })?.matrix).toEqual([["Rio"]]);
		expect(readClipboardTable({ text: "Rio\r\n" })?.matrix).toEqual([["Rio"]]);
	});

	it("keeps an empty line the user actually typed between values", () => {
		expect(readClipboardTable({ text: "Rio\n\nMadrid" })?.matrix).toEqual([
			["Rio"],
			[""],
			["Madrid"],
		]);
	});

	it("keeps every line of a multi-line paste", () => {
		expect(readClipboardTable({ text: "Rio\nMadrid\n" })?.matrix).toEqual([
			["Rio"],
			["Madrid"],
		]);
	});
});

// Whitespace is content, and only a clipboard with no characters is empty
// (#425). Each case is read as the shape the text represents, never trimmed,
// split on spaces, or given a type.
describe("reading whitespace and empty fields", () => {
	it("reads nothing from an empty clipboard", () => {
		expect(readClipboardTable({ text: "" })).toBeNull();
		expect(readClipboardTable({ text: "", html: "" })).toBeNull();
	});

	it("keeps spaces as one value, exactly", () => {
		expect(readClipboardTable({ text: "  " })).toEqual({
			matrix: [["  "]],
			source: "text",
		});
		expect(readClipboardTable({ text: " " })?.matrix).toEqual([[" "]]);
	});

	it("keeps each whitespace line as its own value", () => {
		expect(readClipboardTable({ text: " \n  \n" })?.matrix).toEqual([
			[" "],
			["  "],
		]);
	});

	it("reads a matrix of empty fields at its represented shape", () => {
		const table = readClipboardTable({ text: "\t\t\n\t\t" });
		expect(table?.source).toBe("tsv");
		expect(table?.matrix).toEqual([
			["", "", ""],
			["", "", ""],
		]);
		expect(readClipboardTable({ text: "\t\t\n\t\t\n" })?.matrix).toEqual(
			table?.matrix,
		);
		expect(readClipboardTable({ text: "\t" })?.matrix).toEqual([["", ""]]);
	});

	it("reads Tabelo's own rich copy of the same content back unchanged", () => {
		for (const matrix of [
			[["  "]],
			[
				["", "", ""],
				["", "", ""],
			],
		]) {
			const payload = selectionClipboardPayload({
				matrix,
				expectedTypes: matrix[0]?.map(() => "text") ?? [],
			});
			expect(readClipboardTable(payload)?.matrix).toEqual(matrix);
		}
	});
});

// The plain flavour a grid copy writes has to read back as the same values
// when it is the only flavour pasted (#491). A one-column selection carries no
// tab, so it is read as plain text, which has no quoting grammar to undo.
describe("reading Tabelo's plain flavour alone", () => {
	const plainOnly = (matrix: string[][]) =>
		readClipboardTable({
			text: selectionClipboardPayload({
				matrix,
				expectedTypes: matrix[0]?.map(() => "text") ?? [],
			}).text,
		})?.matrix;

	it.each([
		["a cell holding only spaces", [["  "]]],
		["a leading space", [[" Ingrid"]]],
		["a trailing space", [["Ingrid "]]],
		["a double quote inside the value", [['say "hi"']]],
		["one column of several rows", [["Ingrid"], [" Rio"]]],
		["a comma beside a boundary space", [[" Ingrid, Rio"]]],
		["several columns", [["Ingrid", " Rio"]]],
		// A one-column value holding a delimiter another format sniffs (#500).
		["a comma", [["Rio, Madrid"]]],
		["a semicolon", [["Rio; Madrid"]]],
		["a pipe", [["Rio | Madrid"]]],
		["several rows holding a comma", [["Rio, Madrid"], ["Ingrid"]]],
	])("keeps %s byte for byte", (_case, matrix) => {
		expect(plainOnly(matrix)).toEqual(matrix);
	});

	// Plain text written by another application keeps its quotes (#425).
	it("still keeps quotes another application wrote", () => {
		expect(readClipboardTable({ text: '"x"' })?.matrix).toEqual([['"x"']]);
	});

	// The writer quotes a one-column value the reader would otherwise split
	// (#500); the reader is unchanged, so text another application wrote is
	// sniffed exactly as before.
	it("still splits delimited text another application wrote", () => {
		expect(readClipboardTable({ text: "Rio, Madrid" })).toMatchObject({
			matrix: [["Rio", " Madrid"]],
			source: "csv",
		});
		expect(readClipboardTable({ text: "Rio; Madrid" })?.matrix).toEqual([
			["Rio", " Madrid"],
		]);
		expect(
			readClipboardTable({ text: "| Rio | Madrid |\n| --- | --- |" }),
		).toMatchObject({ matrix: [["Rio", "Madrid"]], source: "markdown" });
	});

	// What a spreadsheet does with the same text: it reads it as tab-separated
	// values, where a double quote opening a field is a qualifier. Every case,
	// including the two plain text alone cannot spell, a line break inside a
	// value and a value that opens with a quote, stays readable there.
	it.each([
		[["  "]],
		[[" Ingrid"]],
		[['say "hi"']],
		[["Ingrid"], [" Rio"]],
		[["Ingrid\nRio"]],
		[['"Ingrid"']],
		[["Ingrid", " Rio"]],
		[["Ingrid", "Rio\tMadrid"]],
		[["Rio, Madrid"]],
		[["Rio; Madrid"]],
		[["Rio | Madrid"]],
		[["Rio, Madrid"], ["Ingrid"]],
		[["Rio|Madrid"], ["-|-"]],
	])("stays tab-separated values a spreadsheet reads: %j", (...matrix) => {
		const text = selectionClipboardPayload({
			matrix,
			expectedTypes: matrix[0]?.map(() => "text") ?? [],
		}).text;
		expect(
			Papa.parse<string[]>(text, { delimiter: "\t", newline: "\n" }).data,
		).toEqual(matrix);
	});
});
