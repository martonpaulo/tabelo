import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { documentFromMatrix } from "@/core/document";
import { samplePerson } from "@/core/sample-data";
import { csvCodec } from "@/formats/csv";
import { jiraCodec } from "@/formats/jira";
import { markdownCodec } from "@/formats/markdown";
import type { TableCodec } from "@/formats/types";
import { occurrenceSummary } from "./occurrence-selection";
import {
	axisBandLines,
	axisSelection,
	rowAtLine,
	selectedSourceAxis,
	sourceAxisConfig,
} from "./source-axes";
import { setSourceRows, sourceRowsField } from "./source-rows";

// What a source view's line numbers and column letters name (#395): a table
// row through the codec's mapping, never a text line, and the selection a
// click on either leaves, which is also what a keyboard-opened menu reads.

const ingrid = samplePerson(0);
const paulo = samplePerson(1);

function mapped(codec: TableCodec, text: string): EditorState {
	const parsed = codec.parse(text);
	const rows = parsed.ok ? (parsed.rows ?? []) : [];
	const state = EditorState.create({
		doc: text,
		extensions: [
			sourceRowsField,
			EditorState.allowMultipleSelections.of(true),
			sourceAxisConfig.of({
				fields: codec.sourceFields,
				movable: () => true,
				reorder: () => {},
			}),
		],
	});
	return state.update({
		effects: setSourceRows.of({ rows, length: text.length }),
	}).state;
}

function rowOfLine(state: EditorState, line: number): number | null {
	const rows = state.field(sourceRowsField);
	if (!rows) throw new Error("the text maps rows");
	return rowAtLine(rows, state.doc.line(line));
}

function selectedText(state: EditorState, selection: EditorSelection | null) {
	if (!selection) throw new Error("the label selects something");
	return selection.ranges.map((range) => state.sliceDoc(range.from, range.to));
}

const MARKDOWN = [
	"| Name | City |",
	"| --- | --- |",
	`| ${ingrid.name} | ${ingrid.city} |`,
	`| ${paulo.name} | ${paulo.city} |`,
	"",
	"a note after the table",
].join("\n");

describe("source axis labels", () => {
	it("names a table row from its line, and nothing from the divider or text outside", () => {
		const state = mapped(markdownCodec, MARKDOWN);
		expect(rowOfLine(state, 1)).toBe(0);
		expect(rowOfLine(state, 2)).toBeNull();
		expect(rowOfLine(state, 3)).toBe(1);
		expect(rowOfLine(state, 4)).toBe(2);
		expect(rowOfLine(state, 5)).toBeNull();
		expect(rowOfLine(state, 6)).toBeNull();
	});

	it("names one CSV record from every line its quoted line break spans", () => {
		const state = mapped(
			csvCodec,
			`Name,City\n${ingrid.name},"${ingrid.city}\nnorth"\n${paulo.name},${paulo.city}`,
		);
		expect(rowOfLine(state, 2)).toBe(1);
		expect(rowOfLine(state, 3)).toBe(1);
		expect(rowOfLine(state, 4)).toBe(2);
	});

	it("selects a row's text, and the header's without its divider", () => {
		const state = mapped(markdownCodec, MARKDOWN);
		expect(
			selectedText(state, axisSelection(state, { axis: "row", index: 2 })),
		).toEqual([`| ${paulo.name} | ${paulo.city} |`]);
		expect(
			selectedText(state, axisSelection(state, { axis: "row", index: 0 })),
		).toEqual(["| Name | City |"]);
	});

	it("selects every cell of a column, as the text a user types into", () => {
		const state = mapped(markdownCodec, MARKDOWN);
		const selection = axisSelection(state, { axis: "column", index: 1 });
		expect(selectedText(state, selection)).toEqual([
			"City",
			ingrid.city,
			paulo.city,
		]);
		// The header's cell leads, so typing starts where the letter stands.
		expect(selection?.main.from).toBe(MARKDOWN.indexOf("City"));
	});

	it("selects inside a quoted CSV field, leaving its quotes", () => {
		const text = `Name,City\n"${ingrid.name}",${ingrid.city}`;
		const state = mapped(csvCodec, text);
		expect(
			selectedText(state, axisSelection(state, { axis: "column", index: 0 })),
		).toEqual(["Name", ingrid.name]);
	});

	it("reads the row or column a selection is exactly, and nothing else", () => {
		const state = mapped(markdownCodec, MARKDOWN);
		const pick = (selection: EditorSelection | null) => {
			if (!selection) throw new Error("the label selects something");
			return selectedSourceAxis(state.update({ selection }).state);
		};
		expect(pick(axisSelection(state, { axis: "column", index: 0 }))).toEqual({
			axis: "column",
			index: 0,
		});
		expect(pick(axisSelection(state, { axis: "row", index: 1 }))).toEqual({
			axis: "row",
			index: 1,
		});
		// A whole line with its line break, as selecting the line leaves it.
		const line = state.doc.line(3);
		expect(pick(EditorSelection.single(line.from, line.to + 1))).toEqual({
			axis: "row",
			index: 1,
		});
		expect(pick(EditorSelection.single(line.from + 3))).toBeNull();
		expect(pick(EditorSelection.single(line.from, line.to - 1))).toBeNull();
	});

	it("names nothing while the text has no mapping", () => {
		const state = EditorState.create({
			doc: MARKDOWN,
			extensions: [sourceRowsField],
		});
		expect(axisSelection(state, { axis: "row", index: 1 })).toBeNull();
		expect(selectedSourceAxis(state)).toBeNull();
	});
});

