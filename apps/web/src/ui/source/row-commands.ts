import type { EditorState } from "@codemirror/state";
import { copy } from "@/copy/copy";
import {
	createSelection,
	type SelectionMoveRefusal,
	selectionMoveRefusal,
} from "@/core/selection";
import { cellAtPosition } from "@/formats/parse";
import type { SourceTableRow, TableCodec } from "@/formats/types";
import { useTabeloStore, visibleTextForPane } from "@/state/store";
import { moveRefusalMessage } from "@/ui/grid/table-actions";
import type { ViewId } from "@/views/types";

// Structural commands run from a source pane (#255). The caret names a table
// row through the codec's own position mapping (docs/adr/0005), and the command
// is the grid's operation on that row, applied as one document step. Nothing
// here knows a format: a pane whose codec does not map rows is never given
// these commands at all.

export type SourceRowRefusal =
	| SelectionMoveRefusal
	// The pane's text is not what the document holds: a draft that does not
	// parse, or one still waiting to be judged. Acting on the last valid parse
	// would move a row the user is not looking at.
	| "unparsed"
	// The caret is on a blank line, or before or after the table.
	| "outside-table";

export const sourceRowRefusalMessage: Record<SourceRowRefusal, string> = {
	...moveRefusalMessage,
	unparsed: copy.disabled.sourceRowUnparsed,
	"outside-table": copy.disabled.sourceRowOutside,
};

// Where the caret belongs once the text is regenerated: the same cell of the
// moved row, at the same distance into it. `row` counts the header as 0, as
// the mapping does; `column` is null when the caret was on no cell, and the
// distance is then from the row's start.
export interface SourceCaretTarget {
	readonly row: number;
	readonly column: number | null;
	readonly distance: number;
}

export interface SourceRowTarget {
	readonly paneId: string;
	readonly viewId: ViewId;
	readonly codec: TableCodec;
}

export type SourceRowMove =
	| { readonly ok: false; readonly refusal: SourceRowRefusal }
	| {
			readonly ok: true;
			// The document's data row the caret is in.
			readonly row: number;
			readonly caret: SourceCaretTarget;
	  };

// Resolves a row move without running it, so the menu can say why it is
// unavailable before anything happens, and the keyboard can prepare the caret
// before the document changes. The text is parsed afresh from the editor,
// never taken from a render that may be one keystroke behind.
export function resolveSourceRowMove(
	state: EditorState,
	target: SourceRowTarget,
	offset: number,
): SourceRowMove {
	const store = useTabeloStore.getState();
	const text = state.doc.toString();
	const draft = store.draft;
	const ownsDraft =
		draft?.paneId === target.paneId && draft.viewId === target.viewId;
	const shown = visibleTextForPane(store, target.paneId, target.viewId);
	if (
		(ownsDraft && draft.status !== "clean") ||
		!shown.ok ||
		shown.text !== text
	) {
		return { ok: false, refusal: "unparsed" };
	}

	const parsed = target.codec.parse(text);
	const rows = parsed.ok ? parsed.rows : undefined;
	const { document } = store;
	if (!rows || rows.length !== document.rows.length + 1) {
		return { ok: false, refusal: "unparsed" };
	}

	const head = state.selection.main.head;
	const position = cellAtPosition(rows, head);
	const mapped = position ? rows[position.row] : undefined;
	if (!position || !mapped) return { ok: false, refusal: "outside-table" };

	// The mapping counts the header as row 0; the document counts it as the
	// grid's header row, one before its first data row.
	const row = position.row - 1;
	const refusal = selectionMoveRefusal(
		createSelection({ row, column: 0 }),
		document.rows.length,
		document.columns.length,
		"row",
		offset,
	);
	if (refusal) return { ok: false, refusal };

	const column =
		position.column !== null && position.column < document.columns.length
			? position.column
			: null;
	const start =
		column === null ? mapped.from : (mapped.cells[column]?.from ?? mapped.from);
	return {
		ok: true,
		row,
		caret: {
			row: position.row + offset,
			column,
			distance: head - start,
		},
	};
}

// The offset a caret target names in freshly mapped rows, clamped to the cell
// or row it names, or null when those rows no longer hold it.
export function caretOffset(
	rows: readonly SourceTableRow[],
	target: SourceCaretTarget,
): number | null {
	const row = rows[target.row];
	if (!row) return null;
	const span = target.column === null ? row : (row.cells[target.column] ?? row);
	return Math.min(span.from + Math.max(0, target.distance), span.to);
}
