import { describe, expect, it } from "vitest";
import { cellValuesEqual } from "@/core/cell-value";
import { normalizeInline } from "@/core/inline-content";
import type {
	InlineMark,
	InlineNode,
	InlineText,
	TextContent,
} from "@/core/types";
import { parseMarkdownCell, writeMarkdownCell } from "./markdown-inline";

const run = (text: string, ...marks: InlineMark[]): InlineText => ({
	kind: "text",
	text,
	marks,
});

function content(...nodes: InlineNode[]): TextContent {
	return normalizeInline(nodes);
}

function expectRoundTrip(value: TextContent) {
	const written = writeMarkdownCell(value);
	const parsed = parseMarkdownCell(written);
	expect(cellValuesEqual(parsed, value), `${written} read back`).toBe(true);
	return written;
}

describe("Markdown inline syntax", () => {
	it.each([
		["bold", content(run("Ingrid", "bold")), "**Ingrid**"],
		["italic", content(run("Rio", "italic")), "_Rio_"],
		["underline", content(run("Paulo", "underline")), "<u>Paulo</u>"],
		["strikethrough", content(run("Madrid", "strikethrough")), "~~Madrid~~"],
		["inline code", content(run("age", "code")), "`age`"],
		[
			"a link",
			content({
				kind: "link",
				url: "https://example.com/ingrid",
				children: [run("Ingrid")],
			}),
			"[Ingrid](https://example.com/ingrid)",
		],
		[
			"an email link",
			content({
				kind: "link",
				url: "mailto:ingrid@example.com",
				children: [run("Ingrid")],
			}),
			"[Ingrid](mailto:ingrid@example.com)",
		],
		[
			"an image",
			content({
				kind: "image",
				url: "https://example.com/rio.png",
				alt: "Rio at dusk",
			}),
			"![Rio at dusk](https://example.com/rio.png)",
		],
	])("writes and reads %s in the canonical syntax", (_name, value, syntax) => {
		expect(writeMarkdownCell(value)).toBe(syntax);
		expect(cellValuesEqual(parseMarkdownCell(syntax), value)).toBe(true);
	});

	it("nests marks and keeps a mark open across a link that shares it", () => {
		const value = content(
			run("Ingrid ", "bold"),
			{
				kind: "link",
				url: "https://example.com",
				children: [run("in Rio", "bold", "italic")],
			},
			run(" today", "bold"),
		);
		expect(expectRoundTrip(value)).toBe(
			"**Ingrid _[in Rio](https://example.com)_ today**",
		);
	});

	it.each([
		"snake_case_name",
		"2 * 3 * 4",
		"a*b",
		"~approximately~",
		"**unfinished",
		"[not a link]",
		"[a](has space)",
		"![](https://example.com/empty-alt.png)",
		"<U>upper</U>",
	])("keeps %j literal when read", (text) => {
		const parsed = parseMarkdownCell(text);
		expect(typeof parsed).toBe("string");
	});

	it("reads the backslash escapes it writes as the characters they protect", () => {
		expect(parseMarkdownCell("\\*\\*Ingrid\\*\\*")).toBe("**Ingrid**");
		expect(parseMarkdownCell("\\_Rio\\_")).toBe("_Rio_");
		expect(parseMarkdownCell("\\[a](b)")).toBe("[a](b)");
	});

	it.each([
		"**Ingrid**",
		"_Rio_",
		"snake_case",
		"a_",
		"<u>x</u>",
		"~~x~~",
		"`code`",
		"[Ingrid](https://example.com)",
		"![Rio](https://example.com/rio.png)",
		"2*3",
		"a**b",
		"trailing\\",
		" spaced ",
		"line\nbreak",
		"<br>",
	])("keeps the plain text %j exactly through a round trip", (text) => {
		expectRoundTrip(text);
	});

	it("keeps italic inside a word with a character reference beside it", () => {
		const value = content(run("Ri"), run("o", "italic"), run("s"));
		const written = expectRoundTrip(value);
		expect(written).toContain("_o_");
	});

	it("keeps whitespace at the inner edge of a delimited mark", () => {
		expectRoundTrip(content(run(" Paulo ", "bold"), run("x")));
		expectRoundTrip(content(run("a"), run(" b ", "strikethrough")));
	});

	it("keeps code that holds a backtick, a pipe, and markers", () => {
		expectRoundTrip(content(run("a`b|*c*_d_", "code")));
	});

	it("keeps an authored URL exactly, whatever it holds", () => {
		for (const url of [
			"https://example.com/(paren)",
			"https://example.com/<pipe|and>",
			"relative path with spaces",
			"javascript:alert(1)",
			"a\\b&c",
		]) {
			expectRoundTrip(content({ kind: "link", url, children: [run("Paulo")] }));
			expectRoundTrip(content({ kind: "image", url, alt: "Madrid ]" }));
		}
	});

	it("reads balanced parentheses in a hand-written destination", () => {
		expect(
			parseMarkdownCell("[Rio](https://example.com/wiki/Rio_(city))"),
		).toEqual({
			kind: "inline",
			nodes: [
				{
					kind: "link",
					url: "https://example.com/wiki/Rio_(city)",
					children: [{ kind: "text", text: "Rio", marks: [] }],
				},
			],
		});
	});

	it("drops a mark written around code, since code carries no other mark", () => {
		expect(parseMarkdownCell("**`age`**")).toEqual({
			kind: "inline",
			nodes: [{ kind: "text", text: "age", marks: ["code"] }],
		});
	});
});
