import type { EditorState } from "@codemirror/state";
import { copy } from "@/copy/copy";
import type { SortDirection } from "@/core/operations";
import {
	createSelection,
	type SelectionMoveRefusal,
	selectionMoveRefusal,
} from "@/core/selection";
import { cellAtPosition } from "@/formats/parse";
import type { SourceTableRow, TableCodec } from "@/formats/types";
import {
	type StructureEdit,
	useTabeloStore,
	visibleTextForPane,
} from "@/state/store";
import { moveRefusalMessage } from "@/ui/grid/table-actions";
import type { ViewId } from "@/views/types";

// Structural commands run from a source pane (#255). The caret names a table
// row and cell through the codec's own position mapping (docs/adr/0005), and
// the command is the grid's operation on that row or column, applied as one
// document step. Nothing here knows a format: a pane whose codec does not map
// rows is never given these commands at all.

export type SourceRowRefusal =
	| SelectionMoveRefusal
	// The pane's text is not what the document holds: a draft that does not
	// parse, or one still waiting to be judged. Acting on the last valid parse
	// would change a table the user is not looking at.
	| "unparsed"
	// The caret is on a blank line, or before or after the table.
	| "outside-table"
	// A column command, with the caret on a row but in no cell of it, such as
	// a Markdown divider or outside a row's outer pipes.
	| "outside-cell"
	| "last-remaining-row"
	| "last-remaining-column"
	| "sort-single-row";

export const sourceRowRefusalMessage: Record<SourceRowRefusal, string> = {
	...moveRefusalMessage,
	unparsed: copy.disabled.sourceRowUnparsed,
	"outside-table": copy.disabled.sourceRowOutside,
	"outside-cell": copy.disabled.sourceCellOutside,
	"last-remaining-row": copy.disabled.lastRemainingRow,
	"last-remaining-column": copy.disabled.lastRemainingColumn,
	"sort-single-row": copy.disabled.sortSingleRow,
};

// Where the caret belongs once the text is regenerated: a cell of a row, at a
// distance into it. `row` counts the header as 0, as the mapping does;
// `column` is null when the caret was on no cell, and the distance is then
// from the row's start.
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

type Refused = { readonly ok: false; readonly refusal: SourceRowRefusal };

// The cell under the caret, in document terms: `row` is the data row, -1 for
// the header row, and `column` is null on a row but in no cell.
interface SourceCaretCell {
	readonly row: number;
	readonly column: number | null;
	readonly distance: number;
}

// The text is parsed afresh from the editor, never taken from a render that
// may be one keystroke behind.
function resolveSourceCaret(
	state: EditorState,
	target: SourceRowTarget,
): Refused | { readonly ok: true; readonly cell: SourceCaretCell } {
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

	const column =
		position.column !== null && position.column < document.columns.length
			? position.column
			: null;
	const start =
		column === null ? mapped.from : (mapped.cells[column]?.from ?? mapped.from);
	// The mapping counts the header as row 0; the document counts it as the
	// grid's header row, one before its first data row.
	return {
		ok: true,
		cell: { row: position.row - 1, column, distance: head - start },
	};
}

export type SourceRowMove =
	| Refused
	| {
			readonly ok: true;
			// The document's data row the caret is in.
			readonly row: number;
			readonly caret: SourceCaretTarget;
	  };

// Resolves a row move without running it, so the menu can say why it is
// unavailable before anything happens, and the keyboard can prepare the caret
// before the document changes.
export function resolveSourceRowMove(
	state: EditorState,
	target: SourceRowTarget,
	offset: number,
): SourceRowMove {
	const found = resolveSourceCaret(state, target);
	if (!found.ok) return found;
	const { row, column, distance } = found.cell;
	const { document } = useTabeloStore.getState();
	const refusal = selectionMoveRefusal(
		createSelection({ row, column: 0 }),
		document.rows.length,
		document.columns.length,
		"row",
		offset,
	);
	if (refusal) return { ok: false, refusal };
	return {
		ok: true,
		row,
		caret: { row: row + 1 + offset, column, distance },
	};
}

// The structural commands a source pane's context menu offers beside the row
// moves, with no keyboard binding of their own (#255, option A).
export type SourceStructureCommand =
	| "move-column-left"
	| "move-column-right"
	| "insert-row-above"
	| "insert-row-below"
	| "insert-column-left"
	| "insert-column-right"
	| "delete-row"
	| "delete-column"
	| "sort-ascending"
	| "sort-descending";

