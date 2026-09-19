import { json } from "@codemirror/lang-json";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { documentFromMatrix } from "@/core/document";
import { samplePerson } from "@/core/sample-data";
import { csvCodec } from "@/formats/csv";
import { htmlCodec } from "@/formats/html";
import { jiraCodec } from "@/formats/jira";
import { jsonCodec } from "@/formats/json";
import { recordsCodec } from "@/formats/records";
import { tsvCodec } from "@/formats/tsv";
import {
	type EmptyCell,
	type EmptyValueSyntax,
	emptyCells,
	emptyValueSyntax,
	jiraEmptyOffsets,
	recordsEmptyOffset,
	scanDelimitedLine,
	snapToEmptyCell,
} from "./empty-values";
import { htmlLanguage } from "./html-language";

// The markers only ever describe what a codec would read, so every case here
// states the fields the format's own parser finds and then asserts which of
// them are invisible in the text.

describe("emptyValueSyntax", () => {
	it("reads the separator a delimited view's codec declares", () => {
		expect(emptyValueSyntax("delimited", csvCodec.fieldSeparator)).toEqual({
			kind: "delimited",
			separator: ",",
		});
		expect(emptyValueSyntax("delimited", tsvCodec.fieldSeparator)).toEqual({
			kind: "delimited",
			separator: "\t",
		});
	});

	it("marks every source syntax, and nothing in plain text", () => {
		expect(emptyValueSyntax("json", jsonCodec.fieldSeparator)).toEqual({
			kind: "json",
		});
		expect(emptyValueSyntax("records", undefined)).toEqual({
			kind: "records",
		});
		expect(emptyValueSyntax("html", undefined)).toEqual({ kind: "html" });
		expect(emptyValueSyntax("plain", undefined)).toBeNull();
	});

	it("marks the pipe syntaxes without needing a separator", () => {
		expect(emptyValueSyntax("markdown", undefined)).toEqual({
			kind: "markdown",
		});
		expect(emptyValueSyntax("jira", jiraCodec.fieldSeparator)).toEqual({
			kind: "jira",
		});
	});
});

describe("scanDelimitedLine", () => {
	const scan = (line: string, separator = ",", inQuotes = false) =>
		scanDelimitedLine(line, separator, inQuotes);

	it("marks an empty field between two separators", () => {
		expect(scan("a,,b").offsets).toEqual([2]);
	});

	it("marks empty fields at both ends of a row", () => {
		expect(scan(",q,").offsets).toEqual([0, 3]);
	});

	it("marks every empty field in a run", () => {
		expect(scan("a,,,b").offsets).toEqual([2, 3]);
	});

	it("leaves a quoted empty value alone, because it is already visible", () => {
		expect(scan('a,"",b').offsets).toEqual([]);
	});

	it("does not read a separator inside a quoted value as structure", () => {
		expect(scan('"a,,b",c').offsets).toEqual([]);
	});

	it("treats a doubled quote as an escaped quote rather than a boundary", () => {
		expect(scan('"a""b",,c').offsets).toEqual([7]);
	});

	it("carries an unterminated quoted value into the next line", () => {
		const opening = scan('a,"line one');
		expect(opening.endsInQuotes).toBe(true);
		expect(scan('line two",,b', ",", true).offsets).toEqual([10]);
	});

	it("says nothing about a line with no structure at all", () => {
		expect(scan("").offsets).toEqual([]);
		expect(scan("a plain sentence").offsets).toEqual([]);
	});

	it("uses the separator it is given rather than any comma it finds", () => {
		expect(scan("a,b\t\tc", "\t").offsets).toEqual([4]);
		expect(scan("a\tb", ",").offsets).toEqual([]);
	});

	it("agrees with the delimited codec about how many fields a row has", () => {
		const line = ",a,,b,";
		const parsed = csvCodec.parseMatrix(`h1,h2,h3,h4,h5\n${line}`);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		const row = parsed.table.matrix[1] ?? [];
		const empty = row.filter((cell) => cell === "").length;
		expect(scan(line).offsets).toHaveLength(empty);
	});
});

