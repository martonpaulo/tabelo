import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuRadioGroup,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@tabelo/ui/components/context-menu";
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
import {
	activeRange,
	type CellPosition,
	type GridSelection,
} from "@/core/selection";
import { convertCellValue } from "@/core/typed-input";
import type { CellValueType } from "@/core/types";
import { useTabeloStore } from "@/state/store";
import { ContextMenuSelectionOption } from "@/ui/primitives/context-menu-selection-option";
import { ControlTooltip } from "@/ui/primitives/control-tooltip";
import { cellTypeOptions } from "./cell-type-options";
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

export type ContextAxis = TableActionContext["axis"];

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

function CellTypeMenuGroup() {
	const labelId = useId();
	const document = useTabeloStore((state) => state.document);
	const selection = useTabeloStore((state) => state.selection);
	const target = singleSelectedCell(selection);
	const column = target ? document.columns[target.column] : undefined;
	const row = target ? document.rows[target.row] : undefined;
	const value = row && column ? readCell(row, column.id) : undefined;
	const currentType = value === undefined ? undefined : cellValueType(value);
	// The trigger wears the current type's icon, so the first level still says
	// which type the cell holds, as the Alignment submenu does for a column.
	const TriggerIcon = (
		cellTypeOptions.find((option) => option.value === currentType) ??
		cellTypeOptions[0]
	)?.icon;

	return (
		<ContextMenuSub>
			<ContextMenuSubTrigger>
				{TriggerIcon ? <TriggerIcon aria-hidden /> : null}
				<span id={labelId}>{copy.actions.cellType}</span>
			</ContextMenuSubTrigger>
			<ContextMenuSubContent aria-label={copy.actions.cellType}>
				<ContextMenuRadioGroup
					aria-labelledby={labelId}
					value={currentType ?? ""}
					onValueChange={(next) => {
						if (target) {
							useTabeloStore
								.getState()
								.setCellType(target.row, target.column, next as CellValueType);
						}
					}}
				>
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
							<ContextMenuSelectionOption
								key={option.value}
								value={option.value}
								icon={<option.icon />}
								label={option.label}
								availability={
									reason ? { kind: "unavailable", reason } : undefined
								}
							/>
						);
					})}
				</ContextMenuRadioGroup>
			</ContextMenuSubContent>
		</ContextMenuSub>
	);
}

export function GridContextMenu({
	children,
	wrapperRef,
}: {
	readonly children: ReactNode;
	// The grid surface: the positioned box holding the column index strip and the
	// semantic table. The drop indicator measures and draws against it, because a
	// table cannot hold a non-table child and because it scrolls with the table,
	// so the indicator needs no scroll arithmetic of its own. It is also what
	// makes the strip's controls part of the grid for hit testing, now that they
	// sit beside the table rather than inside it.
	readonly wrapperRef?: RefObject<HTMLDivElement | null>;
}) {
	const [axis, setAxis] = useState<ContextAxis>("cell");

	// Whether this opening of the menu ended in one of its own commands. Only
	// then does the grid take focus back explicitly; a dismissal is somebody
	// else's business, and stealing focus from whatever the user pressed
	// instead would send their next keystroke into a cell.
	const commandRan = useRef(false);

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
		const surface = wrapperRef?.current;
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
					commandRan.current = true;
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
				onContextMenuCapture={(event: React.MouseEvent) => {
					const target = event.target as HTMLElement | null;

					// Right-clicking outside the current selection moves it there
					// first, so the menu always acts on what was clicked.
					const cell = target?.closest<HTMLElement>("[data-cell]");
					const rowHeader = target?.closest<HTMLElement>("[data-row-header]");
					const columnHeader = target?.closest<HTMLElement>(
						"[data-column-header]",
					);

					if (columnHeader) {
						setAxis("column");
						targetAxisForMenu(
							"column",
							Number(columnHeader.dataset.columnHeader),
						);
						return;
					}
					if (rowHeader) {
						setAxis("row");
						targetAxisForMenu("row", Number(rowHeader.dataset.rowHeader));
						return;
					}
					if (cell) {
						const [row, column] = (cell.dataset.cell ?? "0:0")
							.split(":")
							.map(Number);
						setAxis("cell");
						targetCellForMenu(row ?? 0, column ?? 0);
						return;
					}
					setAxis("cell");
				}}
			>
				{children}
			</ContextMenuTrigger>

			<ContextMenuContent className="w-auto min-w-56" finalFocus={finalFocus}>
				{axis === "cell" ? (
					<>
						<CellTypeMenuGroup />
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
	);
}