// The shape a selected row or column is drawn in, as the grid draws one: which
// text lines carry a band, and whose slot bounds each. Pixels come later, from
// the editor; these are the decisions.
describe("source axis bands", () => {
	function bands(
		codec: TableCodec,
		text: string,
		target: { axis: "row" | "column"; index: number },
	) {
		const state = mapped(codec, text);
		const rows = state.field(sourceRowsField) ?? [];
		return axisBandLines(state.doc, rows, target).map((band) => ({
			line: band.line,
			row: band.row,
			between: band.between,
			from: state.sliceDoc(band.from.from, band.from.to),
			to: state.sliceDoc(band.to.from, band.to.to),
		}));
	}

	it("runs a column's band through Markdown's divider without a gap", () => {
		const lines = bands(markdownCodec, MARKDOWN, { axis: "column", index: 1 });
		expect(lines.map(({ line }) => line)).toEqual([1, 2, 3, 4]);
		// The divider carries the header cell's slot on to the first row.
		expect(lines[1]).toEqual({
			line: 2,
			row: 0,
			between: true,
			from: " City ",
			to: " City ",
		});
		expect(lines.filter(({ between }) => between)).toHaveLength(1);
	});

	it("carries a column through every line of a CSV record", () => {
		const text = `Name,City\n${ingrid.name},"${ingrid.city}\nnorth"\n${paulo.name},${paulo.city}`;
		const lines = bands(csvCodec, text, { axis: "column", index: 0 });
		expect(lines.map(({ line, row }) => [line, row])).toEqual([
			[1, 0],
			[2, 1],
			[3, 1],
			[4, 2],
		]);
		// The continuation line takes the slot of its record's own cell.
		expect(lines[2]?.from).toBe(ingrid.name);
		expect(lines.some(({ between }) => between)).toBe(false);
	});

	it("draws a row across its cells, from the first to the last", () => {
		const lines = bands(markdownCodec, MARKDOWN, { axis: "row", index: 2 });
		expect(lines).toEqual([
			{
				line: 4,
				row: 2,
				between: false,
				from: ` ${paulo.name} `,
				to: ` ${paulo.city} `,
			},
		]);
		// The header row stops before its divider.
		expect(
			bands(markdownCodec, MARKDOWN, { axis: "row", index: 0 }).map(
				({ line }) => line,
			),
		).toEqual([1]);
	});

	it("counts no matches for a selected column whose cells read alike", () => {
		const text = [
			`${ingrid.city},Name`,
			`${ingrid.city},${ingrid.name}`,
			`${ingrid.city},${paulo.name}`,
		].join("\n");
		const state = mapped(csvCodec, text);
		const selection = axisSelection(state, { axis: "column", index: 0 });
		if (!selection) throw new Error("the letter selects its column");
		const selected = state.update({ selection }).state;
		expect(selected.selection.ranges).toHaveLength(3);
		expect(occurrenceSummary(selected)).toBeNull();
	});

	it("gives an empty Jira table one band per row in the column", () => {
		const text = jiraCodec.serialize(
			documentFromMatrix(
				[
					["", "", ""],
					["", "", ""],
					["", "", ""],
				],
				{ headerRow: true },
			),
		);
		const lines = bands(jiraCodec, text, { axis: "column", index: 1 });
		expect(lines.map(({ line }) => line)).toEqual([1, 2, 3]);
		expect(lines.every(({ from }) => from === " ")).toBe(true);
	});
});
