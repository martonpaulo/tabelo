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
import { markdownCodec } from "@/formats/markdown";
import { recordsCodec } from "@/formats/records";
import { tsvCodec } from "@/formats/tsv";
import type { EmptySourceField, TableCodec } from "@/formats/types";
import {
	codecEmptyCells,
	type EmptyCell,
	type EmptyCellReader,
	htmlEmptyCells,
	jsonEmptyCells,
	snapToEmptyCell,
} from "./empty-values";
import { htmlLanguage } from "./html-language";

// The markers only ever describe what a codec would read, so every case here
// states the fields the format's own parser finds and then asserts which of
// them are invisible in the text.

// The empty fields a codec locates in its own text (#551).
function emptyFieldsOf(codec: TableCodec, text: string): EmptySourceField[] {
	const locate = codec.emptyFields;
	if (!locate) throw new Error(`${codec.id} locates no empty fields`);
	return [...locate(text)];
}

const fieldRanges = (fields: readonly EmptySourceField[]) =>
	fields.map(({ from, to }) => ({ from, to }));

describe("which codecs locate their own empty fields", () => {
	it("locates them where the codec's own splitter bounds a field", () => {
		for (const codec of [csvCodec, tsvCodec, jiraCodec, recordsCodec]) {
			expect(codec.emptyFields).toBeDefined();
		}
	});

	it("leaves the formats only the editor grammar can bound to that grammar", () => {
		for (const codec of [markdownCodec, jsonCodec, htmlCodec]) {
			expect(codec.emptyFields).toBeUndefined();
		}
	});

	it("names the spelling of an empty value only where the format writes one", () => {
		expect(jiraCodec.emptyFieldText).toBe(" ");
		expect(csvCodec.emptyFieldText).toBeUndefined();
	});
});

