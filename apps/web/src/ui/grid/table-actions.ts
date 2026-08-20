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
import { selectionClipboardPayload } from "@/clipboard/serialize";
import { copy } from "@/copy/copy";
import {
	type FillDirection,
	fillTargetInDirection,
	isContiguous,
	type SelectionFillRefusal,
	type SelectionMoveRefusal,
	selectionColumns,
	selectionDataRows,
	selectionFillRefusal,
	selectionMoveRefusal,
	structureDeletionGuard,
} from "@/core/selection";
import { useTabeloStore } from "@/state/store";
import { copyToClipboard, pasteFromClipboard } from "@/ui/clipboard-actions";

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
	readonly label?: string;
	readonly labelId?: string;
	readonly actions: readonly TableAction[];
}

export const moveRefusalMessage: Record<SelectionMoveRefusal, string> = {
	"single-area": copy.disabled.singleAreaRequired,
	"header-row": copy.disabled.headerRowRequired,
	"first-row": copy.disabled.firstRow,
	"last-row": copy.disabled.lastRow,
	"first-column": copy.disabled.firstColumn,
	"last-column": copy.disabled.lastColumn,
};

export const fillRefusalMessage: Record<SelectionFillRefusal, string> = {
	"single-area": copy.disabled.singleAreaRequired,
	"header-row": copy.disabled.headerRowRequired,
	"first-row": copy.disabled.firstRow,
	"last-row": copy.disabled.lastRow,
	"first-column": copy.disabled.firstColumn,
	"last-column": copy.disabled.lastColumn,
};

export function commitFillTarget(target: {
	readonly top: number;
	readonly bottom: number;
	readonly left: number;
	readonly right: number;
}): number {
	const store = useTabeloStore.getState();
	const count = store.fillSelection(target);
	if (count > 0) store.announceStatus(copy.status.cellsFilled(count));
	return count;
}

export function runFillDirection(
	direction: FillDirection,
): SelectionFillRefusal | null {
	const store = useTabeloStore.getState();
	const rows = store.document.rows.length;
	const columns = store.document.columns.length;
	const refusal = selectionFillRefusal(
		store.selection,
		rows,
		columns,
		direction,
	);
	if (refusal) return refusal;
	const target = fillTargetInDirection(
		store.selection,
		rows,
		columns,
		direction,
	);
	if (target) commitFillTarget(target);
	return null;
}

