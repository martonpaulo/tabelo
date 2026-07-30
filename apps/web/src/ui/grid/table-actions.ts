import {
	ArrowDown,
	ArrowLeft,
	ArrowRight,
	ArrowUp,
	ClipboardPaste,
	Copy,
	Eraser,
	type LucideIcon,
	Scissors,
	Trash2,
} from "lucide-react";
import { matrixToHtml, matrixToTsv } from "@/clipboard/serialize";
import {
	rectColumns,
	rectDataRows,
	selectionRect,
	structureDeletionGuard,
} from "@/core/selection";
import { useTabeloStore } from "@/state/store";
import { copyToClipboard, pasteFromClipboard } from "@/ui/clipboard-actions";
import { copy } from "@/ui/copy";

// One description of every table action, consumed by the toolbar and by the
// context menus alike. Two renderers over one list is what stops the menu and
// the toolbar drifting apart as actions are added.

export interface TableAction {
	readonly id: string;
	readonly label: string;
	readonly icon: LucideIcon;
	readonly shortcut?: string;
	readonly disabled?: boolean;
	readonly disabledReason?: string;
	readonly danger?: boolean;
	readonly run: () => void;
}

export interface TableActionGroup {
	readonly id: string;
	readonly actions: readonly TableAction[];
}

export async function copySelectionToClipboard(): Promise<boolean> {
	const matrix = useTabeloStore.getState().selectedMatrix();
	return copyToClipboard(
		{ text: matrixToTsv(matrix), html: matrixToHtml(matrix) },
		"selection",
	);
}

export interface TableActionContext {
	// Which axis the menu was opened on. Cells offer both; a row or column
	// header offers only its own, which is what keeps the menu short.
	readonly axis: "cell" | "row" | "column";
}

// Built from live store state on each call, so disabled states are always
// accurate rather than a stale snapshot.
export function buildTableActions(
	context: TableActionContext,
): readonly TableActionGroup[] {
	const store = useTabeloStore.getState();
	const { document, selection } = store;
	const rect = selectionRect(
		selection,
		document.rows.length,
		document.columns.length,
	);

	const showRows = context.axis !== "column";
	const showColumns = context.axis !== "row";
	// Row actions count data rows only. A selection may cover the header row,
	// which is structurally required and so is never one of the rows an action
	// inserts beside, duplicates, moves, or removes.
	const dataRows = rectDataRows(rect);
	const rowCount = dataRows.length;
	const columnCount = rectColumns(rect).length;
	const firstDataRow = dataRows[0];
	const lastDataRow = dataRows.at(-1);
	// Nothing to act on when the selection sits on the header row alone.
	const noDataRows = rowCount === 0;
	const deletionGuard = structureDeletionGuard(
		[selection],
		document.rows.length,
		document.columns.length,
	);

	const insert: TableAction[] = [];
	if (showRows) {
		// Inserting beside the header row still adds one data row, so the label
		// never reads as a count of zero.
		const insertCount = Math.max(1, rowCount);
		insert.push(
			{
				id: "row-above",
				label: copy.actions.insertRowsAbove(insertCount),
				icon: ArrowUp,
				run: () => store.addRowAbove(),
			},
			{
				id: "row-below",
				label: copy.actions.insertRowsBelow(insertCount),
				icon: ArrowDown,
				run: () => store.addRowBelow(),
			},
		);
	}
	if (showColumns) {
		insert.push(
			{
				id: "column-left",
				label: copy.actions.insertColumnsLeft(columnCount),
				icon: ArrowLeft,
				run: () => store.addColumnLeft(),
			},
			{
				id: "column-right",
				label: copy.actions.insertColumnsRight(columnCount),
				icon: ArrowRight,
				run: () => store.addColumnRight(),
			},
		);
	}

	const clipboard: TableAction[] = [
		{
			id: "copy",
			label: copy.actions.copy,
			icon: Copy,
			shortcut: copy.shortcuts.copy,
			run: () => void copySelectionToClipboard(),
		},
		{
			id: "cut",
			label: copy.actions.cut,
			icon: Scissors,
			shortcut: copy.shortcuts.cut,
			run: () => {
				void copySelectionToClipboard().then((ok) => {
					if (ok) useTabeloStore.getState().clearSelection();
				});
			},
		},
		{
			id: "paste",
			label: copy.actions.paste,
			icon: ClipboardPaste,
			shortcut: copy.shortcuts.paste,
			run: () => void pasteFromClipboard(),
		},
	];

	const duplicatesColumns = showColumns && !showRows;
	const edit: TableAction[] = [
		{
			id: "duplicate",
			label: duplicatesColumns
				? copy.actions.duplicateColumns(columnCount)
				: copy.actions.duplicateRows(rowCount),
			icon: Copy,
			// Duplicating the header row is not a thing a table can do: it would
			// give the document a second one.
			disabled: !duplicatesColumns && noDataRows,
			disabledReason: copy.disabled.headerRowRequired,
			run: () =>
				duplicatesColumns
					? store.duplicateSelectedColumns()
					: store.duplicateSelectedRows(),
		},
		{
			id: "clear",
			label: copy.actions.clear,
			icon: Eraser,
			shortcut: copy.shortcuts.clear,
			run: () => store.clearSelection(),
		},
	];

	const move: TableAction[] = [];
	if (showRows) {
		move.push(
			{
				id: "move-up",
				label: copy.actions.moveUp,
				icon: ArrowUp,
				disabled: noDataRows || firstDataRow === 0,
				disabledReason: copy.disabled.firstRow,
				run: () => store.moveSelectedRow(-1),
			},
			{
				id: "move-down",
				label: copy.actions.moveDown,
				icon: ArrowDown,
				disabled:
					noDataRows ||
					lastDataRow === undefined ||
					lastDataRow >= document.rows.length - 1,
				disabledReason: copy.disabled.lastRow,
				run: () => store.moveSelectedRow(1),
			},
		);
	}
	if (showColumns) {
		move.push(
			{
				id: "move-left",
				label: copy.actions.moveLeft,
				icon: ArrowLeft,
				disabled: rect.left === 0,
				disabledReason: copy.disabled.firstColumn,
				run: () => store.moveSelectedColumn(-1),
			},
			{
				id: "move-right",
				label: copy.actions.moveRight,
				icon: ArrowRight,
				disabled: rect.right >= document.columns.length - 1,
				disabledReason: copy.disabled.lastColumn,
				run: () => store.moveSelectedColumn(1),
			},
		);
	}

	const remove: TableAction[] = [];
	if (showRows) {
		remove.push({
			id: "delete-rows",
			label: copy.actions.deleteRows(rowCount),
			icon: Trash2,
			shortcut: copy.shortcuts.deleteStructure,
			danger: true,
			disabled: noDataRows || deletionGuard.wouldRemoveAllRows,
			disabledReason: noDataRows
				? copy.disabled.headerRowRequired
				: copy.disabled.lastRemainingRow,
			run: () => store.removeSelectedRows(),
		});
	}
	if (showColumns) {
		remove.push({
			id: "delete-columns",
			label: copy.actions.deleteColumns(columnCount),
			icon: Trash2,
			danger: true,
			disabled: deletionGuard.wouldRemoveAllColumns,
			disabledReason: copy.disabled.lastRemainingColumn,
			run: () => store.removeSelectedColumns(),
		});
	}

	return [
		{ id: "clipboard", actions: clipboard },
		{ id: "insert", actions: insert },
		{ id: "edit", actions: edit },
		{ id: "move", actions: move },
		{ id: "remove", actions: remove },
	].filter((group) => group.actions.length > 0);
}
