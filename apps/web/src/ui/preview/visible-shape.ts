import { cellTextAt } from "@/core/cell-value";
import type { Column, ColumnId, Row, RowId, TableDocument } from "@/core/types";

// The preview is a reading copy, not an editing surface: a column or row with
// no value anywhere, alongside others that do have content, is structure the
// reader can't act on, so it is left out rather than shown as an empty band.
// Emptiness is judged against the full document, independently for rows and
// columns, so hiding one never changes whether the other counts as empty. A
// document with no content anywhere is a different case, not "every row and
// column is individually empty": a freshly started table still shows its blank
// shape rather than nothing.
//
// This is presentation, not document semantics: the document keeps the rows and
// columns this leaves out, and only the rendered view omits them.

export interface VisibleShape {
	readonly columns: readonly Column[];
	readonly rows: readonly Row[];
}

export function visibleShape(document: TableDocument): VisibleShape {
	// One pass decides both axes: a filled cell marks its column and its row at
	// the same time, so there is nothing the second and third passes this
	// replaced could have learned that this one does not.
	const filledColumns = new Set<ColumnId>();
	const filledRows = new Set<RowId>();
	for (const row of document.rows) {
		for (const column of document.columns) {
			// Emptiness is what the reader sees, so it is judged on the projected
			// text: a cell holding `null` renders blank and counts as empty here.
			if (cellTextAt(row, column.id) === "") continue;
			filledColumns.add(column.id);
			filledRows.add(row.id);
		}
	}

	// Nothing anywhere holds a value, so this is a table nobody has typed into
	// rather than one whose rows and columns happen to be individually empty.
	// It keeps its shape. Without this case the filters below would collapse it
	// to no columns and no rows.
	if (filledColumns.size === 0) {
		return { columns: document.columns, rows: document.rows };
	}

	// An axis that loses nothing is returned as the document's own array rather
	// than an equal copy. That is load-bearing rather than tidy: the caller
	// memoises this on the document, which is replaced on every parse commit, so
	// an unconditional filter would hand the rendered rows a fresh column array
	// on every keystroke and defeat their memo boundary.
	return {
		columns:
			filledColumns.size === document.columns.length
				? document.columns
				: document.columns.filter((column) => filledColumns.has(column.id)),
		rows:
			filledRows.size === document.rows.length
				? document.rows
				: document.rows.filter((row) => filledRows.has(row.id)),
	};
}
