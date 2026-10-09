// @vitest-environment happy-dom

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