// The intent is passed rather than inferred, because copy and cut both send the
// same payload under the same scope and only differ in what they leave behind.
// Copy marks the range so the grid can keep showing where a paste would come
// from; cut takes the cells away immediately, so it marks nothing and drops
// whatever an earlier copy left. A refused write changes neither the clipboard
// nor the table, so it leaves an existing mark alone.
export async function copySelectionToClipboard(
	intent: "copy" | "cut",
): Promise<boolean> {
	const selection = useTabeloStore.getState().clipboardSelection();
	const ok = await copyToClipboard(
		selectionClipboardPayload(selection),
		"selection",
	);
	if (!ok) return false;

	const store = useTabeloStore.getState();
	if (intent === "cut") store.clearCopiedRanges();
	else store.markCopiedRanges();
	return true;
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
	const rows = document.rows.length;
	const columns = document.columns.length;

	const showRows = context.axis !== "column";
	const showColumns = context.axis !== "row";
	// Row actions count data rows only. A selection may cover the header row,
	// which is structurally required and so is never one of the rows an action
	// inserts beside, duplicates, moves, or removes.
	//
	// Counted across every region of the selection, as a set: two regions that
	// both cover a column still describe one column, so the labels stay honest
	// about what the action will do.
	const dataRows = selectionDataRows(selection, rows, columns);
	const selectedColumns = selectionColumns(selection, rows, columns);
	const rowCount = dataRows.length;
	const columnCount = selectedColumns.length;
	// Nothing to act on when the selection sits on the header row alone.
	const noDataRows = rowCount === 0;
	// Inserting, moving, and pasting each need one place to act, and several
	// separate areas name several. Disabled with the reason written out, never
	// hidden: see docs/design-system.md §4.
	const severalAreas = !isContiguous(selection);
	const deletionGuard = structureDeletionGuard(selection, rows, columns);
	const moveUpRefusal = selectionMoveRefusal(
		selection,
		rows,
		columns,
		"row",
		-1,
	);
	const moveDownRefusal = selectionMoveRefusal(
		selection,
		rows,
		columns,
		"row",
		1,
	);
	const moveLeftRefusal = selectionMoveRefusal(
		selection,
		rows,
		columns,
		"column",
		-1,
	);
	const moveRightRefusal = selectionMoveRefusal(
		selection,
		rows,
		columns,
		"column",
		1,
	);
	const fillDirections = [
		["up", ArrowUp, copy.actions.fillUp, copy.shortcuts.fillUp],
		["down", ArrowDown, copy.actions.fillDown, copy.shortcuts.fillDown],
		["left", ArrowLeft, copy.actions.fillLeft, copy.shortcuts.fillLeft],
		["right", ArrowRight, copy.actions.fillRight, copy.shortcuts.fillRight],
	] as const;

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
				disabled: severalAreas,
				disabledReason: copy.disabled.singleAreaRequired,
				run: () => store.addRowAbove(),
			},
			{
				id: "row-below",
				label: copy.actions.insertRowsBelow(insertCount),
				icon: ArrowDown,
				disabled: severalAreas,
				disabledReason: copy.disabled.singleAreaRequired,
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
				disabled: severalAreas,
				disabledReason: copy.disabled.singleAreaRequired,
				run: () => store.addColumnLeft(),
			},
			{
				id: "column-right",
				label: copy.actions.insertColumnsRight(columnCount),
				icon: ArrowRight,
				disabled: severalAreas,
				disabledReason: copy.disabled.singleAreaRequired,
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
			run: () => void copySelectionToClipboard("copy"),
		},
		{
			id: "cut",
			label: copy.actions.cut,
			icon: Scissors,
			shortcut: copy.shortcuts.cut,
			run: () => {
				void copySelectionToClipboard("cut").then((ok) => {
					if (ok) useTabeloStore.getState().clearSelection();
				});
			},
		},
		{
			id: "paste",
			label: copy.actions.paste,
			icon: ClipboardPaste,
			shortcut: copy.shortcuts.paste,
			disabled: severalAreas,
			disabledReason: copy.disabled.singleAreaRequired,
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
				disabled: moveUpRefusal !== null,
				disabledReason:
					moveUpRefusal === null
						? undefined
						: moveRefusalMessage[moveUpRefusal],
				run: () => store.moveSelectedRow(-1),
			},
			{
				id: "move-down",
				label: copy.actions.moveDown,
				icon: ArrowDown,
				disabled: moveDownRefusal !== null,
				disabledReason:
					moveDownRefusal === null
						? undefined
						: moveRefusalMessage[moveDownRefusal],
				run: () => store.moveSelectedRow(1),
			},
		);
	}

	const fill: TableAction[] =
		context.axis === "cell"
			? fillDirections.map(([direction, icon, label, shortcut]) => {
					const refusal = selectionFillRefusal(
						selection,
						rows,
						columns,
						direction,
					);
					return {
						id: `fill-${direction}`,
						label,
						icon,
						shortcut,
						disabled: refusal !== null,
						disabledReason:
							refusal === null ? undefined : fillRefusalMessage[refusal],
						run: () => runFillDirection(direction),
					};
				})
			: [];
	if (showColumns) {
		move.push(
			{
				id: "move-left",
				label: copy.actions.moveLeft,
				icon: ArrowLeft,
				disabled: moveLeftRefusal !== null,
				disabledReason:
					moveLeftRefusal === null
						? undefined
						: moveRefusalMessage[moveLeftRefusal],
				run: () => store.moveSelectedColumn(-1),
			},
			{
				id: "move-right",
				label: copy.actions.moveRight,
				icon: ArrowRight,
				disabled: moveRightRefusal !== null,
				disabledReason:
					moveRightRefusal === null
						? undefined
						: moveRefusalMessage[moveRightRefusal],
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
		{
			id: "edit",
			label: copy.actions.edit,
			labelId: "table-actions-edit-label",
			actions: edit,
		},
		{
			id: "move",
			label: copy.actions.move,
			labelId: "table-actions-move-label",
			actions: move,
		},
		{
			id: "fill",
			label: copy.actions.fill,
			labelId: "table-actions-fill-label",
			actions: fill,
		},
		{ id: "remove", actions: remove },
	].filter((group) => group.actions.length > 0);
}