describe("jiraEmptyOffsets", () => {
	it("marks an empty cell in a body row", () => {
		expect(jiraEmptyOffsets("|x||z|")).toEqual([3]);
	});

	it("reads a header line's doubled pipes as one delimiter", () => {
		expect(jiraEmptyOffsets("||a||b||")).toEqual([]);
		expect(jiraEmptyOffsets("||a|||b||")).toEqual([5]);
	});

	it("marks a header of only empty cells", () => {
		expect(jiraEmptyOffsets("||||")).toEqual([2]);
	});

	it("does not read an escaped pipe as a delimiter", () => {
		expect(jiraEmptyOffsets("|a\\|b|c|")).toEqual([]);
	});

	it("says nothing about a line with no pipes", () => {
		expect(jiraEmptyOffsets("")).toEqual([]);
		expect(jiraEmptyOffsets("a plain sentence")).toEqual([]);
	});

	it("agrees with the Jira codec about how many cells a row has", () => {
		const source = "||a|||b||\n|x||z|";
		const parsed = jiraCodec.parseMatrix(source);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		const lines = source.split("\n");
		for (const [index, row] of parsed.table.matrix.entries()) {
			const empty = row.filter((cell) => cell === "").length;
			expect(jiraEmptyOffsets(lines[index] ?? "")).toHaveLength(empty);
		}
	});
});

describe("emptyCells", () => {
	const cellsOf = (text: string, separator: string) =>
		emptyCells(
			EditorState.create({ doc: text }),
			{ kind: "delimited", separator },
			0,
			text.length,
		);

	it("spans an empty delimited field from one separator to the next", () => {
		expect(cellsOf("a,,b", ",")).toEqual([
			{
				before: 1,
				cellStart: 2,
				valueStart: 2,
				valueEnd: 2,
				cellEnd: 2,
				after: 3,
			},
		]);
	});

	it("stops a trailing empty field at the end of its line", () => {
		expect(cellsOf("a,\nb,c", ",")).toEqual([
			{
				before: 1,
				cellStart: 2,
				valueStart: 2,
				valueEnd: 2,
				cellEnd: 2,
				after: 2,
			},
		]);
	});
});

describe("recordsEmptyOffset", () => {
	it("marks a bullet whose value is empty, after its colon", () => {
		expect(recordsEmptyOffset("- Price:")).toBe(8);
	});

	it("marks a bullet or title that ends in a separator and nothing else", () => {
		expect(recordsEmptyOffset("- Price: ")).toBe(9);
		expect(recordsEmptyOffset("Name: ")).toBe(6);
	});

	it("leaves a line with a value alone, even one that holds `: `", () => {
		expect(recordsEmptyOffset("- Price: 20")).toBeNull();
		expect(recordsEmptyOffset("- Price: Sale: 20")).toBeNull();
		expect(recordsEmptyOffset("- Note:  ")).toBeNull();
	});

	it("does not read an escaped `\\: ` in a header as the boundary", () => {
		expect(recordsEmptyOffset("- Ratio\\: a: ")).toBe(13);
		expect(recordsEmptyOffset("- Ratio\\: a")).toBeNull();
	});

	it("leaves the blank line alone, because it also separates records", () => {
		expect(recordsEmptyOffset("")).toBeNull();
		expect(recordsEmptyOffset("   ")).toBeNull();
	});

	it("says nothing about a line with no separator at all", () => {
		expect(recordsEmptyOffset(samplePerson(0).name)).toBeNull();
	});

	it("agrees with the Records codec about which values are empty", () => {
		const first = samplePerson(0);
		const source = [
			`name: ${first.name}`,
			"- city:",
			`- role: ${first.role}`,
			"",
			"name: ",
			`- city: ${samplePerson(1).city}`,
			"- role: ",
		].join("\n");
		const parsed = recordsCodec.parseMatrix(source);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		const empty = parsed.table.matrix
			.slice(1)
			.flat()
			.filter((cell) => cell === "").length;
		const marked = source
			.split("\n")
			.filter((line) => recordsEmptyOffset(line) !== null).length;
		expect(marked).toBe(empty);
	});
});

// The offsets where the placeholder is drawn, for a whole document in the
// language the view parses it with.
function markedOffsets(
	text: string,
	syntax: EmptyValueSyntax,
	language: Extension = [],
): number[] {
	const state = EditorState.create({ doc: text, extensions: language });
	ensureSyntaxTree(state, state.doc.length, 5000);
	return emptyCells(state, syntax, 0, text.length).map(
		(cell) => cell.valueStart,
	);
}