// A command resolved against the caret, not yet run. `run` applies it as one
// document step and returns where the caret belongs in the regenerated text,
// or null when the document did not change.
export type SourceStructurePlan =
	| Refused
	| { readonly ok: true; readonly run: () => SourceCaretTarget | null };

function caretAt(
	row: number,
	column: number | null,
	distance = 0,
): SourceCaretTarget {
	return { row: row + 1, column, distance };
}

function editing(
	edit: StructureEdit,
	caret: SourceCaretTarget,
): SourceStructurePlan {
	return {
		ok: true,
		run: () => {
			useTabeloStore.getState().editStructureAt(edit);
			return caret;
		},
	};
}

// Sorting reorders rows, so the caret follows its own row by identity. The
// header row never moves. Announced as the grid's column sort announces it.
function sorting(
	cell: SourceCaretCell,
	column: number,
	direction: SortDirection,
): SourceStructurePlan {
	return {
		ok: true,
		run: () => {
			const store = useTabeloStore.getState();
			const rowId = store.document.rows[cell.row]?.id;
			const outcome = store.sortRowsByColumn(column, direction);
			if (outcome === "unavailable") return null;
			const sorted = useTabeloStore.getState().document;
			store.announceStatus(
				outcome === "sorted"
					? copy.status.rowsSorted(sorted.rows.length)
					: copy.status.rowsAlreadySorted,
			);
			if (outcome === "unchanged") return null;
			const row =
				rowId === undefined
					? -1
					: sorted.rows.findIndex((candidate) => candidate.id === rowId);
			return caretAt(row, cell.column, cell.distance);
		},
	};
}

// Refuses what the grid would refuse, with the same written reason, and
// otherwise names the edit and where the caret lands after it: in the new row
// or column for an insert, in the row or column that takes the removed one's
// place for a delete, and in the same cell, wherever it went, for a move or a
// sort.
export function resolveSourceCommand(
	state: EditorState,
	target: SourceRowTarget,
	command: SourceStructureCommand,
): SourceStructurePlan {
	const found = resolveSourceCaret(state, target);
	if (!found.ok) return found;
	const { cell } = found;
	const { row, column } = cell;
	const { document } = useTabeloStore.getState();
	const rowCount = document.rows.length;
	const columnCount = document.columns.length;

	switch (command) {
		case "insert-row-above":
			// Nothing goes above the header row: the table keeps exactly one.
			if (row < 0) return { ok: false, refusal: "header-row" };
			return editing({ kind: "insert-row", at: row }, caretAt(row, column));
		case "insert-row-below":
			return editing(
				{ kind: "insert-row", at: row + 1 },
				caretAt(row + 1, column),
			);
		case "delete-row": {
			// Removing the header promotes the first data row, so it needs one.
			const last = row < 0 ? rowCount === 0 : rowCount <= 1;
			if (last) return { ok: false, refusal: "last-remaining-row" };
			const next = row < 0 ? -1 : Math.min(row, rowCount - 2);
			return editing({ kind: "remove-row", row }, caretAt(next, column));
		}
	}

	if (column === null) return { ok: false, refusal: "outside-cell" };
	switch (command) {
		case "move-column-left":
		case "move-column-right": {
			const offset = command === "move-column-left" ? -1 : 1;
			const refusal = selectionMoveRefusal(
				createSelection({ row, column }),
				rowCount,
				columnCount,
				"column",
				offset,
			);
			if (refusal) return { ok: false, refusal };
			return editing(
				{ kind: "move-column", column, offset },
				caretAt(row, column + offset, cell.distance),
			);
		}
		case "insert-column-left":
			return editing(
				{ kind: "insert-column", at: column },
				caretAt(row, column),
			);
		case "insert-column-right":
			return editing(
				{ kind: "insert-column", at: column + 1 },
				caretAt(row, column + 1),
			);
		case "delete-column": {
			if (columnCount <= 1) {
				return { ok: false, refusal: "last-remaining-column" };
			}
			return editing(
				{ kind: "remove-column", column },
				caretAt(row, Math.min(column, columnCount - 2)),
			);
		}
		case "sort-ascending":
		case "sort-descending":
			if (rowCount < 2) return { ok: false, refusal: "sort-single-row" };
			return sorting(
				cell,
				column,
				command === "sort-ascending" ? "ascending" : "descending",
			);
	}
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
