import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { EMPTY_VALUE_PLACEHOLDER } from "@/core/empty-value";
import { samplePerson } from "@/core/sample-data";
import { csvCodec, jiraCodec, tsvCodec } from "@/formats";
import type { SourceTableRow, TableCodec } from "@/formats/types";
import {
	type AlignmentOptions,
	type AlignmentPad,
	alignmentPadding,
	columnAlignment,
	drawnWidth,
} from "./column-alignment";
import { setSourceRows, sourceRowsField } from "./source-rows";

const first = samplePerson(0);
const second = samplePerson(1);

const plain: AlignmentOptions = {
	emptyValues: false,
	lineBreaks: true,
	escapes: null,
};

function rowsOf(codec: TableCodec, text: string): readonly SourceTableRow[] {
	const parsed = codec.parse(text);
	if (!parsed.ok || !parsed.rows) throw new Error("fixture does not parse");
	return parsed.rows;
}

function pad(
	codec: TableCodec,
	text: string,
	options: AlignmentOptions = plain,
): AlignmentPad[] {
	return alignmentPadding(text, rowsOf(codec, text), drawnWidth(text, options));
}

// The text as it is drawn: every pad written out as spaces where it stands,
// so an ASCII fixture can be read column by column.
function drawn(text: string, pads: readonly AlignmentPad[]): string[] {
	let out = "";
	let at = 0;
	for (const { at: offset, columns } of pads.toSorted((a, b) => a.at - b.at)) {
		out += text.slice(at, offset) + " ".repeat(columns);
		at = offset;
	}
	return (out + text.slice(at)).split("\n");
}

// Where each field starts on a drawn line, found by its own text.
function starts(line: string, fields: readonly string[]): number[] {
	let from = 0;
	return fields.map((field) => {
		const index = line.indexOf(field, from);
		from = index + field.length;
		return index;
	});
}

describe("column alignment", () => {
	it("starts every CSV column at the same position on every row", () => {
		const text = [
			"name,city,role",
			`${first.name},${first.city},${first.role}`,
			`${second.name},${second.city},${second.role}`,
		].join("\n");
		const lines = drawn(text, pad(csvCodec, text));

		const header = starts(lines[0] ?? "", ["name", "city", "role"]);
		expect(
			starts(lines[1] ?? "", [first.name, first.city, first.role]),
		).toEqual(header);
		expect(
			starts(lines[2] ?? "", [second.name, second.city, second.role]),
		).toEqual(header);
	});

	it("pads nothing after a row's last field", () => {
		const text = `name,city\n${first.name},${first.city}`;
		for (const { at } of pad(csvCodec, text)) {
			expect(text[at]).toBe(",");
		}
	});

	it("lines up Jira's header and body delimiters, which differ in width", () => {
		const text = [
			"||name||city||",
			`|${first.name}|${first.city}|`,
			`|${second.name}|${second.city}|`,
		].join("\n");
		const lines = drawn(text, pad(jiraCodec, text));

		const header = starts(lines[0] ?? "", ["name", "city"]);
		expect(starts(lines[1] ?? "", [first.name, first.city])).toEqual(header);
		expect(starts(lines[2] ?? "", [second.name, second.city])).toEqual(header);
		// The closing delimiters end on one column too.
		const ends = lines.map((line) => line.length);
		expect(new Set(ends).size).toBe(1);
	});

	it("aligns a quoted multi-line field where it starts and pads no continuation line", () => {
		const text = [
			"name,city,role",
			`${first.name},"${first.city}\n${second.city}",${first.role}`,
			`${second.name},${second.city},${second.role}`,
		].join("\n");
		const pads = pad(csvCodec, text);
		const continuation = text.indexOf(second.city);
		const continuationEnd = text.indexOf("\n", continuation);

		expect(
			pads.some(({ at }) => at > continuation && at <= continuationEnd),
		).toBe(false);
		const lines = drawn(text, pads);
		expect(starts(lines[1] ?? "", [first.name, `"${first.city}`])).toEqual(
			starts(lines[0] ?? "", ["name", "city"]),
		);
	});

	it("counts an empty field as wide as its placeholder only while it is drawn", () => {
		const text = `name,city,role\n${first.name},,${first.role}`;
		const rows = rowsOf(csvCodec, text);
		const cityEnd = "name,city".length;
		const emptyField = text.lastIndexOf(",,") + 1;
		const padsWith = (emptyValues: boolean) =>
			alignmentPadding(text, rows, drawnWidth(text, { ...plain, emptyValues }))
				.filter(({ at }) => at === cityEnd || at === emptyField)
				.map(({ at, columns }) => ({ at, columns }));

		// The placeholder is wider than the header above it, so the header gives
		// way; without it the empty field is nothing wide and is padded instead.
		expect(padsWith(true)).toEqual([
			{ at: cityEnd, columns: EMPTY_VALUE_PLACEHOLDER.length - "city".length },
		]);
		expect(padsWith(false)).toEqual([
			{ at: emptyField, columns: "city".length },
		]);
	});

	it("counts a wide character as the two columns it is drawn in", () => {
		const width = drawnWidth("東京", plain);
		expect(width(0, 2)).toBe(4);
	});

	it("counts a Jira line break as its one-character glyph while it is drawn", () => {
		const text = "a\\\\b";
		expect(
			drawnWidth(text, { ...plain, escapes: "jira" })(0, text.length),
		).toBe(3);
		expect(
			drawnWidth(text, { ...plain, escapes: "jira", lineBreaks: false })(
				0,
				text.length,
			),
		).toBe(4);
	});

	it("counts a tab as nothing, since it reaches the same stop on every row", () => {
		expect(drawnWidth("a\tbc", plain)(0, 4)).toBe(3);
	});

	it("aligns TSV columns around the tab that separates them", () => {
		const text = `name\tcity\n${first.name}\t${first.city}`;
		const lines = drawn(text, pad(tsvCodec, text));
		expect(lines[0]?.indexOf("\t")).toBe(lines[1]?.indexOf("\t"));
	});
});

describe("column alignment in the editor", () => {
	const text = `name,city\n${first.name},${first.city}`;
	const padding = (state: EditorState) => {
		let count = 0;
		for (const source of state.facet(EditorView.decorations)) {
			const set = typeof source === "function" ? null : source;
			set?.between(0, state.doc.length, () => {
				count += 1;
			});
		}
		return count;
	};
	const create = () =>
		EditorState.create({
			doc: text,
			extensions: [sourceRowsField, columnAlignment(plain)],
		});

	it("pads nothing until the rows arrive, and nothing once a draft stops parsing", () => {
		const state = create();
		expect(padding(state)).toBe(0);

		const mapped = state.update({
			effects: setSourceRows.of({
				rows: rowsOf(csvCodec, text),
				length: text.length,
			}),
		}).state;
		expect(padding(mapped)).toBeGreaterThan(0);

		const unparsed = mapped.update({
			effects: setSourceRows.of({ rows: [], length: text.length }),
		}).state;
		expect(padding(unparsed)).toBe(0);
	});

	it("reflows as a field grows, before the next parse", () => {
		const state = create().update({
			effects: setSourceRows.of({
				rows: rowsOf(csvCodec, text),
				length: text.length,
			}),
		}).state;
		// The header's "name" is padded to the width of the name below it; typing
		// into it until it is wider moves the padding to the other row.
		const typed = state.update({
			changes: { from: "name".length, insert: "xxxxxxxxxx" },
		}).state;
		const rows = typed.field(sourceRowsField);
		expect(rows?.[0]?.cells[0]?.to).toBe("name".length + 10);
		expect(padding(typed)).toBe(1);
	});
});
