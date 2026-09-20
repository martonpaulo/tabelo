// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { readClipboardTable } from "./parse";

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
