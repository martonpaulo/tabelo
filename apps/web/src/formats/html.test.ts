// @vitest-environment happy-dom
// The HTML codec uses the platform's DOMParser rather than a hand-rolled
// parser, so its tests need a DOM. happy-dom is lighter than jsdom and enough
// for parsing a table.

import { describe, expect, it } from "vitest";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { htmlCodec } from "./html";

describe("html parsing", () => {
	it("reads a table with a header row", () => {
		const result = htmlCodec.parse(
			"<table><thead><tr><th>Name</th><th>Role</th></tr></thead><tbody><tr><td>Ingrid</td><td>Designer</td></tr></tbody></table>",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(documentToMatrix(result.document)).toEqual([
			["Name", "Role"],
			["Ingrid", "Designer"],
		]);
	});

	it("reads alignment from inline styles", () => {
		const result = htmlCodec.parse(
			'<table><tr><th style="text-align: right">N</th><th style="text-align: center">M</th></tr><tr><td>1</td><td>2</td></tr></table>',
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.document.columns.map((column) => column.align)).toEqual([
			"right",
			"center",
		]);
	});

	it("reads alignment from the legacy align attribute", () => {
		const result = htmlCodec.parse(
			'<table><tr><th align="left">N</th></tr><tr><td>1</td></tr></table>',
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.document.columns[0]?.align).toBe("left");
	});

	it("turns <br> into a real line break", () => {
		const result = htmlCodec.parse(
			"<table><tr><th>N</th></tr><tr><td>one<br>two</td></tr></table>",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(documentToMatrix(result.document)[1]?.[0]).toBe("one\ntwo");
	});

	it("pads a ragged row", () => {
		const result = htmlCodec.parse(
			"<table><tr><th>A</th><th>B</th></tr><tr><td>1</td></tr></table>",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(documentToMatrix(result.document)[1]).toEqual(["1", ""]);
	});

	it("refuses markup with no table in it yet", () => {
		expect(htmlCodec.parse("<div>not a table</div>").ok).toBe(false);
	});
});

describe("html serialization", () => {
	it("escapes markup characters in cell values", () => {
		const document = documentFromMatrix(
			[["A"], ["<script>alert('x')</script>"]],
			{ headerRow: true },
		);
		const out = htmlCodec.serialize(document);
		expect(out).not.toContain("<script>");
		expect(out).toContain("&lt;script&gt;");
	});

	it("emits alignment as an inline style", () => {
		const document = documentFromMatrix([["A"], ["1"]], { headerRow: true });
		const aligned = {
			...document,
			columns: document.columns.map((column) => ({
				...column,
				align: "right" as const,
			})),
		};
		expect(htmlCodec.serialize(aligned)).toContain('style="text-align: right"');
	});

	it("survives a full round trip including line breaks and entities", () => {
		const original = [
			["Name", "Note"],
			["Ingrid", "line one\nline two"],
			["Paulo", "5 < 6 & 7 > 2"],
		];
		const document = documentFromMatrix(original, { headerRow: true });

		const reparsed = htmlCodec.parse(htmlCodec.serialize(document));
		expect(reparsed.ok).toBe(true);
		if (!reparsed.ok) return;
		expect(documentToMatrix(reparsed.document)).toEqual(original);
	});

	it("preserves boundary whitespace and non-breaking spaces byte-exact", () => {
		const original = [
			["Name", "Note"],
			["Ingrid", "  spaced  "],
			["Paulo", "\u00a0kept\u00a0"],
		];
		const document = documentFromMatrix(original, { headerRow: true });
		const reparsed = htmlCodec.parse(htmlCodec.serialize(document));

		expect(reparsed.ok).toBe(true);
		if (!reparsed.ok) return;
		expect(documentToMatrix(reparsed.document)).toEqual(original);
	});
});
