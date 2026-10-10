import {
	IconArrowDown,
	IconArrowLeft,
	IconArrowRight,
	IconArrowUp,
	IconBucketDroplet,
	IconEraser,
	IconFocusCentered,
	IconSquareArrowDown,
	IconSquareArrowLeft,
	IconSquareArrowRight,
	IconSquareArrowUp,
	type TablerIcon,
} from "@tabler/icons-react";
import { selectionClipboardPayload } from "@/clipboard/serialize";
import { copy } from "@/copy/copy";
import type { SortDirection } from "@/core/operations";
import {
	activeRange,
	type FillDirection,
	fillTargetInDirection,
	isContiguous,
	neighbourCell,
	type SelectionFillRefusal,
	selectionColumns,
	selectionCoversHeader,
	selectionDataRows,
	selectionFillRefusal,
	selectionMoveRefusal,
	selectionRects,
	structureDeletionGuard,
} from "@/core/selection";
import { useTabeloStore } from "@/state/store";
import { copyToClipboard, pasteFromClipboard } from "@/ui/clipboard-actions";
import {
	captureCommandTarget,
	commandDocumentUnchanged,
	commandTargetStatus,
} from "@/ui/command-target";
import {
	fillRefusalMessage,
	moveRefusalMessage,
	tableCommand,
	tableCommandGroup,
} from "@/ui/table/command-presentation";
import {
	type MenuCommandId,
	type MenuGroupId,
	orderMenuGroups,
} from "./menu-order";

// One description of every table action, consumed by the toolbar and by the
// context menus alike. Two renderers over one list is what stops the menu and
// the toolbar drifting apart as actions are added.

export interface TableAction {
	readonly id: MenuCommandId;
	readonly label: string;
	readonly icon: TablerIcon;
	readonly shortcut?: string;
	readonly disabled?: boolean;
	readonly disabledReason?: string;
	readonly danger?: boolean;
	// A command that never moves the focused cell, whose menu hands focus back
	// to where it was opened from, as a dismissal does: a column's Sort returns
	// to the column letter.
	readonly keepsFocus?: boolean;
	readonly run: () => void;
}

export interface TableActionGroup {
	readonly id: MenuGroupId;
	readonly label?: string;
	readonly labelId?: string;
	// A named group of directional commands shown as one submenu, so the menu's
	// first level stays short. Every renderer draws it the same way (#369).
	readonly submenu?: { readonly icon: TablerIcon };
	readonly actions: readonly TableAction[];
}

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
// from; cut takes the cells away, so it marks nothing and drops whatever an
// earlier copy left. A refused write changes neither the clipboard nor the
// table, so it leaves an existing mark alone.
//
// The write is asynchronous, so the cells are captured before it and only
// those cells are marked or cleared afterwards (#409). A cut whose table,
// document, or selection changed while the write was pending is `stale`: the
// clipboard holds the copy, and nothing is deleted from a target the user
// never cut. Data stays; a second Cut finishes the job.
type SelectionClipboardOutcome = "applied" | "refused" | "stale";

export async function copySelectionToClipboard(
	intent: "copy" | "cut",
): Promise<SelectionClipboardOutcome> {
	const store = useTabeloStore.getState();
	const target = captureCommandTarget();
	const rects = selectionRects(
		target.selection,
		target.document.rows.length,
		target.document.columns.length,
	);
	const ok = await copyToClipboard(
		selectionClipboardPayload(store.clipboardSelection()),
		"selection",
	);
	if (!ok) return "refused";

	const after = useTabeloStore.getState();
	if (intent === "copy") {
		// A mark records cells, so a moved cursor does not matter; an edited
		// or switched document does, because the rects no longer name them.
		if (!commandDocumentUnchanged(target)) {
			after.clearCopiedRanges();
			return "stale";
		}
		after.markCopiedRanges(rects);
		return "applied";
	}

	after.clearCopiedRanges();
	if (commandTargetStatus(target) !== "current") return "stale";
	after.clearSelection(rects);
	return "applied";
}