describe("JSON empty values", () => {
	const mark = (text: string) => markedOffsets(text, { kind: "json" }, json());

	it("marks an empty string value between its quotes", () => {
		const text = '[{"name":"","city":"Rio"}]';
		expect(mark(text)).toEqual([text.indexOf('""') + 1]);
	});

	it("never marks a typed literal next to an empty string", () => {
		const text = '[{"a":null,"b":0,"c":false,"d":""}]';
		expect(mark(text)).toEqual([text.indexOf('""') + 1]);
	});

	it("never marks an empty property name", () => {
		expect(mark('[{"":"x"}]')).toEqual([]);
	});

	it("leaves a string holding a space or an escaped quote alone", () => {
		expect(mark('[{"a":" ","b":"\\""}]')).toEqual([]);
	});
});

describe("HTML empty values", () => {
	const mark = (text: string) =>
		markedOffsets(text, { kind: "html" }, htmlLanguage);

	it("marks an empty data cell and an empty header cell", () => {
		const text = "<tr><th></th><td></td></tr>";
		expect(mark(text)).toEqual([8, 17]);
	});

	it("marks adjacent empty cells whose tags share a `></` token", () => {
		const text = "<td></td><td></td>";
		expect(mark(text)).toEqual([4, 13]);
	});

	it("leaves a self-closed cell and a cell holding a space alone", () => {
		expect(mark("<td/><td> </td><td>x</td>")).toEqual([]);
	});

	it("reads a cell with attributes by where its tag ends", () => {
		const text = '<td style="text-align: right"></td>';
		expect(mark(text)).toEqual([text.indexOf("></") + 1]);
	});
});

// What each codec writes for a table with empty values, typed literals beside
// them, and one filled cell, marked the way its view marks it. The count is
// the number of empty strings in the table: the typed `null`, `0`, and `false`
// must not add to it.
describe("the placeholder over what each codec writes", () => {
	const first = samplePerson(0);
	const second = samplePerson(1);
	const document = documentFromMatrix(
		[
			["name", "city", "age", "active"],
			[first.name, "", null, false],
			["", second.city, 0, ""],
		],
		{ headerRow: true },
	);

	it("marks JSON's empty strings and none of its typed literals", () => {
		const text = jsonCodec.serialize(document);
		expect(markedOffsets(text, { kind: "json" }, json())).toHaveLength(3);
	});

	it("marks HTML's empty cells", () => {
		const text = htmlCodec.serialize(document);
		// `null` projects to empty text, and HTML cannot tell it from `""`.
		expect(markedOffsets(text, { kind: "html" }, htmlLanguage)).toHaveLength(4);
	});

	it("marks Records' empty values, and nothing where the line is blank", () => {
		const named = recordsCodec.serialize(document);
		expect(markedOffsets(named, { kind: "records" })).toHaveLength(4);
		// With the column name omitted, the empty title is a blank line.
		const unnamed = recordsCodec.serialize(document, {
			includeFirstColumnName: false,
		});
		expect(markedOffsets(unnamed, { kind: "records" })).toHaveLength(3);
	});
});

// `|  |  |`: two empty Markdown cells, each a space of padding on either side of
// where the value would start.
const twoEmptyCells: readonly EmptyCell[] = [
	{ before: 0, cellStart: 1, valueStart: 2, valueEnd: 2, cellEnd: 3, after: 4 },
	{ before: 3, cellStart: 4, valueStart: 5, valueEnd: 5, cellEnd: 6, after: 7 },
];

describe("snapToEmptyCell", () => {
	it("lands a caret arriving from the left on the value start", () => {
		expect(snapToEmptyCell(twoEmptyCells, 0, 1)).toBe(2);
	});

	it("lands a click anywhere in the field on the value start", () => {
		for (const offset of [1, 2, 3]) {
			expect(snapToEmptyCell(twoEmptyCells, 99, offset)).toBe(2);
		}
	});

	it("steps from one empty field's stop straight to the next one's", () => {
		expect(snapToEmptyCell(twoEmptyCells, 2, 3)).toBe(5);
		expect(snapToEmptyCell(twoEmptyCells, 5, 4)).toBe(2);
	});

	it("steps past the delimiter when the neighbouring field has content", () => {
		expect(snapToEmptyCell(twoEmptyCells, 5, 6)).toBe(7);
		expect(snapToEmptyCell(twoEmptyCells, 2, 1)).toBe(0);
	});

	it("leaves a caret outside every empty field alone", () => {
		expect(snapToEmptyCell(twoEmptyCells, 0, 7)).toBeNull();
		expect(snapToEmptyCell([], 0, 1)).toBeNull();
	});
});
