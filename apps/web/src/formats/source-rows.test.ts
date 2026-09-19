import { describe, expect, it } from "vitest";
import { csvCodec } from "./csv";
import { jiraCodec } from "./jira";
import { markdownCodec } from "./markdown";
import { cellAtPosition } from "./parse";
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

	// The header row is what a source pane pins (#252), so it has to come out
	// whole however the format spells it.
	it.each([
		[
			"an unnamed Markdown header",
			markdownCodec,
			"|  |  |\n| --- | --- |\n| Ingrid | Rio |",
			"|  |  |\n| --- | --- |",
		],
		[
			"an escaped Markdown header",
			markdownCodec,
			"| a \\| b | c<br>d |\n| --- | --- |\n| Ingrid | Rio |",
			"| a \\| b | c<br>d |\n| --- | --- |",
		],
		[
			"an escaped Jira header",
			jiraCodec,
			"||a \\| b||c||\n|Ingrid|Rio|",
			"||a \\| b||c||",
		],
		["an unnamed CSV header", csvCodec, ",\nIngrid,Rio", ","],
		["an unnamed TSV header", tsvCodec, "\t\nIngrid\tRio", "\t"],
		[
			"a quoted multi-line CSV header",
			csvCodec,
			'name,"note\nsecond line"\nIngrid,Rio',
			'name,"note\nsecond line"',
		],
	] as const)("maps %s as the first row", (_, codec, text, header) => {
		expect(rowTexts(text, codec.parse(text))?.[0]).toBe(header);
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

// Where each cell sits, and which cell a caret names (#255), read back as text
// so every expectation says what a reader would point at.
function cellTexts(text: string, result: ParseResult): string[][] {
	if (!result.ok) throw new Error("expected a successful parse");
	return (result.rows ?? []).map((row) =>
		row.cells.map((cell) => text.slice(cell.from, cell.to)),
	);
}

function mappedRows(result: ParseResult) {
	if (!result.ok) throw new Error("expected a successful parse");
	return result.rows ?? [];
}

function positionAt(text: string, marker: string, result: ParseResult) {
	const offset = text.indexOf(marker);
	if (offset === -1) throw new Error(`missing marker ${marker}`);
	return cellAtPosition(mappedRows(result), offset);
}

describe("semantic source cells", () => {
	it("gives each Markdown cell its padding and escapes, header first", () => {
		const text = "| name | a \\| b |\n| --- | --- |\n| Ingrid | Rio |";
		expect(cellTexts(text, markdownCodec.parse(text))).toEqual([
			[" name ", " a \\| b "],
			[" Ingrid ", " Rio "],
		]);
	});

	it("gives a quoted CSV cell its quotes, with a delimiter and a line break inside", () => {
		const text = 'name,note\nIngrid,"a, b\nc"\nPaulo,""""';
		expect(cellTexts(text, csvCodec.parse(text))).toEqual([
			["name", "note"],
			["Ingrid", '"a, b\nc"'],
			["Paulo", '""""'],
		]);
	});

	it("keeps empty CSV and TSV cells apart", () => {
		const csv = ",,\nIngrid,,";
		expect(cellTexts(csv, csvCodec.parse(csv))).toEqual([
			["", "", ""],
			["Ingrid", "", ""],
		]);
		const tsv = "name\tcity\nIngrid\t";
		expect(cellTexts(tsv, tsvCodec.parse(tsv))).toEqual([
			["name", "city"],
			["Ingrid", ""],
		]);
	});

	it("places a Jira header cell in the line as written, doubled pipes and all", () => {
		const text = "||name||a \\| b||\n|Ingrid|Rio|";
		expect(cellTexts(text, jiraCodec.parse(text))).toEqual([
			["name", "a \\| b"],
			["Ingrid", "Rio"],
		]);
	});

	it("names the cell under a caret, the header row first", () => {
		const text =
			"| name | city |\n| --- | --- |\n| Ingrid | Rio |\n| Paulo | Madrid |";
		const result = markdownCodec.parse(text);
		expect(positionAt(text, "city", result)).toEqual({ row: 0, column: 1 });
		expect(positionAt(text, "Ingrid", result)).toEqual({ row: 1, column: 0 });
		expect(positionAt(text, "Madrid", result)).toEqual({ row: 2, column: 1 });
	});

	it("names a Markdown divider's row and no column", () => {
		const text = "| name |\n| --- |\n| Ingrid |";
		expect(positionAt(text, "---", markdownCodec.parse(text))).toEqual({
			row: 0,
			column: null,
		});
	});

	it("gives a caret beside a delimiter the cell on that side", () => {
		const text = "name,city\nIngrid,Rio";
		const rows = mappedRows(csvCodec.parse(text));
		const comma = text.indexOf(",", text.indexOf("Ingrid"));
		expect(cellAtPosition(rows, comma)).toEqual({ row: 1, column: 0 });
		expect(cellAtPosition(rows, comma + 1)).toEqual({ row: 1, column: 1 });
	});

	it("names one row for every line of a quoted multi-line CSV cell", () => {
		const text = 'name,note\nIngrid,"two\nlines"\nPaulo,one';
		const result = csvCodec.parse(text);
		expect(positionAt(text, "lines", result)).toEqual({ row: 1, column: 1 });
		expect(positionAt(text, "Paulo", result)).toEqual({ row: 2, column: 0 });
	});

	it("names nothing on a blank line or past the last row", () => {
		const text = "| name |\n| --- |\n| Ingrid |\n\ntrailing";
		const result = markdownCodec.parse(text);
		const rows = mappedRows(result);
		expect(cellAtPosition(rows, text.indexOf("\n\n") + 1)).toBeNull();
		expect(positionAt(text, "trailing", result)).toBeNull();
		expect(cellAtPosition(rows, text.length + 5)).toBeNull();
	});
});
