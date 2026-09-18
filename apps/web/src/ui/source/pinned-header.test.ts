import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { csvCodec } from "@/formats/csv";
import type { TableCodec } from "@/formats/types";
import { pinnedHeader, pinnedHeaderRange } from "./pinned-header";
import { setSourceRows } from "./row-separators";

// Which text a source pane pins (#252): the first row its codec maps, carried
// through typing between one parse and the next, and nothing when the rows
// describe some other text. Read back as the text the range covers, so each
// expectation says what a reader would see pinned.

function pinnedAfterParse(codec: TableCodec, text: string) {
	const parsed = codec.parse(text);
	const rows = parsed.ok ? (parsed.rows ?? []) : [];
	const state = EditorState.create({ doc: text, extensions: pinnedHeader });
	return state.update({
		effects: setSourceRows.of({ rows, length: text.length }),
	}).state;
}

function pinnedText(state: EditorState): string | null {
	const range = pinnedHeaderRange(state);
	return range ? state.sliceDoc(range.from, range.to) : null;
}

describe("the pinned header range", () => {
	it("is the header row the codec maps", () => {
		const text = 'name,"note\nsecond line"\nIngrid,Rio\nPaulo,Madrid';
		expect(pinnedText(pinnedAfterParse(csvCodec, text))).toBe(
			'name,"note\nsecond line"',
		);
	});

	it("is empty while the rows describe no text", () => {
		expect(pinnedText(pinnedAfterParse(csvCodec, 'name\n"unclosed'))).toBe(
			null,
		);
		const state = EditorState.create({
			doc: "name\nIngrid",
			extensions: pinnedHeader,
		});
		// Rows parsed from a text of another length are refused, not guessed at.
		const stale = state.update({
			effects: setSourceRows.of({
				rows: [{ from: 0, to: 4 }],
				length: 99,
			}),
		}).state;
		expect(pinnedText(stale)).toBe(null);
	});

	it("moves with typing inside and around the header until the next parse", () => {
		const state = pinnedAfterParse(csvCodec, "name,city\nIngrid,Rio");
		const typedAtStart = state.update({
			changes: { from: 0, insert: "X" },
		}).state;
		expect(pinnedText(typedAtStart)).toBe("Xname,city");
		const typedAtEnd = typedAtStart.update({
			changes: { from: 10, insert: "Y" },
		}).state;
		expect(pinnedText(typedAtEnd)).toBe("Xname,cityY");
		const typedBelow = typedAtEnd.update({
			changes: { from: typedAtEnd.doc.length, insert: "Z" },
		}).state;
		expect(pinnedText(typedBelow)).toBe("Xname,cityY");
	});
});