export interface TableActionContext {
	// Which axis the menu was opened on. Cells offer both; a row or column
	// header offers only its own, which is what keeps the menu short.
	readonly axis: "cell" | "row" | "column";
	// Whether the menu was opened on a cell rather than on a row number or a
	// column letter. The keyboard opens the row or column menu on a cell whose
	// whole row or column is selected (#288), and Move focus, keep selection
	// still belongs there: it is the only keyboard path from one selected
	// column to the next, so it follows the cell, not the axis.
	readonly openedOnCell?: boolean;
	// The column a column menu acts on, which is what its Sort reorders by.
	readonly column?: number;
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
	// Removal is the one row action the header row takes part in: it goes with
	// the rows under it and the first survivor is promoted into it. So it counts
	// here, and only here.
	const coversHeader = selectionCoversHeader(selection, rows, columns);
	const removableRowCount = rowCount + (coversHeader ? 1 : 0);
	// Inserting, moving, and pasting each need one place to act, and several
	// separate areas name several. Disabled with the reason written out, never
	// hidden: see docs/design-system/4-interaction-states.md.
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
		["up", IconArrowUp, copy.actions.fillUp, copy.shortcuts.fillUp],
		["down", IconArrowDown, copy.actions.fillDown, copy.shortcuts.fillDown],
		["left", IconArrowLeft, copy.actions.fillLeft, copy.shortcuts.fillLeft],
		["right", IconArrowRight, copy.actions.fillRight, copy.shortcuts.fillRight],
	] as const;

	// Moving the focus without discarding the areas already selected. It used
	// to be Mod+Alt+Shift+arrow, which section 9 no longer allows, and it is
	// the reason a second column can be added to a selection without a
	// pointer at all: every arrow key that stays inside the three-key limit
	// replaces the selection. The square-arrow family keeps it distinct from
	// the three directional groups the menu already carries.
	const focusDirections = [
		[
			"up",
			IconSquareArrowUp,
			copy.actions.moveFocusUp,
			copy.disabled.focusTopRow,
		],
		[
			"down",
			IconSquareArrowDown,
			copy.actions.moveFocusDown,
			copy.disabled.focusLastRow,
		],
		[
			"left",
			IconSquareArrowLeft,
			copy.actions.moveFocusLeft,
			copy.disabled.focusFirstColumn,
		],
		[
			"right",
			IconSquareArrowRight,
			copy.actions.moveFocusRight,
			copy.disabled.focusLastColumn,
		],
	] as const;

	// Labels, icons, and legends come from the shared presentation, so the
	// source menus draw the same command the same way (#433).
	const insert: TableAction[] = [];
	if (showRows) {
		// Inserting beside the header row still adds one data row, so the label
		// never reads as a count of zero.
		const insertCount = Math.max(1, rowCount);
		insert.push(
			{
				id: "insert-row-above",
				...tableCommand.insertRowAbove(insertCount),
				disabled: severalAreas,
				disabledReason: copy.disabled.singleAreaRequired,
				run: () => store.addRowAbove(),
			},
			{
				id: "insert-row-below",
				...tableCommand.insertRowBelow(insertCount),
				disabled: severalAreas,
				disabledReason: copy.disabled.singleAreaRequired,
				run: () => store.addRowBelow(),
			},
		);
	}
	if (showColumns) {
		insert.push(
			{
				id: "insert-column-left",
				...tableCommand.insertColumnLeft(columnCount),
				disabled: severalAreas,
				disabledReason: copy.disabled.singleAreaRequired,
				run: () => store.addColumnLeft(),
			},
			{
				id: "insert-column-right",
				...tableCommand.insertColumnRight(columnCount),
				disabled: severalAreas,
				disabledReason: copy.disabled.singleAreaRequired,
				run: () => store.addColumnRight(),
			},
		);
	}

	const clipboard: TableAction[] = [
		{
			id: "cut",
			...tableCommand.cut,
			run: () => void copySelectionToClipboard("cut"),
		},
		{
			id: "copy",
			...tableCommand.copy,
			run: () => void copySelectionToClipboard("copy"),
		},
		{
			id: "paste",
			...tableCommand.paste,
			disabled: severalAreas,
			disabledReason: copy.disabled.singleAreaRequired,
			run: () => void pasteFromClipboard(),
		},
	];

	// The document timeline, as Mod+Z and Mod+Shift+Z walk it from the grid,
	// which keeps no history of its own.
	const history: TableAction[] = [
		{
			id: "undo",
			...tableCommand.undo,
			disabled: store.past.length === 0,
			disabledReason: copy.disabled.undo,
			run: () => useTabeloStore.getState().undo(),
		},
		{
			id: "redo",
			...tableCommand.redo,
			disabled: store.future.length === 0,
			disabledReason: copy.disabled.redo,
			run: () => useTabeloStore.getState().redo(),
		},
	];

	const duplicatesColumns = showColumns && !showRows;
	const edit: TableAction[] = [
		{
			id: "duplicate",
			...(duplicatesColumns
				? tableCommand.duplicateColumns(columnCount)
				: tableCommand.duplicateRows(rowCount)),
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
			icon: IconEraser,
			shortcut: copy.shortcuts.clear,
			run: () => store.clearSelection(),
		},
	];

	const move: TableAction[] = [];
	if (showRows) {
		move.push(
			{
				id: "move-up",
				...tableCommand.moveUp,
				disabled: moveUpRefusal !== null,
				disabledReason:
					moveUpRefusal === null
						? undefined
						: moveRefusalMessage[moveUpRefusal],
				run: () => store.moveSelectedRow(-1),
			},
			{
				id: "move-down",
				...tableCommand.moveDown,
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
	const focus: TableAction[] =
		context.axis === "cell" || context.openedOnCell === true
			? focusDirections.map(([direction, icon, label, atEdge]) => {
					const target = neighbourCell(
						activeRange(selection).focus,
						direction,
						rows,
						columns,
					);
					return {
						id: `focus-${direction}`,
						label,
						icon,
						disabled: target === null,
						disabledReason: target === null ? atEdge : undefined,
						// No document operation and no history step: this moves the
						// focus and keeps the areas, which is exactly what the removed
						// chord did.
						run: () => {
							if (target) store.moveFocusKeepingRegions(target);
						},
					};
				})
			: [];

	if (showColumns) {
		move.push(
			{
				id: "move-left",
				...tableCommand.moveLeft,
				disabled: moveLeftRefusal !== null,
				disabledReason:
					moveLeftRefusal === null
						? undefined
						: moveRefusalMessage[moveLeftRefusal],
				run: () => store.moveSelectedColumn(-1),
			},
			{
				id: "move-right",
				...tableCommand.moveRight,
				disabled: moveRightRefusal !== null,
				disabledReason:
					moveRightRefusal === null
						? undefined
						: moveRefusalMessage[moveRightRefusal],
				run: () => store.moveSelectedColumn(1),
			},
		);
	}

	// Sorting reorders the document once by the column whose menu is open, so
	// there is nothing for a checked state to read back afterwards.
	const sortColumn = context.axis === "column" ? context.column : undefined;
	const sortReason =
		sortColumn === undefined ||
		document.columns[sortColumn] === undefined ||
		rows < 2
			? copy.disabled.sortSingleRow
			: undefined;
	const sortBy = (direction: SortDirection) => {
		if (sortColumn === undefined) return;
		const outcome = store.sortRowsByColumn(sortColumn, direction);
		if (outcome === "unavailable") return;
		store.announceStatus(
			outcome === "sorted"
				? copy.status.rowsSorted(useTabeloStore.getState().document.rows.length)
				: copy.status.rowsAlreadySorted,
		);
	};
	const sortType =
		sortColumn === undefined
			? undefined
			: document.columns[sortColumn]?.expectedType;
	const sort: TableAction[] =
		sortColumn === undefined
			? []
			: [
					{
						id: "sort-ascending",
						...tableCommand.sort("ascending", sortType),
						disabled: sortReason !== undefined,
						disabledReason: sortReason,
						keepsFocus: true,
						run: () => sortBy("ascending"),
					},
					{
						id: "sort-descending",
						...tableCommand.sort("descending", sortType),
						disabled: sortReason !== undefined,
						disabledReason: sortReason,
						keepsFocus: true,
						run: () => sortBy("descending"),
					},
				];

	const remove: TableAction[] = [];
	if (showRows) {
		remove.push({
			id: "delete-rows",
			...tableCommand.deleteRows(removableRowCount),
			danger: true,
			// A selection covering the header promotes rather than empties the
			// table, so the last-row guard has nothing to protect against there.
			disabled: !coversHeader && deletionGuard.wouldRemoveAllRows,
			disabledReason: copy.disabled.lastRemainingRow,
			run: () => store.removeSelectedRows(),
		});
	}
	if (showColumns) {
		remove.push({
			id: "delete-columns",
			...tableCommand.deleteColumns(columnCount),
			danger: true,
			disabled: deletionGuard.wouldRemoveAllColumns,
			disabledReason: copy.disabled.lastRemainingColumn,
			run: () => store.removeSelectedColumns(),
		});
	}

	return orderMenuGroups<TableActionGroup>([
		{ id: "clipboard", actions: clipboard },
		{ id: "history", actions: history },
		{ id: "insert", actions: insert },
		{
			id: "edit",
			label: copy.actions.edit,
			labelId: "table-actions-edit-label",
			actions: edit,
		},
		{
			id: "move",
			label: tableCommandGroup.move.label,
			submenu: { icon: tableCommandGroup.move.icon },
			actions: move,
		},
		{
			id: "sort",
			label: tableCommandGroup.sort.label,
			submenu: { icon: tableCommandGroup.sort.icon },
			actions: sort,
		},
		{
			id: "fill",
			label: copy.actions.fill,
			submenu: { icon: IconBucketDroplet },
			actions: fill,
		},
		{
			id: "focus",
			label: copy.actions.moveFocus,
			submenu: { icon: IconFocusCentered },
			actions: focus,
		},
		{ id: "remove", actions: remove },
	]);
}
