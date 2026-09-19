import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { markdownCodec } from "@/formats/markdown";
import {
	columnMarkerCells,
	columnMarkers,
	columnMarkersEnabled,
} from "./column-markers";
import { setSourceRows } from "./source-rows";

// Which header cells a source pane labels with column letters (#368): the
// header row's cells from the codec's own parse, carried through typing until
// the next parse, and nothing while the strip is off or the rows describe some
// other text. Read back as the text each cell covers, so each expectation says
// what the letter stands over.

const table = "| name   | city   |\n| ------ | ------ |\n| Ingrid | Rio    |";

function parsed(text: string, enabled = true): EditorState {
	const result = markdownCodec.parse(text);
	const rows = result.ok ? (result.rows ?? []) : [];
	const state = EditorState.create({
		doc: text,
		extensions: [columnMarkers, columnMarkersEnabled.of(enabled)],
	});
	return state.update({
		effects: setSourceRows.of({ rows, length: text.length }),
	}).state;
}

function labelled(state: EditorState): string[] | null {
	const cells = columnMarkerCells(state);
	return cells ? cells.map(({ from, to }) => state.sliceDoc(from, to)) : null;
}

describe("the column marker cells", () => {
	it("are the header row's cells, one per column", () => {
		expect(labelled(parsed(table))).toEqual([" name   ", " city   "]);
	});

	it("are absent while the strip is off", () => {
		expect(labelled(parsed(table, false))).toBe(null);
	});

	it("are absent while the draft does not parse", () => {
		expect(labelled(parsed("| name | city |\n| Ingrid | Rio |"))).toBe(null);
	});

	it("are refused when the rows describe a text of another length", () => {
		const stale = parsed(table).update({
			effects: setSourceRows.of({
				rows: [{ from: 0, to: 4, cells: [{ from: 0, to: 4 }] }],
				length: 99,
			}),
		}).state;
		expect(labelled(stale)).toBe(null);
	});

	it("follow typing inside the header until the next parse", () => {
		const state = parsed(table);
		const typed = state.update({ changes: { from: 6, insert: "s" } }).state;
		expect(labelled(typed)).toEqual([" names   ", " city   "]);
	});
});
