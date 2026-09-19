// @vitest-environment happy-dom
// The HTML codec uses the platform's DOMParser rather than a hand-rolled
// parser, so its tests need a DOM. happy-dom is lighter than jsdom and enough
// for parsing a table.

import { describe, expect, it } from "vitest";
import { readCell } from "@/core/cell-value";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import type { InlineMark, InlineText } from "@/core/types";
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

	// Shrunk from the property suite in #185: a cell whose whole value is a
	// bare carriage return came back as a carriage return instead of a newline.
	it("normalizes every line-ending spelling to a single newline", () => {
		const original = [
			["Name", "Note"],
			["Ingrid", "\r"],
			["Paulo", "row-2:\r\n"],
			["Mabel", "line one\nline two"],
			["Felix", "before\r\nbetween\rafter"],
		];
		const document = documentFromMatrix(original, { headerRow: true });

		const reparsed = htmlCodec.parse(htmlCodec.serialize(document));
		expect(reparsed.ok).toBe(true);
		if (!reparsed.ok) return;
		expect(documentToMatrix(reparsed.document)).toEqual([
			["Name", "Note"],
			["Ingrid", "\n"],
			["Paulo", "row-2:\n"],
			["Mabel", "line one\nline two"],
			["Felix", "before\nbetween\nafter"],
		]);
	});

	// A CRLF collapsing to one break is what distinguishes the correct fix from
	// two chained replacements, which would emit two.
	it("keeps consecutive newlines distinct from a collapsed CRLF", () => {
		const original = [["Name"], ["a\n\nb"], ["a\r\n\r\nb"], ["a\r\rb"]];
		const document = documentFromMatrix(original, { headerRow: true });

		const serialized = htmlCodec.serialize(document);
		expect(serialized).toContain("a<br><br>b");
		expect(serialized).not.toContain("<br><br><br>");

		const reparsed = htmlCodec.parse(serialized);
		expect(reparsed.ok).toBe(true);
		if (!reparsed.ok) return;
		expect(documentToMatrix(reparsed.document)).toEqual([
			["Name"],
			["a\n\nb"],
			["a\n\nb"],
			["a\n\nb"],
		]);
	});

	// Headers travel through the same pair of functions as body cells, and the
	// acceptance criterion asks for that to be proven rather than assumed.
	it("normalizes line endings in headers as well as body cells", () => {
		const document = documentFromMatrix([["a\r\nb"], ["c\rd"]], {
			headerRow: true,
		});

		const reparsed = htmlCodec.parse(htmlCodec.serialize(document));
		expect(reparsed.ok).toBe(true);
		if (!reparsed.ok) return;
		expect(documentToMatrix(reparsed.document)).toEqual([["a\nb"], ["c\nd"]]);
	});

	// Reversed by the parser rather than by the normalization: escaping must
	// still win over the <br> substitution.
	it("keeps a literal <br> in the value distinct from a line break", () => {
		const original = [
			["Name", "Note"],
			["Ingrid", "<br>"],
			["Paulo", "\r"],
		];
		const document = documentFromMatrix(original, { headerRow: true });

		const reparsed = htmlCodec.parse(htmlCodec.serialize(document));
		expect(reparsed.ok).toBe(true);
		if (!reparsed.ok) return;
		expect(documentToMatrix(reparsed.document)).toEqual([
			["Name", "Note"],
			["Ingrid", "<br>"],
			["Paulo", "\n"],
		]);
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

// #306. Inline HTML is untrusted input: approved elements become structure,
// unsupported formatting keeps its text with a warning, and content with no
// text to keep refuses the parse.
function firstBodyCell(markup: string) {
	const result = htmlCodec.parse(
		`<table><tr><th>Name</th></tr><tr><td>${markup}</td></tr></table>`,
	);
	if (!result.ok) return { result, value: undefined };
	const [row] = result.document.rows;
	const [column] = result.document.columns;
	return {
		result,
		value: row && column ? readCell(row, column.id) : undefined,
	};
}

const text = (value: string, ...marks: InlineMark[]): InlineText => ({
	kind: "text",
	text: value,
	marks,
});

describe("html inline content", () => {
	it.each([
		["<strong>", "<strong>Ingrid</strong>", ["bold"]],
		["<b>", "<b>Ingrid</b>", ["bold"]],
		["<em>", "<em>Ingrid</em>", ["italic"]],
		["<i>", "<i>Ingrid</i>", ["italic"]],
		["<u>", "<u>Ingrid</u>", ["underline"]],
		["<s>", "<s>Ingrid</s>", ["strikethrough"]],
		["<code>", "<code>Ingrid</code>", ["code"]],
	] as const)("reads %s as its mark", (_tag, markup, marks) => {
		expect(firstBodyCell(markup).value).toEqual({
			kind: "inline",
			nodes: [text("Ingrid", ...marks)],
		});
	});

	it("reads links, email links, and images with their authored URLs", () => {
		expect(
			firstBodyCell(
				'<a href="mailto:ingrid@example.com">Ingrid</a> <img src="https://example.com/rio.png" alt="Rio">',
			).value,
		).toEqual({
			kind: "inline",
			nodes: [
				{
					kind: "link",
					url: "mailto:ingrid@example.com",
					children: [text("Ingrid")],
				},
				text(" "),
				{ kind: "image", url: "https://example.com/rio.png", alt: "Rio" },
			],
		});
	});

	it("keeps the text of unsupported formatting and warns", () => {
		const { result, value } = firstBodyCell("x<sup>2</sup>");
		expect(value).toBe("x2");
		expect(result.ok && result.warnings).toEqual([
			{ code: "html-formatting-unsupported", tag: "sup" },
		]);
	});

	it("keeps a linked image without its link and warns", () => {
		const { result, value } = firstBodyCell(
			'<a href="https://example.com"><img src="https://example.com/a.png" alt="Rio"></a>',
		);
		expect(value).toEqual({
			kind: "inline",
			nodes: [{ kind: "image", url: "https://example.com/a.png", alt: "Rio" }],
		});
		expect(result.ok && result.warnings).toEqual([
			{ code: "html-linked-image-unsupported" },
		]);
	});

	it("refuses an image without alternative text and embedded content", () => {
		expect(
			firstBodyCell('<img src="https://example.com/a.png">').result,
		).toEqual({ ok: false, issues: [{ code: "html-image-alt-required" }] });
		expect(firstBodyCell('<video src="a.mp4"></video>').result).toEqual({
			ok: false,
			issues: [{ code: "html-embedded-content-unsupported", tag: "video" }],
		});
	});

	it("never reads script or style text into a cell", () => {
		expect(
			firstBodyCell("<script>alert(1)</script><style>td{}</style>Paulo").value,
		).toBe("Paulo");
	});

	it("writes each feature as its semantic element", () => {
		const document = documentFromMatrix(
			[
				["Name"],
				[
					{
						kind: "inline",
						nodes: [
							text("Ingrid", "bold", "italic"),
							text(" "),
							{
								kind: "link",
								url: "https://example.com/?a=1&b=2",
								children: [text("site", "underline")],
							},
							text("x", "strikethrough"),
							text("age", "code"),
							{
								kind: "image",
								url: "https://example.com/r.png",
								alt: 'Rio "at" dusk',
							},
						],
					},
				],
			],
			{ headerRow: true },
		);
		expect(htmlCodec.serialize(document)).toContain(
			'<td><strong><em>Ingrid</em></strong> <u><a href="https://example.com/?a=1&amp;b=2">site</a></u><s>x</s><code>age</code><img src="https://example.com/r.png" alt="Rio &quot;at&quot; dusk"></td>',
		);
	});
});
