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
	rectRows,
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
	const rowCount = rectRows(rect).length;
	const columnCount = rectColumns(rect).length;
	const deletionGuard = structureDeletionGuard(
		[selection],
		document.rows.length,
		document.columns.length,
	);

	const insert: TableAction[] = [];
	if (showRows) {
		insert.push(
			{
				id: "row-above",
				label: copy.actions.insertRowAbove,
				icon: ArrowUp,
				run: () => store.addRowAbove(),
			},
			{
				id: "row-below",
				label: copy.actions.insertRowBelow,
				icon: ArrowDown,
				run: () => store.addRowBelow(),
			},
		);
	}
	if (showColumns) {
		insert.push(
			{
				id: "column-left",
				label: copy.actions.insertColumnLeft,
				icon: ArrowLeft,
				run: () => store.addColumnLeft(),
			},
			{
				id: "column-right",
				label: copy.actions.insertColumnRight,
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

	const edit: TableAction[] = [
		{
			id: "duplicate",
			label:
				showColumns && !showRows
					? copy.actions.duplicateColumns(columnCount)
					: copy.actions.duplicateRows(rowCount),
			icon: Copy,
			run: () =>
				showColumns && !showRows
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
				disabled: rect.top === 0,
				disabledReason: copy.disabled.firstRow,
				run: () => store.moveSelectedRow(-1),
			},
			{
				id: "move-down",
				label: copy.actions.moveDown,
				icon: ArrowDown,
				disabled: rect.bottom >= document.rows.length - 1,
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
			disabled: deletionGuard.wouldRemoveAllRows,
			disabledReason: copy.disabled.lastRemainingRow,
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