describe("delimited empty fields", () => {
	const scan = (text: string, codec: TableCodec = csvCodec) => ({
		offsets: emptyFieldsOf(codec, text).map(({ from }) => from),
	});

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

	it("carries a quoted value across a line break", () => {
		const text = 'a,"line one\nline two",,b';
		expect(scan(text).offsets).toEqual([text.indexOf(",,") + 1]);
	});

	it("says nothing about a line with no structure at all", () => {
		expect(scan("").offsets).toEqual([]);
		expect(scan("a plain sentence").offsets).toEqual([]);
	});

	it("uses the separator its codec declares rather than any comma it finds", () => {
		expect(scan("a,b\t\tc", tsvCodec).offsets).toEqual([4]);
		expect(scan("a\tb", csvCodec).offsets).toEqual([]);
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

describe("Jira empty fields", () => {
	const jiraEmptyFields = (text: string) =>
		fieldRanges(emptyFieldsOf(jiraCodec, text));
	const jiraEmptyOffsets = (text: string) =>
		jiraEmptyFields(text).map(({ from }) => from);

	it("marks an empty cell in a body row", () => {
		expect(jiraEmptyOffsets("|x||z|")).toEqual([3]);
	});

	it("marks the one-space spelling the codec writes, space included", () => {
		expect(jiraEmptyFields("| | | |")).toEqual([
			{ from: 1, to: 2 },
			{ from: 3, to: 4 },
			{ from: 5, to: 6 },
		]);
		expect(jiraEmptyFields("|| || ||")).toEqual([
			{ from: 2, to: 3 },
			{ from: 5, to: 6 },
		]);
		// Two spaces are a value, not the empty spelling.
		expect(jiraEmptyFields("|  |x|")).toEqual([]);
	});

	it("reads a header line's doubled pipes as one delimiter", () => {
		expect(jiraEmptyOffsets("||a||b||")).toEqual([]);
		expect(jiraEmptyOffsets("||a|||b||")).toEqual([5]);
		// Both delimiters keep their two characters, so the caret steps over
		// the whole of each.
		expect(emptyFieldsOf(jiraCodec, "||a|| ||")).toEqual([
			{ before: 3, from: 5, to: 6, after: 8 },
		]);
	});

	it("marks a header of only empty cells", () => {
		expect(jiraEmptyOffsets("||||")).toEqual([2]);
	});

	it("marks every cell of a serialized empty table", () => {
		const document = documentFromMatrix(
			[
				["", "", ""],
				["", "", ""],
			],
			{ headerRow: true },
		);
		expect(jiraEmptyFields(jiraCodec.serialize(document))).toHaveLength(6);
	});

	it("does not read an escaped pipe as a delimiter", () => {
		expect(jiraEmptyOffsets("|a\\|b|c|")).toEqual([]);
	});

	it("says nothing about a line with no pipes", () => {
		expect(jiraEmptyOffsets("")).toEqual([]);
		expect(jiraEmptyOffsets("a plain sentence")).toEqual([]);
	});

	// The editor once split a row on every unescaped pipe while the codec skips
	// the pipes inside a link or an image, so a marker could sit inside a link
	// where the parse sees no cell at all (#551).
	it("marks empty fields at exactly the cells the codec maps around a link", () => {
		const first = samplePerson(0);
		const text = [
			"||name||city||",
			`|[${first.name}| |https://example.com]| |`,
			`|!https://example.com/a.png|alt=${first.city}| |!| |`,
		].join("\n");
		const parsed = jiraCodec.parseMatrix(text);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.warnings).toBeUndefined();
		const mappedEmpty = (parsed.rows ?? []).flatMap(({ cells }) =>
			cells.filter(({ from, to }) => {
				const field = text.slice(from, to);
				return field === "" || field === " ";
			}),
		);
		expect(mappedEmpty).toHaveLength(2);
		expect(jiraEmptyFields(text)).toEqual(
			mappedEmpty.map(({ from, to }) => ({ from, to })),
		);
	});

	it("agrees with the Jira codec about how many cells a row has", () => {
		const source = "||a|||b||\n|x||z|";
		const parsed = jiraCodec.parseMatrix(source);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		const empty = parsed.table.matrix
			.flat()
			.filter((cell) => cell === "").length;
		expect(jiraEmptyOffsets(source)).toHaveLength(empty);
	});
});

describe("codecEmptyCells", () => {
	const cellsOf = (text: string, codec: TableCodec) =>
		codecEmptyCells((text) => emptyFieldsOf(codec, text))(
			EditorState.create({ doc: text }),
			0,
			text.length,
		);

	it("spans an empty delimited field from one separator to the next", () => {
		expect(cellsOf("a,,b", csvCodec)).toEqual([
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
		expect(cellsOf("a,\nb,c", csvCodec)).toEqual([
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

describe("Records empty fields", () => {
	const recordsEmptyOffset = (line: string) =>
		emptyFieldsOf(recordsCodec, line)[0]?.from ?? null;

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
		expect(emptyFieldsOf(recordsCodec, source)).toHaveLength(empty);
	});
});

const recordsCells = codecEmptyCells((text) =>
	emptyFieldsOf(recordsCodec, text),
);

// The offsets where the placeholder is drawn, for a whole document in the
// language the view parses it with.
function markedOffsets(
	text: string,
	read: EmptyCellReader,
	language: Extension = [],
): number[] {
	const state = EditorState.create({ doc: text, extensions: language });
	ensureSyntaxTree(state, state.doc.length, 5000);
	return read(state, 0, text.length).map((cell) => cell.valueStart);
}

describe("JSON empty values", () => {
	const mark = (text: string) => markedOffsets(text, jsonEmptyCells, json());

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
		markedOffsets(text, htmlEmptyCells, htmlLanguage);

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
		expect(markedOffsets(text, jsonEmptyCells, json())).toHaveLength(3);
	});

	it("marks HTML's empty cells", () => {
		const text = htmlCodec.serialize(document);
		// `null` projects to empty text, and HTML cannot tell it from `""`.
		expect(markedOffsets(text, htmlEmptyCells, htmlLanguage)).toHaveLength(4);
	});

	it("marks Records' empty values, and nothing where the line is blank", () => {
		const named = recordsCodec.serialize(document);
		expect(markedOffsets(named, recordsCells)).toHaveLength(4);
		// With the column name omitted, the empty title is a blank line.
		const unnamed = recordsCodec.serialize(document, {
			includeFirstColumnName: false,
		});
		expect(markedOffsets(unnamed, recordsCells)).toHaveLength(3);
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
