import { describe, expect, it } from "vitest";
import { documentFromMatrix } from "@/core/document";
import { samplePeopleMatrix } from "@/core/sample-data";
import { csvCodec } from "./csv";
import { jiraCodec } from "./jira";
import { markdownCodec } from "./markdown";
import { recordsCodec } from "./records";
import { tsvCodec } from "./tsv";
import type { TableCodec } from "./types";

// The fields a source view's Tab moves between (#54) come from each format's
// own grammar. These tests read the text under every reported range, so they
// state what a stop is in the format's terms rather than as raw offsets.

function fieldTexts(codec: TableCodec, text: string): string[] {
	const fields = codec.sourceFields?.(text);
	if (!fields) throw new Error(`${codec.id} reports no fields.`);
	return fields.map(({ from, to }) => text.slice(from, to));
}

function fieldStarts(codec: TableCodec, text: string): number[] {
	return (codec.sourceFields?.(text) ?? []).map(({ from }) => from);
}

describe("delimited fields", () => {
	it("reads every field of every row in order, header first", () => {
		expect(fieldTexts(csvCodec, "Name,City\nIngrid,Rio\nPaulo,Madrid")).toEqual(
			["Name", "City", "Ingrid", "Rio", "Paulo", "Madrid"],
		);
	});

	it("never stops at a delimiter or a line break inside a quoted value", () => {
		const text = 'Name,Note\n"Ingrid, Rio","two\nlines"\nPaulo,""';
		expect(fieldTexts(csvCodec, text)).toEqual([
			"Name",
			"Note",
			"Ingrid, Rio",
			"two\nlines",
			"Paulo",
			"",
		]);
	});

	it("starts a quoted field inside its quotes and keeps escaped quotes whole", () => {
		const text = 'Name,Quote\nIngrid,"say ""hi"""';
		expect(fieldTexts(csvCodec, text)).toEqual([
			"Name",
			"Quote",
			"Ingrid",
			'say ""hi""',
		]);
		expect(fieldStarts(csvCodec, text)[3]).toBe(text.indexOf('"say') + 1);
	});

	it("stops at empty fields, including a trailing one", () => {
		const text = "Name,City,Role\nIngrid,,\n";
		expect(fieldTexts(csvCodec, text)).toEqual([
			"Name",
			"City",
			"Role",
			"Ingrid",
			"",
			"",
		]);
		expect(fieldStarts(csvCodec, text).slice(3)).toEqual([15, 22, 23]);
	});

	it("splits on the declared separator only, the one the view parses with", () => {
		// A source view never sniffs its own format (#217), so a semicolon in
		// CSV is data and a comma in TSV is data.
		expect(fieldTexts(csvCodec, "Name;City\nIngrid;Rio")).toEqual([
			"Name;City",
			"Ingrid;Rio",
		]);
		expect(fieldTexts(tsvCodec, "Name\tCity\nIngrid, Rio\tRio")).toEqual([
			"Name",
			"City",
			"Ingrid, Rio",
			"Rio",
		]);
	});

	it("keeps offering stops in a draft with an unclosed quote", () => {
		const text = 'Name,City\nIngrid,"Rio';
		const fields = csvCodec.sourceFields?.(text) ?? [];
		expect(
			fields.slice(0, 3).map(({ from, to }) => text.slice(from, to)),
		).toEqual(["Name", "City", "Ingrid"]);
		for (const field of fields) {
			expect(field.from).toBeGreaterThanOrEqual(0);
			expect(field.to).toBeLessThanOrEqual(text.length);
			expect(field.from).toBeLessThanOrEqual(field.to);
		}
	});

	it("handles carriage-return line endings", () => {
		expect(fieldTexts(csvCodec, "Name,City\r\nIngrid,Rio\r\n")).toEqual([
			"Name",
			"City",
			"Ingrid",
			"Rio",
		]);
	});
});

