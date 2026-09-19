import { StateEffect, StateField } from "@codemirror/state";
import type { SourceTableRow } from "@/formats/types";

// Where each semantic table row sits in the source text, from the format's own
// parse (#296). Nothing draws it any more (owner, 2026-09-19: source views are
// code and carry no row lines); the pinned header (#252) reads it to find the
// header row, the column markers (#368) read the header row's cells, and column
// alignment (#396) reads every row's cells.

export interface SourceRows {
	readonly rows: readonly SourceTableRow[];
	// The length of the text the rows were parsed from. Offsets into another
	// text would point at the wrong lines, so a reader must check it.
	readonly length: number;
}

export const setSourceRows = StateEffect.define<SourceRows>();

// The latest row mapping, for the readers that need every row. Typing between
// one parse and the next moves the rows with the text, so a cell being typed
// into grows with it; the next parse replaces them, and a draft that does not
// parse clears them, so nothing is ever drawn from rows the text no longer has.
export const sourceRowsField = StateField.define<
	readonly SourceTableRow[] | null
>({
	create: () => null,
	update(rows, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(setSourceRows)) {
				const { rows: next, length } = effect.value;
				return next.length > 0 && length === transaction.state.doc.length
					? next
					: null;
			}
		}
		if (!rows || !transaction.docChanged) return rows;
		const { changes } = transaction;
		return rows.map((row) => ({
			...row,
			from: changes.mapPos(row.from, -1),
			to: changes.mapPos(row.to, 1),
			cells: row.cells.map((cell) => ({
				from: changes.mapPos(cell.from, -1),
				to: changes.mapPos(cell.to, 1),
			})),
		}));
	},
});
