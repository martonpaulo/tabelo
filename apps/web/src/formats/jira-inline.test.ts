import { describe, expect, it } from "vitest";
import { cellValuesEqual, readCell } from "@/core/cell-value";
import { documentFromMatrix } from "@/core/document";
import { normalizeInline } from "@/core/inline-content";
import type {
	InlineMark,
	InlineNode,
	InlineText,
	TextContent,
} from "@/core/types";
import { jiraCodec } from "./jira";
import { parseJiraCell, writeJiraCell } from "./jira-inline";

const run = (text: string, ...marks: InlineMark[]): InlineText => ({
	kind: "text",
	text,
	marks,
});

function content(...nodes: InlineNode[]): TextContent {
	return normalizeInline(nodes);
}

function expectRoundTrip(value: TextContent) {
	const written = writeJiraCell(value);
	expect(cellValuesEqual(parseJiraCell(written), value), written).toBe(true);
	return written;
}

describe("Jira inline syntax", () => {
	it.each([
		["bold", content(run("Ingrid", "bold")), "*Ingrid*"],
		["italic", content(run("Rio", "italic")), "_Rio_"],
		["underline", content(run("Paulo", "underline")), "+Paulo+"],
		["strikethrough", content(run("Madrid", "strikethrough")), "-Madrid-"],
		["inline code", content(run("age", "code")), "{{age}}"],
		[
			"a link",
			content({
				kind: "link",
				url: "https://example.com/ingrid",
				children: [run("Ingrid")],
			}),
			"[Ingrid|https://example.com/ingrid]",
		],
		[
			"an email link",
			content({
				kind: "link",
				url: "mailto:ingrid@example.com",
				children: [run("Ingrid")],
			}),
			"[Ingrid|mailto:ingrid@example.com]",
		],
		[
			"an image",
			content({
				kind: "image",
				url: "https://example.com/rio.png",
				alt: "Rio at dusk",
			}),
			"!https://example.com/rio.png|alt=Rio at dusk!",
		],
	])("writes and reads %s in the canonical syntax", (_name, value, syntax) => {
		expect(writeJiraCell(value)).toBe(syntax);
		expect(cellValuesEqual(parseJiraCell(syntax), value)).toBe(true);
	});

	it.each([
		"2020-01-01",
		"snake_case_name",
		"a - b - c",
		"-5",
		"x+y+z",
		"*unfinished",
		"[not a link]",
		"Wow!|",
	])("keeps %j literal when read", (text) => {
		expect(typeof parseJiraCell(text)).toBe("string");
	});

	it.each([
		"2020-01-01",
		"-5",
		"a - b",
		"*Ingrid*",
		"-Madrid-",
		"{{age}}",
		"[Ingrid|https://example.com]",
		"!important",
		"Wow!",
		"a|b",
		"back\\slash",
		"line\nbreak",
	])("keeps the plain text %j exactly through a round trip", (text) => {
		expectRoundTrip(text);
	});

	it("writes ordinary dates and negative numbers exactly as they read", () => {
		expect(writeJiraCell("2020-01-01")).toBe("2020-01-01");
		expect(writeJiraCell("-5")).toBe("-5");
	});

	it("keeps a mark inside a word with a character reference beside it", () => {
		expectRoundTrip(content(run("Ri"), run("o", "bold"), run("s")));
		expectRoundTrip(content(run(" Paulo ", "underline"), run("x")));
	});

	it("keeps an authored URL and alternative text exactly", () => {
		for (const url of [
			"https://example.com/<pipe|and>",
			"with space",
			"a]b!c[d",
			"a\\b&c",
		]) {
			expectRoundTrip(
				content({ kind: "link", url, children: [run("Paulo", "italic")] }),
			);
			expectRoundTrip(content({ kind: "image", url, alt: "Madrid! | ok" }));
		}
	});

	it("splits a row around a link and an image, never at their own pipes", () => {
		const link = content({
			kind: "link",
			url: "https://example.com/ingrid",
			children: [run("Ingrid")],
		});
		const image = content({
			kind: "image",
			url: "https://example.com/rio.png",
			alt: "Rio",
		});
		const document = documentFromMatrix(
			[
				[link, "City"],
				["Ingrid", image],
			],
			{ headerRow: true },
		);
		const text = jiraCodec.serialize(document);
		const parsed = jiraCodec.parse(text);
		if (!parsed.ok) throw new Error(text);
		expect(parsed.document.columns).toHaveLength(2);
		expect(
			cellValuesEqual(parsed.document.columns[0]?.header ?? "", link),
		).toBe(true);
		const [row] = parsed.document.rows;
		const column = parsed.document.columns[1];
		if (!row || !column) throw new Error("missing cell");
		expect(cellValuesEqual(readCell(row, column.id), image)).toBe(true);
	});
});
