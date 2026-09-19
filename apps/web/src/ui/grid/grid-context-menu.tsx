import {
	ContextMenu,
	ContextMenuCheckboxItem,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuRadioGroup,
	ContextMenuSegmentedItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@tabelo/ui/components/context-menu";
import { segmentedGroupStyles } from "@tabelo/ui/components/menu-styles";
import { cn } from "@tabelo/ui/lib/utils";
import {
	IconAlignCenter,
	IconAlignJustified,
	IconAlignLeft,
	IconAlignRight,
	IconArrowsHorizontal,
	IconPin,
	IconRuler,
	IconSortAscending,
	IconSortDescending,
	IconTextWrap,
} from "@tabler/icons-react";
import {
	Fragment,
	type ReactNode,
	type RefObject,
	useId,
	useRef,
	useState,
} from "react";
import { copy } from "@/copy/copy";
import { cellValueType, readCell } from "@/core/cell-value";
import type { SortDirection } from "@/core/operations";
import {
	activeRange,
	type CellPosition,
	type GridSelection,
} from "@/core/selection";
import { convertCellValue } from "@/core/typed-input";
import type {
	Alignment,
	CellValueType,
	ExpectedColumnType,
} from "@/core/types";
import { useTabeloStore } from "@/state/store";
import { ControlTooltip } from "@/ui/primitives/control-tooltip";
import { isSameColumnWidth } from "@/workspace/column-width";
import type { PinnedGridAxis } from "@/workspace/layout";
import {
	CellTypeChangeDialog,
	type PendingCellTypeChange,
} from "./cell-type-change-dialog";
import { cellTypeOptions, expectedTypeOptions } from "./cell-type-options";
import { measureColumnFitWidth } from "./column-fit";
import { targetAxisForMenu, targetCellForMenu } from "./menu-target";
import { revealGridCell } from "./reveal-cell";
import {
	buildTableActions,
	type TableAction,
	type TableActionContext,
} from "./table-actions";

// One context menu for the whole grid rather than one per cell. Mounting a
// menu on every cell of a 200-row table would be wasteful, and the axis the
// user clicked is enough to decide what the menu should offer.
//
// It is the grid's only menu (#288). The row and column options that used to
// live behind a chevron beside every number and letter are here, so removing
// those triggers lost no capability: right-click, `Shift`+`F10`, and the
// `ContextMenu` key all reach the same list.

type ContextAxis = TableActionContext["axis"];

// What the menu was opened on. The index names the row or column an axis menu
// acts on; a cell menu acts on the selection and needs none.
interface MenuTarget {
	readonly axis: ContextAxis;
	readonly index: number;
}

const alignments: {
	value: Alignment;
	label: string;
	icon: typeof IconAlignLeft;
}[] = [
	{
		value: "default",
		label: copy.actions.alignDefault,
		icon: IconAlignJustified,
	},
	{ value: "left", label: copy.actions.alignLeft, icon: IconAlignLeft },
	{ value: "center", label: copy.actions.alignCenter, icon: IconAlignCenter },
	{ value: "right", label: copy.actions.alignRight, icon: IconAlignRight },
];

// The first data row and the first data column on their own axes. The header
// row is row -1 and already sticky, so the first row a pin can reach is the
// first data one, and both axes count their data from zero.
const FIRST_DATA_INDEX = 0;

// The menu's accessible name. A column names itself by its header, falling
// back to its index-strip letter when it has none, so the menu of an unnamed
// column is still identifiable. A cell menu keeps no name of its own.
function menuLabel(
	target: MenuTarget,
	header: string,
	expectedType?: ExpectedColumnType,
): string | undefined {
	if (target.axis === "column") {
		return `${copy.actions.columnActions}: ${copy.a11y.columnWithExpectedType(header, target.index, expectedType ?? "text")}`;
	}
	if (target.axis === "row") {
		return `${copy.actions.rowActions}: ${copy.a11y.rowNumber(target.index)}`;
	}
	return undefined;
}

// The axis a keyboard-opened menu acts on. There is no click target to read,
// so the selection decides: whole rows offer row actions, whole columns offer
// column actions, and anything else is a cell menu.
function targetFromSelection(): MenuTarget {
	const range = activeRange(useTabeloStore.getState().selection);
	if (range.mode === "row") return { axis: "row", index: range.focus.row };
	if (range.mode === "column") {
		return { axis: "column", index: range.focus.column };
	}
	return { axis: "cell", index: 0 };
}

// One checkbox item for both axes. `closeOnClick={false}` matches the wrap
// toggle beside it: the menu stays open so the effect is visible while the
// item reads back its own new checked state.
function PinAxisItem({ axis }: { readonly axis: PinnedGridAxis }) {
	const pinned = useTabeloStore((state) =>
		axis === "row"
			? state.workspace.pinFirstDataRow
			: state.workspace.pinFirstDataColumn,
	);
	return (
		<ContextMenuCheckboxItem
			checked={pinned}
			closeOnClick={false}
			onCheckedChange={(next) =>
				useTabeloStore.getState().setPinnedAxis(axis, next)
			}
		>
			<IconPin aria-hidden />
			{axis === "row" ? copy.actions.pinFirstRow : copy.actions.pinFirstColumn}
		</ContextMenuCheckboxItem>
	);
}

// The column-only part of the menu: expected type, alignment, width, wrap,
// pin, and sort. Only ever rendered while the menu is open on a column, and
// keyed by that column, so the fit width is measured once per opening.
//
// None of these moves the focused cell, so closing the menu after one hands
// focus back to wherever the menu was opened from, the letter included.
function ColumnMenuGroups({
	index,
	tableRef,
	zoom,
	onSetColumnWidth,
}: {
	readonly index: number;
	readonly tableRef: RefObject<HTMLTableElement | null>;
	readonly zoom: number;
	readonly onSetColumnWidth: (index: number) => void;
}) {
	const column = useTabeloStore((state) => state.document.columns[index]);
	const wrapped = useTabeloStore((state) =>
		column ? state.workspace.wrappedColumns.includes(column.id) : false,
	);
	const currentWidth = useTabeloStore((state) =>
		column ? state.workspace.columnWidths[column.id] : undefined,
	);
	const [fitWidth] = useState(() => {
		const table = tableRef.current;
		return table ? measureColumnFitWidth(table, index, zoom) : undefined;
	});
	const fitReason =
		!column || fitWidth === undefined
			? copy.disabled.columnFitUnavailable
			: wrapped
				? copy.disabled.fitWrappedColumn
				: isSameColumnWidth(currentWidth, fitWidth)
					? copy.disabled.columnAlreadyFitted
					: undefined;

	return (
		<>
			<ContextMenuRadioGroup
				aria-labelledby="column-expected-type-label"
				value={column?.expectedType ?? "text"}
				onValueChange={(next) =>
					useTabeloStore
						.getState()
						.setColumnExpectedType(index, next as ExpectedColumnType)
				}
			>
				<ContextMenuLabel id="column-expected-type-label">
					{copy.actions.expectedType}
				</ContextMenuLabel>
				<div className={cn(segmentedGroupStyles, "mx-1 mb-1")}>
					{expectedTypeOptions.map((option) => (
						<ContextMenuSegmentedItem key={option.value} value={option.value}>
							<option.icon aria-hidden />
							{option.label}
						</ContextMenuSegmentedItem>
					))}
				</div>
			</ContextMenuRadioGroup>
			<ColumnAlignmentGroup index={index} align={column?.align} />
			<ContextMenuSeparator />

			<ContextMenuGroup>
				<ControlTooltip reason={fitReason}>
					<ContextMenuItem
						disabled={fitReason !== undefined}
						onClick={() => {
							if (fitWidth === undefined) return;
							useTabeloStore.getState().resizeColumn(index, fitWidth);
						}}
					>
						<IconArrowsHorizontal aria-hidden />
						{copy.actions.fitColumnToContent}
					</ContextMenuItem>
				</ControlTooltip>
				<ContextMenuItem onClick={() => onSetColumnWidth(index)}>
					<IconRuler aria-hidden />
					{copy.actions.setColumnWidth}
				</ContextMenuItem>
				<ContextMenuCheckboxItem
					checked={wrapped}
					closeOnClick={false}
					onCheckedChange={() => {
						if (column) useTabeloStore.getState().toggleColumnWrap(column.id);
					}}
				>
					<IconTextWrap aria-hidden />
					{copy.actions.wrapColumnText}
				</ContextMenuCheckboxItem>
				{/* Only the first data column can be pinned, so only its own menu
				    carries the control. Offering it from every menu would ask the
				    reader of column D's menu to work out which column it means. */}
				{index === FIRST_DATA_INDEX ? <PinAxisItem axis="column" /> : null}
			</ContextMenuGroup>
			<ContextMenuSeparator />

			<ColumnSortGroup index={index} />
			<ContextMenuSeparator />
		</>
	);
}

// Two immediate commands rather than a submenu or a stored choice: sorting
// reorders the document once, so there is no state for a radio group to read
// back and nothing stays applied afterwards. They sit beside alignment because
// both are column-shaped, and both act on the column whose menu is open.
function ColumnSortGroup({ index }: { readonly index: number }) {
	const rowCount = useTabeloStore((state) => state.document.rows.length);
	const missing = useTabeloStore(
		(state) => state.document.columns[index] === undefined,
	);
	const reason =
		missing || rowCount < 2 ? copy.disabled.sortSingleRow : undefined;

	const sort = (direction: SortDirection) => {
		const store = useTabeloStore.getState();
		const outcome = store.sortRowsByColumn(index, direction);
		if (outcome === "unavailable") return;
		store.announceStatus(
			outcome === "sorted"
				? copy.status.rowsSorted(useTabeloStore.getState().document.rows.length)
				: copy.status.rowsAlreadySorted,
		);
	};

	return (
		<ContextMenuGroup>
			<ControlTooltip reason={reason}>
				<ContextMenuItem
					disabled={reason !== undefined}
					onClick={() => sort("ascending")}
				>
					<IconSortAscending aria-hidden />
					{copy.actions.sortAscending}
				</ContextMenuItem>
			</ControlTooltip>
			<ControlTooltip reason={reason}>
				<ContextMenuItem
					disabled={reason !== undefined}
					onClick={() => sort("descending")}
				>
					<IconSortDescending aria-hidden />
					{copy.actions.sortDescending}
				</ContextMenuItem>
			</ControlTooltip>
		</ContextMenuGroup>
	);
}

// Four immediate choices laid side by side, the same segmented drawing as the
// expected type above them. Each segment is an icon with its full name as its
// accessible name, and the radio semantics read the checked value from the
// column rather than the last click (2026-09-19, replacing the submenu).
function ColumnAlignmentGroup({
	index,
	align,
}: {
	readonly index: number;
	readonly align?: Alignment;
}) {
	return (
		<ContextMenuRadioGroup
			aria-labelledby="column-alignment-label"
			value={align ?? "default"}
			onValueChange={(next) =>
				useTabeloStore.getState().setColumnAlignment(index, next as Alignment)
			}
		>
			<ContextMenuLabel id="column-alignment-label">
				{copy.actions.alignment}
			</ContextMenuLabel>
			<div className={cn(segmentedGroupStyles, "mx-1 mb-1")}>
				{alignments.map((option) => (
					<ControlTooltip key={option.value} name={option.label}>
						<ContextMenuSegmentedItem
							value={option.value}
							aria-label={option.label}
						>
							<option.icon aria-hidden />
						</ContextMenuSegmentedItem>
					</ControlTooltip>
				))}
			</div>
		</ContextMenuRadioGroup>
	);
}

function singleSelectedCell(selection: GridSelection): CellPosition | null {
	if (selection.ranges.length !== 1) return null;
	const range = activeRange(selection);
	if (
		range.mode !== "cell" ||
		range.focus.row < 0 ||
		range.anchor.row !== range.focus.row ||
		range.anchor.column !== range.focus.column
	) {
		return null;
	}
	return range.focus;
}

function CellTypeMenuGroup({
	onConfirmChange,
}: {
	// A change the core says to confirm first goes here instead of running.
	readonly onConfirmChange: (change: PendingCellTypeChange) => void;
}) {
	const labelId = useId();
	const document = useTabeloStore((state) => state.document);
	const selection = useTabeloStore((state) => state.selection);
	const target = singleSelectedCell(selection);
	const column = target ? document.columns[target.column] : undefined;
	const row = target ? document.rows[target.row] : undefined;
	const value = row && column ? readCell(row, column.id) : undefined;
	const currentType = value === undefined ? undefined : cellValueType(value);

	return (
		<ContextMenuRadioGroup
			aria-labelledby={labelId}
			value={currentType ?? ""}
			onValueChange={(next) => {
				if (!target || value === undefined) return;
				const type = next as CellValueType;
				const change = convertCellValue(value, type);
				if (change.ok && change.confirm) {
					onConfirmChange({
						position: target,
						target: type,
						before: value,
						after: change.value,
						confirm: change.confirm,
					});
					return;
				}
				useTabeloStore.getState().setCellType(target.row, target.column, type);
			}}
		>
			<ContextMenuLabel id={labelId}>{copy.actions.cellType}</ContextMenuLabel>
			<div className={cn(segmentedGroupStyles, "mx-1 mb-1")}>
				{cellTypeOptions.map((option) => {
					const unavailable =
						value === undefined || !convertCellValue(value, option.value).ok;
					const reason =
						value === undefined
							? copy.disabled.singleCellRequired
							: unavailable
								? copy.disabled.cellTypeConversion(option.label)
								: undefined;
					return (
						<ControlTooltip key={option.value} reason={reason}>
							<ContextMenuSegmentedItem
								value={option.value}
								disabled={reason !== undefined}
								aria-description={reason}
							>
								<option.icon aria-hidden />
								{option.label}
							</ContextMenuSegmentedItem>
						</ControlTooltip>
					);
				})}
			</div>
		</ContextMenuRadioGroup>
	);
}

export function GridContextMenu({
	children,
	wrapperRef,
	tableRef,
	zoom,
	onSetColumnWidth,
}: {
	readonly children: ReactNode;
	// The grid surface: the positioned box holding the column index strip and the
	// semantic table. The drop indicator measures and draws against it, because a
	// table cannot hold a non-table child and because it scrolls with the table,
	// so the indicator needs no scroll arithmetic of its own. It is also what
	// makes the strip's controls part of the grid for hit testing, now that they
	// sit beside the table rather than inside it.
	readonly wrapperRef: RefObject<HTMLDivElement | null>;
	// The semantic table, which Fit column to content measures, and the pane
	// zoom its rendered content is drawn at.
	readonly tableRef: RefObject<HTMLTableElement | null>;
	readonly zoom: number;
	// A command that opens a surface the menu cannot hold (#370).
	readonly onSetColumnWidth: (index: number) => void;
}) {
	const [target, setTarget] = useState<MenuTarget>({ axis: "cell", index: 0 });
	const { axis } = target;
	const column = useTabeloStore((state) =>
		target.axis === "column" ? state.document.columns[target.index] : undefined,
	);
	// A Cell type change waiting for the user's confirmation (#371). The last
	// position outlives it, so focus can go back to that cell once the dialog
	// has closed.
	const [pendingChange, setPendingChange] =
		useState<PendingCellTypeChange | null>(null);
	const changedCell = useRef<CellPosition | null>(null);
	const requestChange = (change: PendingCellTypeChange) => {
		changedCell.current = change.position;
		setPendingChange(change);
	};

	// Whether this opening of the menu ended in one of its own commands. Only
	// then does the grid take focus back explicitly; a dismissal is somebody
	// else's business, and stealing focus from whatever the user pressed
	// instead would send their next keystroke into a cell.
	const commandRan = useRef(false);
	const markCommand = () => {
		commandRan.current = true;
	};

	// Set for the one synthetic event the keyboard chords dispatch, so the
	// capture handler below knows there is no click target to read.
	const openedByKeyboard = useRef(false);

	// Where focus lands when a command closes the menu. The grid's own
	// focus-following effect deliberately stands down while a menu owns focus,
	// so an action that moved the focused cell would otherwise leave DOM focus
	// on the trigger and the new cell possibly out of view. Returning the cell
	// hands both back: the keyboard path to Move focus, keep selection is only
	// a keyboard path if the grid is focused again afterwards.
	const finalFocus = () => {
		// `true` is the primitive's own behaviour, which is what a dismissal
		// keeps: this component adds a destination, it does not take one away.
		if (!commandRan.current) return true;
		const surface = wrapperRef.current;
		if (!surface) return true;
		const { focus } = activeRange(useTabeloStore.getState().selection);
		const cell = surface.querySelector<HTMLElement>(
			`[data-cell="${focus.row}:${focus.column}"]`,
		);
		if (!cell) return true;
		// Revealed once focus has actually moved, because the browser scrolls
		// on focus too and the later scroll is the one that wins. Clear of the
		// sticky chrome is the grid's contract, not merely on screen.
		requestAnimationFrame(() => {
			if (cell.isConnected) revealGridCell(surface, cell, focus);
		});
		return cell;
	};

	const item = (action: TableAction) => (
		<ControlTooltip
			key={action.id}
			reason={action.disabled ? action.disabledReason : undefined}
		>
			<ContextMenuItem
				disabled={action.disabled}
				variant={action.danger ? "destructive" : "default"}
				onClick={() => {
					markCommand();
					action.run();
				}}
			>
				<action.icon aria-hidden />
				{action.label}
				{action.shortcut ? (
					<ContextMenuShortcut>{action.shortcut}</ContextMenuShortcut>
				) : null}
			</ContextMenuItem>
		</ControlTooltip>
	);

	return (
		<>
			<ContextMenu
				onOpenChange={(open) => {
					if (open) commandRan.current = false;
				}}
			>
				<ContextMenuTrigger
					render={
						<div
							ref={wrapperRef}
							data-grid-surface
							className="relative min-w-max"
						/>
					}
					onKeyDown={(event: React.KeyboardEvent) => {
						// The platform's own menu chords, and the keyboard equal of
						// right-click now that no row or column carries a menu trigger
						// (#288). A text field keeps them: the cell editor is a native
						// text control, and its own menu is the one that belongs there.
						const chord =
							event.key === "ContextMenu" ||
							(event.key === "F10" && event.shiftKey);
						if (!chord || event.altKey || event.ctrlKey || event.metaKey) {
							return;
						}
						const origin = event.target;
						if (
							!(origin instanceof HTMLElement) ||
							origin instanceof HTMLTextAreaElement ||
							origin instanceof HTMLInputElement
						) {
							return;
						}
						// Stops the browser raising its own menu for the same chord,
						// where it does so on keydown.
						event.preventDefault();
						// A `contextmenu` event on the focused element, anchored to its
						// box, so the primitive's own positioning and the targeting below
						// are reused rather than repeated for the keyboard.
						const box = origin.getBoundingClientRect();
						openedByKeyboard.current = true;
						origin.dispatchEvent(
							new MouseEvent("contextmenu", {
								bubbles: true,
								cancelable: true,
								button: 2,
								clientX: box.left,
								clientY: box.bottom,
							}),
						);
						openedByKeyboard.current = false;
					}}
					onContextMenuCapture={(event: React.MouseEvent) => {
						const element = event.target as HTMLElement | null;
						const fromKeyboard = openedByKeyboard.current;

						// Right-clicking outside the current selection moves it there
						// first, so the menu always acts on what was clicked.
						const cell = element?.closest<HTMLElement>("[data-cell]");
						const rowHeader =
							element?.closest<HTMLElement>("[data-row-header]");
						const columnHeader = element?.closest<HTMLElement>(
							"[data-column-header]",
						);

						if (columnHeader) {
							const index = Number(columnHeader.dataset.columnHeader);
							setTarget({ axis: "column", index });
							targetAxisForMenu("column", index);
							return;
						}
						if (rowHeader) {
							const index = Number(rowHeader.dataset.rowHeader);
							setTarget({ axis: "row", index });
							targetAxisForMenu("row", index);
							return;
						}
						if (cell) {
							const [row, column] = (cell.dataset.cell ?? "0:0")
								.split(":")
								.map(Number);
							targetCellForMenu(row ?? 0, column ?? 0);
							// A pointer names its own target; the keyboard has only the
							// selection, so a selected row or column yields its axis menu.
							setTarget(
								fromKeyboard
									? targetFromSelection()
									: { axis: "cell", index: 0 },
							);
							return;
						}
						setTarget({ axis: "cell", index: 0 });
					}}
				>
					{children}
				</ContextMenuTrigger>

				<ContextMenuContent
					className="w-auto min-w-56"
					finalFocus={finalFocus}
					aria-label={menuLabel(
						target,
						column?.header ?? "",
						column?.expectedType,
					)}
				>
					{axis === "cell" ? (
						<>
							<CellTypeMenuGroup onConfirmChange={requestChange} />
							<ContextMenuSeparator />
						</>
					) : null}
					{axis === "column" ? (
						<ColumnMenuGroups
							key={target.index}
							index={target.index}
							tableRef={tableRef}
							zoom={zoom}
							onSetColumnWidth={onSetColumnWidth}
						/>
					) : null}
					{axis === "row" && target.index === FIRST_DATA_INDEX ? (
						<>
							<ContextMenuGroup>
								<PinAxisItem axis="row" />
							</ContextMenuGroup>
							<ContextMenuSeparator />
						</>
					) : null}
					{buildTableActions({ axis }).map((group, index) => (
						<Fragment key={group.id}>
							{index > 0 ? <ContextMenuSeparator /> : null}
							{group.submenu && group.label ? (
								<ContextMenuGroup>
									<ContextMenuSub>
										<ContextMenuSubTrigger>
											<group.submenu.icon aria-hidden />
											{group.label}
										</ContextMenuSubTrigger>
										<ContextMenuSubContent
											aria-label={group.label}
											// A command chosen here closes the whole menu, so it
											// hands focus back the way a first-level one does.
											finalFocus={finalFocus}
										>
											{group.actions.map(item)}
										</ContextMenuSubContent>
									</ContextMenuSub>
								</ContextMenuGroup>
							) : (
								<ContextMenuGroup aria-labelledby={group.labelId}>
									{group.label && group.labelId ? (
										<ContextMenuLabel id={group.labelId}>
											{group.label}
										</ContextMenuLabel>
									) : null}
									{group.actions.map(item)}
								</ContextMenuGroup>
							)}
						</Fragment>
					))}
				</ContextMenuContent>
			</ContextMenu>
			<CellTypeChangeDialog
				change={pendingChange}
				onCancel={() => setPendingChange(null)}
				onConfirm={(change) => {
					useTabeloStore
						.getState()
						.setCellType(
							change.position.row,
							change.position.column,
							change.target,
						);
					setPendingChange(null);
				}}
				finalFocus={() => {
					const position = changedCell.current;
					return position
						? (wrapperRef.current?.querySelector<HTMLElement>(
								`[data-cell="${position.row}:${position.column}"]`,
							) ?? null)
						: null;
				}}
			/>
		</>
	);
}