describe("Markdown fields", () => {
	const table = [
		"| Name   | City |",
		"| ------ | ---- |",
		"| Ingrid | Rio  |",
		"| Pa\\|ulo |      |",
	].join("\n");

	it("stops at each cell's content, skipping padding and the divider", () => {
		expect(fieldTexts(markdownCodec, table)).toEqual([
			"Name",
			"City",
			"Ingrid",
			"Rio",
			"Pa\\|ulo",
			"",
		]);
	});

	it("puts the caret after one space of padding in an empty cell", () => {
		const starts = fieldStarts(markdownCodec, table);
		const lastLine = table.lastIndexOf("\n") + 1;
		const emptyCellPipe = table.indexOf("|", table.indexOf("ulo |") + 3);
		expect(starts.at(-1)).toBe(emptyCellPipe + 2);
		expect(starts.at(-2)).toBe(lastLine + 2);
	});

	it("treats the second line as a row while it is not yet a divider", () => {
		expect(fieldTexts(markdownCodec, "| Name | City |\n| Ingrid |")).toEqual([
			"Name",
			"City",
			"Ingrid",
		]);
	});

	it("reads only the first table block, as the parse does", () => {
		expect(
			fieldTexts(markdownCodec, "| Name |\n| --- |\n| Ingrid |\n\n| Paulo |"),
		).toEqual(["Name", "Ingrid"]);
	});
});

describe("Jira fields", () => {
	it("stops at every cell, mapping the header's doubled pipes back", () => {
		const text = "||Name||City||\n|Ingrid|Rio|\n|Pa\\|ulo| |";
		expect(fieldTexts(jiraCodec, text)).toEqual([
			"Name",
			"City",
			"Ingrid",
			"Rio",
			"Pa\\|ulo",
			" ",
		]);
	});

	it("stops at empty header and body cells", () => {
		const text = "||||City||\n|||";
		expect(fieldTexts(jiraCodec, text)).toEqual(["", "City", "", ""]);
		expect(fieldStarts(jiraCodec, text)).toEqual([2, 4, 12, 13]);
	});
});

describe("Records fields", () => {
	const text = [
		"Name: Ingrid",
		"- City: Rio",
		"- Role:",
		"",
		"Name: Paulo",
		"- City: Madrid",
	].join("\n");

	it("stops at every value and never at a label", () => {
		expect(fieldTexts(recordsCodec, text)).toEqual([
			"Ingrid",
			"Rio",
			"",
			"Paulo",
			"Madrid",
		]);
	});

	it("puts an empty value's stop just after its colon", () => {
		expect(fieldStarts(recordsCodec, text)[2]).toBe(
			text.indexOf("- Role:") + 7,
		);
	});

	it("honours an escaped separator in a label", () => {
		expect(fieldTexts(recordsCodec, "A\\: b: Ingrid\n- City: Rio")).toEqual([
			"Ingrid",
			"Rio",
		]);
	});

	it("offers no stop on a line without a label", () => {
		expect(
			fieldTexts(recordsCodec, "Name: Ingrid\nstray line\n- City: Rio"),
		).toEqual(["Ingrid", "Rio"]);
	});
});

// Every format's own output has one stop per cell it wrote, however awkward the
// values: the fields and the parse read the same grammar, so they cannot
// disagree about how many cells a row holds.
describe("fields of canonical output", () => {
	const matrix = [
		...samplePeopleMatrix(2),
		['Mabel, "Jr"', "Rio | Sul", "two\nlines", ""],
	];
	const document = documentFromMatrix(matrix, { headerRow: true });
	const width = matrix[0]?.length ?? 0;

	it.each([csvCodec, tsvCodec, markdownCodec, jiraCodec])(
		"gives $id one stop per cell, header included",
		(codec) => {
			const text = codec.serialize(document);
			expect(codec.sourceFields?.(text)).toHaveLength(matrix.length * width);
		},
	);

	it("gives Records one stop per value, labels excluded", () => {
		const text = recordsCodec.serialize(document);
		expect(recordsCodec.sourceFields?.(text)).toHaveLength(
			(matrix.length - 1) * width,
		);
	});
});
