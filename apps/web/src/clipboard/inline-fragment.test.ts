// @vitest-environment happy-dom
// A fragment copied out of the rich cell editor and pasted into one (#306).
// The HTML flavour is read by the HTML codec, which needs a DOM.

import { describe, expect, it } from "vitest";
import { cellText } from "@/core/cell-value";
import { normalizeInline } from "@/core/inline-content";
import { samplePerson } from "@/core/sample-data";
import type { InlineContent, InlineNode } from "@/core/types";
import { readClipboardInline, readClipboardTable } from "./parse";
import { inlineClipboardPayload, selectionClipboardPayload } from "./serialize";

const ingrid = samplePerson(0);
const paulo = samplePerson(1);

function content(...nodes: InlineNode[]): InlineContent {
	const normalized = normalizeInline(nodes);
	if (typeof normalized === "string") {
		throw new Error("the fixture must carry structure");
	}
	return normalized;
}

// Leading whitespace, every mark, a link, an image, and a carriage return the
// public flavour cannot spell.
const fragment = content(
	{ kind: "text", text: " ", marks: [] },
	{ kind: "text", text: ingrid.name, marks: ["bold", "italic"] },
	{ kind: "text", text: " ", marks: ["underline", "strikethrough"] },
	{
		kind: "link",
		url: "https://example.com/rio",
		children: [{ kind: "text", text: ingrid.city, marks: [] }],
	},
	{ kind: "image", url: "https://example.com/rio.png", alt: ingrid.city },
	{ kind: "text", text: "\r\n", marks: [] },
	{ kind: "text", text: "code", marks: ["code"] },
);

describe("copying a fragment of one cell", () => {
	it("writes its text, its semantic markup, and its exact structure", () => {
		const flavours = inlineClipboardPayload(fragment);
		expect(flavours.text).toBe(cellText(fragment));
		expect(flavours.html).toContain("<strong><em>");
		expect(flavours.html).toContain('<a href="https://example.com/rio">');
		expect(flavours.html).toContain("<code>code</code>");
		expect(flavours.html).not.toContain("<table");
	});

	it("pastes back into an editor exactly", () => {
		expect(readClipboardInline(inlineClipboardPayload(fragment))).toEqual({
			content: fragment,
			warnings: [],
		});
	});

	it("pastes back onto a grid cell exactly", () => {
		const table = readClipboardTable(inlineClipboardPayload(fragment));
		expect(table?.source).toBe("tabelo");
		expect(table?.matrix).toEqual([[fragment]]);
	});

	it("falls back to the markup when the private payload is not its own", () => {
		const flavours = inlineClipboardPayload(fragment);
		const other = inlineClipboardPayload(
			content({ kind: "text", text: paulo.name, marks: ["bold"] }),
		);
		const payload = /<!--tabelo:[\s\S]*?-->/.exec(other.html)?.[0] ?? "";
		const html = payload + flavours.html.replace(/<!--tabelo:[\s\S]*?-->/, "");
		const read = readClipboardInline({ text: flavours.text, html });
		// The markup cannot spell the carriage return, and says the rest.
		expect(read && cellText(read.content)).toBe(
			cellText(fragment).replace("\r\n", "\n"),
		);
		expect(readClipboardTable({ text: flavours.text, html })?.source).not.toBe(
			"tabelo",
		);
	});
});

describe("pasting into one cell's editor", () => {
	it("reads the marks and links other applications spell", () => {
		const read = readClipboardInline({
			text: `${paulo.name} in ${paulo.city}`,
			html: `<meta charset="utf-8"><b>${paulo.name}</b> in <a href="https://example.com/madrid"><i>${paulo.city}</i></a>`,
		});
		expect(read?.content).toEqual(
			content(
				{ kind: "text", text: paulo.name, marks: ["bold"] },
				{ kind: "text", text: " in ", marks: [] },
				{
					kind: "link",
					url: "https://example.com/madrid",
					children: [{ kind: "text", text: paulo.city, marks: ["italic"] }],
				},
			),
		);
		expect(read?.warnings).toEqual([]);
	});

	it("keeps declined formatting as text and warns", () => {
		const read = readClipboardInline({
			text: "E=mc2",
			html: "<b>E</b>=mc<sup>2</sup>",
		});
		expect(cellText(read?.content ?? "")).toBe("E=mc2");
		expect(read?.warnings).toEqual([
			{ code: "html-formatting-unsupported", tag: "sup" },
		]);
	});

	it("accepts an image the plain flavour spells as nothing", () => {
		const read = readClipboardInline({
			text: "Rio ",
			html: '<b>Rio</b> <img src="https://example.com/rio.png" alt="Rio">',
		});
		expect(read?.content).toEqual(
			content(
				{ kind: "text", text: "Rio", marks: ["bold"] },
				{ kind: "text", text: " ", marks: [] },
				{ kind: "image", url: "https://example.com/rio.png", alt: "Rio" },
			),
		);
	});

	it("pastes plain text when the markup says something else", () => {
		expect(
			readClipboardInline({ text: "a\n\nb", html: "<p>a</p><p>b</p>" }),
		).toBeNull();
	});

	it("pastes plain text for markup it refuses, and for no markup", () => {
		expect(
			readClipboardInline({ text: "Rio", html: '<img src="rio.png">' }),
		).toBeNull();
		expect(readClipboardInline({ text: "**Rio**" })).toBeNull();
	});

	it("inserts one copied cell and leaves more than one to the plain text", () => {
		const bold = content({ kind: "text", text: ingrid.name, marks: ["bold"] });
		expect(
			readClipboardInline(
				selectionClipboardPayload({
					matrix: [[bold]],
					expectedTypes: ["text"],
				}),
			)?.content,
		).toEqual(bold);
		expect(
			readClipboardInline(
				selectionClipboardPayload({
					matrix: [[bold, 34]],
					expectedTypes: ["text", "number"],
				}),
			),
		).toBeNull();
	});

	it("inserts a copied number as its text", () => {
		expect(
			readClipboardInline(
				selectionClipboardPayload({
					matrix: [[34]],
					expectedTypes: ["number"],
				}),
			)?.content,
		).toBe("34");
	});
});
