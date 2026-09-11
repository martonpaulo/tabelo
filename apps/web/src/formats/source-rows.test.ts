import { describe, expect, it } from "vitest";
import { csvCodec } from "./csv";
import { jiraCodec } from "./jira";
import { markdownCodec } from "./markdown";
import { tsvCodec } from "./tsv";
import type { ParseResult } from "./types";

// Where each semantic row sits in its source (#296), read back as the text it
// covers so every expectation says what a reader would point at.
function rowTexts(text: string, result: ParseResult): string[] | undefined {
	if (!result.ok) throw new Error("expected a successful parse");
	return result.rows?.map((row) => text.slice(row.from, row.to));
}

describe("semantic source rows", () => {
	it("gives a Markdown header its divider, and each body line its own row", () => {
		const text =
			"\n| name | city |\n| --- | --- |\n| Ingrid | Rio |\n| Paulo | Madrid |\n";
		expect(rowTexts(text, markdownCodec.parse(text))).toEqual([
			"| name | city |\n| --- | --- |",
			"| Ingrid | Rio |",
			"| Paulo | Madrid |",
		]);
	});

	it("keeps Markdown rows exact under CRLF line breaks", () => {
		const text = "| name |\r\n| --- |\r\n| Ingrid |";
		expect(rowTexts(text, markdownCodec.parse(text))).toEqual([
			"| name |\r\n| --- |",
			"| Ingrid |",
		]);
	});

	it("maps each Jira line to one row, header included", () => {
		const text = "||name||city||\n|Ingrid|Rio|\n|Paulo|Madrid|";
		expect(rowTexts(text, jiraCodec.parse(text))).toEqual([
			"||name||city||",
			"|Ingrid|Rio|",
			"|Paulo|Madrid|",
		]);
	});

	it.each([
		["LF", "\n"],
		["CRLF", "\r\n"],
		["CR", "\r"],
	])("keeps a CSV row with a quoted %s line break as one row", (_, br) => {
		const text = `name,note${br}Ingrid,"two${br}lines"${br}Paulo,one${br}`;
		expect(rowTexts(text, csvCodec.parse(text))).toEqual([
			"name,note",
			`Ingrid,"two${br}lines"`,
			"Paulo,one",
		]);
	});

	it("maps TSV rows the same way", () => {
		const text = "name\tcity\nIngrid\tRio";
		expect(rowTexts(text, tsvCodec.parse(text))).toEqual([
			"name\tcity",
			"Ingrid\tRio",
		]);
	});

	it("still maps rows when the parse only warns", () => {
		const text = "| name | city |\n| --- | --- |\n| Ingrid |";
		const result = markdownCodec.parse(text);
		expect(result.ok && result.warnings?.length).toBeTruthy();
		expect(rowTexts(text, result)).toHaveLength(2);
	});

	it("maps nothing when the source does not parse", () => {
		for (const [codec, text] of [
			[markdownCodec, "| name |\n| Ingrid |"],
			[csvCodec, 'name\n"unclosed'],
		] as const) {
			const result = codec.parse(text);
			expect(result.ok).toBe(false);
			expect("rows" in result).toBe(false);
		}
	});
});
