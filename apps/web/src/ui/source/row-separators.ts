import {
	type EditorState,
	RangeSetBuilder,
	StateEffect,
	StateField,
} from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import type { SourceRowRange } from "@/formats/types";

// The boundary between two semantic table rows in a source view (#296): one
// hairline under the last line of every row but the last. The rows come from
// the format's own parse; this only draws them, and never works out rows from
// the text itself. It is a line decoration, so it changes no byte, no
// selection, no clipboard content, and no geometry: the stroke is painted by
// the theme without taking any room.

export interface SourceRows {
	readonly rows: readonly SourceRowRange[];
	// The length of the text the rows were parsed from. Offsets into another
	// text would draw boundaries on the wrong lines, so a mismatch draws none.
	readonly length: number;
}

export const setSourceRows = StateEffect.define<SourceRows>();

const rowEnd = Decoration.line({ class: "cm-tabeloRowEnd" });

function separators(state: EditorState, { rows, length }: SourceRows) {
	if (state.doc.length !== length || rows.length < 2) return Decoration.none;
	const builder = new RangeSetBuilder<Decoration>();
	let previous = -1;
	for (const row of rows.slice(0, -1)) {
		if (row.to > state.doc.length) return Decoration.none;
		// The row's last line: its border follows every line and every wrapped
		// fragment of the row, including a quoted line break inside a cell.
		const line = state.doc.lineAt(row.to);
		if (line.from <= previous) continue;
		builder.add(line.from, line.from, rowEnd);
		previous = line.from;
	}
	return builder.finish();
}

export const sourceRowSeparators = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(decorations, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(setSourceRows)) {
				return separators(transaction.state, effect.value);
			}
		}
		// Between one parse and the next, typing moves the boundaries with the
		// text; the next parse replaces them, or clears them if it fails.
		return transaction.docChanged
			? decorations.map(transaction.changes)
			: decorations;
	},
	provide: (field) => EditorView.decorations.from(field),
});
