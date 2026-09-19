import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { samplePerson } from "@/core/sample-data";
import { csvCodec } from "@/formats/csv";
import { markdownCodec } from "@/formats/markdown";
import type { TableCodec } from "@/formats/types";
import {
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
