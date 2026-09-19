// @vitest-environment happy-dom
// The HTML codec reads with the platform's DOMParser, so this file needs a DOM.

import { describe, expect, it } from "vitest";
import { documentFromMatrix } from "@/core/document";
import { samplePerson } from "@/core/sample-data";
import { htmlCodec } from "./html";
import { jsonCodec } from "./json";
import { cellAtPosition } from "./parse";
import { recordsCodec } from "./records";
import type { ParseResult, TableCodec } from "./types";

// Where each row and cell of a JSON, Records, or HTML source sits (#402). These
// formats spell a row as a block of lines rather than one line of cells, so
// each maps its rows from its own parse, header first as every mapping does:
// JSON and Records spell their column names as keys inside every row, so their
// header row has no text of its own and names nothing. Read back as the text
// each range covers, so every expectation says what a reader would point at.

const ingrid = samplePerson(0);
const paulo = samplePerson(1);

function mapped(result: ParseResult) {
	if (!result.ok) throw new Error("expected a successful parse");
	if (!result.rows) throw new Error("expected the rows to be mapped");
	return result.rows;
}

// Null for a header with no text of its own.
function rowTexts(text: string, result: ParseResult): (string | null)[] {
	return mapped(result).map((row) =>
		row.lines === "none" ? null : text.slice(row.from, row.to),
	);
}

function cellTexts(text: string, result: ParseResult): string[][] {
	return mapped(result).map((row) =>
		row.cells.map((cell) => text.slice(cell.from, cell.to)),
	);
}

// The position `skip` characters into the first occurrence of `marker`.
function positionAt(
	text: string,
	marker: string,
	result: ParseResult,
	skip = 0,
) {
	const index = text.indexOf(marker);
	if (index === -1) throw new Error(`missing marker ${marker}`);
	return cellAtPosition(mapped(result), index + skip);
}

// The codec's own text of a small table of the sample people.
function serialized(codec: TableCodec): string {
	return codec.serialize(
		documentFromMatrix(
			[
				["Name", "City"],
				[ingrid.name, ingrid.city],
				[paulo.name, paulo.city],
			],
			{ headerRow: true },
		),
	);
}

describe("JSON source rows", () => {
	it("maps each record of its own output as a row, under a header with no text", () => {
		const text = serialized(jsonCodec);
		const result = jsonCodec.parse(text);
		expect(rowTexts(text, result)).toEqual([
			null,
			`{"Name": "${ingrid.name}", "City": "${ingrid.city}"}`,
			`{"Name": "${paulo.name}", "City": "${paulo.city}"}`,
		]);
		expect(cellTexts(text, result)).toEqual([
			[],
			[`"${ingrid.name}"`, `"${ingrid.city}"`],
			[`"${paulo.name}"`, `"${paulo.city}"`],
		]);
		expect(
			mapped(result)
				.slice(1)
				.every((row) => row.lines === "all"),
		).toBe(true);
	});

	it("maps a record the user spread over many lines, wherever its keys sit", () => {
		const text = [
			"[",
			"  {",
			`    "Name" : "${ingrid.name}",`,
			`    "City":"${ingrid.city}"`,
			"  },",
			`  { "City": "${paulo.city}",`,
			`    "Name": "${paulo.name}" }`,
			"]",
		].join("\n");
		const result = jsonCodec.parse(text);
		expect(rowTexts(text, result)).toEqual([
			null,
			text.slice(text.indexOf("{"), text.indexOf("}") + 1),
			text.slice(text.lastIndexOf("{"), text.lastIndexOf("}") + 1),
		]);
		// Columns follow the keys, not the order the text writes them in.
		expect(cellTexts(text, result)).toEqual([
			[],
			[`"${ingrid.name}"`, `"${ingrid.city}"`],
			[`"${paulo.name}"`, `"${paulo.city}"`],
		]);
		expect(positionAt(text, paulo.city, result)).toEqual({
			row: 2,
			column: 1,
		});
	});

	it("keeps a value's whole spelling, escapes, numbers, and literals included", () => {
		const text = `[{"Name": "a \\"}\\" b", "Age": ${ingrid.age}, "Active": true, "Note": null}]`;
		expect(cellTexts(text, jsonCodec.parse(text))[1]).toEqual([
			'"a \\"}\\" b"',
			String(ingrid.age),
			"true",
			"null",
		]);
	});

	it("maps a record's cells up to the first column it does not spell", () => {
		const text = `[{"Name": "${ingrid.name}", "City": "${ingrid.city}"}, {"City": "${paulo.city}"}]`;
		const result = jsonCodec.parse(text);
		expect(cellTexts(text, result)[2]).toEqual([]);
		// The value stays in its row, and names no column rather than a wrong one.
		expect(positionAt(text, paulo.city, result)).toEqual({
			row: 2,
			column: null,
		});
	});

	it("maps a repeated key to its last value, as the parse keeps it", () => {
		const text = `[{"Name": "${ingrid.name}", "Name": "${paulo.name}"}]`;
		expect(cellTexts(text, jsonCodec.parse(text))[1]).toEqual([
			`"${paulo.name}"`,
		]);
	});

	it("names nothing outside a record, and never the header", () => {
		const text = serialized(jsonCodec);
		const result = jsonCodec.parse(text);
		const rows = mapped(result);
		expect(cellAtPosition(rows, 0)).toBeNull();
		expect(cellAtPosition(rows, text.length)).toBeNull();
		// A key is the record's but no column's.
		expect(positionAt(text, '"City"', result, 1)).toEqual({
			row: 1,
			column: null,
		});
	});

	it("maps nothing when the source does not parse", () => {
		const result = jsonCodec.parse(`[{"Name": "${ingrid.name}"`);
		expect(result.ok).toBe(false);
		expect("rows" in result).toBe(false);
	});
});

describe("Records source rows", () => {
	it("maps each record as its title line through its last bullet", () => {
		const text = serialized(recordsCodec);
		const result = recordsCodec.parse(text);
		expect(rowTexts(text, result)).toEqual([
			null,
			`Name: ${ingrid.name}\n- City: ${ingrid.city}`,
			`Name: ${paulo.name}\n- City: ${paulo.city}`,
		]);
		expect(cellTexts(text, result)).toEqual([
			[],
			[ingrid.name, ingrid.city],
			[paulo.name, paulo.city],
		]);
	});

	it("follows the labels, not the line order, and stops at a missing one", () => {
		const text = [
			`Name: ${ingrid.name}`,
			`- City: ${ingrid.city}`,
			`- Role: ${ingrid.role}`,
			"",
			"",
			`Name: ${paulo.name}`,
			`- Role: ${paulo.role}`,
			`- City: ${paulo.city}`,
			"",
			`Name: ${samplePerson(2).name}`,
			`- Role: ${samplePerson(2).role}`,
		].join("\n");
		const result = recordsCodec.parse(text);
		expect(cellTexts(text, result)).toEqual([
			[],
			[ingrid.name, ingrid.city, ingrid.role],
			[paulo.name, paulo.city, paulo.role],
			[samplePerson(2).name],
		]);
		const rows = mapped(result);
		// The blank lines between records name nothing.
		expect(cellAtPosition(rows, text.indexOf("\n\n") + 1)).toBeNull();
	});

	it("keeps an escaped value's spelling and an empty value's place", () => {
		const text = `Name: ${ingrid.name}\n- Note: \\- a\\nb\n- City:`;
		const result = recordsCodec.parse(text);
		const cells = mapped(result)[1]?.cells ?? [];
		expect(cells.map((cell) => text.slice(cell.from, cell.to))).toEqual([
			ingrid.name,
			"\\- a\\nb",
			"",
		]);
		expect(cells[2]?.from).toBe(text.length);
	});

	it("maps nothing when the source does not parse", () => {
		const result = recordsCodec.parse(`Name: ${ingrid.name}\nnot a bullet`);
		expect(result.ok).toBe(false);
		expect("rows" in result).toBe(false);
	});
});

describe("HTML source rows", () => {
	it("maps each <tr> of its own output, header first, with its cells' content", () => {
		const text = serialized(htmlCodec);
		const result = htmlCodec.parse(text);
		const rows = rowTexts(text, result);
		expect(rows).toHaveLength(3);
		expect(rows[0]).toMatch(
			/^<tr>\n\s+<th>Name<\/th>\n\s+<th>City<\/th>\n\s+<\/tr>$/,
		);
		expect(rows[2]).toContain(`<td>${paulo.city}</td>`);
		expect(cellTexts(text, result)).toEqual([
			["Name", "City"],
			[ingrid.name, ingrid.city],
			[paulo.name, paulo.city],
		]);
		// The table's own tags name nothing.
		expect(positionAt(text, "<tbody>", result)).toBeNull();
		expect(positionAt(text, "<table>", result)).toBeNull();
	});

	it("reads through attributes, case, comments, and whitespace", () => {
		const text = [
			'<TABLE class="people">',
			"  <!-- <tr><td>not a row</td></tr> -->",
			'  <tr data-note="a > b">',
			'    <TH style="text-align: right">Name</TH>',
			"    <th>City</th>",
			"  </tr>",
			`  <tr><td>${ingrid.name}</td>`,
			`      <td title='x'>${ingrid.city}</td></TR>`,
			"</TABLE>",
		].join("\n");
		const result = htmlCodec.parse(text);
		expect(cellTexts(text, result)).toEqual([
			["Name", "City"],
			[ingrid.name, ingrid.city],
		]);
		expect(rowTexts(text, result)[1]).toBe(
			`<tr><td>${ingrid.name}</td>\n      <td title='x'>${ingrid.city}</td></TR>`,
		);
	});

	it("gives a first row of data cells a header with no text", () => {
		const text = `<table><tr><td>${ingrid.name}</td></tr><tr><td>${paulo.name}</td></tr></table>`;
		const result = htmlCodec.parse(text);
		expect(rowTexts(text, result)).toEqual([
			null,
			`<tr><td>${ingrid.name}</td></tr>`,
			`<tr><td>${paulo.name}</td></tr>`,
		]);
	});

	it("ends a row the markup leaves open at its last tag", () => {
		const text = `<table><tr><th>Name</th>\n<tr><td>${ingrid.name}</td>\n</table>`;
		expect(rowTexts(text, htmlCodec.parse(text))).toEqual([
			"<tr><th>Name</th>",
			`<tr><td>${ingrid.name}</td>`,
		]);
	});

	it("maps nothing where the parser has to repair the markup", () => {
		for (const text of [
			// A cell the parser closes on its own.
			`<table><tr><th>Name</th></tr><tr><td>${ingrid.name}<td>${paulo.name}</td></tr></table>`,
			// A cell outside any row.
			`<table><tr><th>Name</th></tr><td>${ingrid.name}</td></table>`,
			// A table inside the table.
			"<table><tr><th>Name</th></tr><tr><td><table><tr><td>x</td></tr></table></td></tr></table>",
		]) {
			const result = htmlCodec.parse(text);
			expect(result.ok).toBe(true);
			expect(result.ok && result.rows).toBeUndefined();
		}
	});
});
