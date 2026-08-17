import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuRadioGroup,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuTrigger,
} from "@tabelo/ui/components/context-menu";
import {
	Fragment,
	type ReactNode,
	type RefObject,
	useId,
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
import { DisabledTooltip } from "@/ui/primitives/disabled-tooltip";
import { cellTypeOptions } from "./cell-type-options";
import { targetAxisForMenu, targetCellForMenu } from "./menu-target";
import { buildTableActions, type TableActionContext } from "./table-actions";

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

	return (
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
			<ContextMenuLabel id={labelId}>{copy.actions.cellType}</ContextMenuLabel>
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
						availability={reason ? { kind: "unavailable", reason } : undefined}
					/>
				);
			})}
		</ContextMenuRadioGroup>
	);
}

export function GridContextMenu({
	children,
	wrapperRef,
}: {
	readonly children: ReactNode;
	// The positioned box the drop indicator measures and draws against. It is
	// this element rather than the table because a table cannot hold a non-table
	// child, and because it scrolls with the table, so the indicator needs no
	// scroll arithmetic of its own.
	readonly wrapperRef?: RefObject<HTMLDivElement | null>;
}) {
	const [axis, setAxis] = useState<ContextAxis>("cell");

	return (
		<ContextMenu>
			<ContextMenuTrigger
				render={<div ref={wrapperRef} className="relative min-w-max" />}
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

			<ContextMenuContent className="w-auto min-w-56">
				{axis === "cell" ? (
					<>
						<CellTypeMenuGroup />
						<ContextMenuSeparator />
					</>
				) : null}
				{buildTableActions({ axis }).map((group, index) => (
					<Fragment key={group.id}>
						{index > 0 ? <ContextMenuSeparator /> : null}
						<ContextMenuGroup aria-labelledby={group.labelId}>
							{group.label && group.labelId ? (
								<ContextMenuLabel id={group.labelId}>
									{group.label}
								</ContextMenuLabel>
							) : null}
							{group.actions.map((action) => (
								<DisabledTooltip
									key={action.id}
									reason={action.disabled ? action.disabledReason : undefined}
								>
									<ContextMenuItem
										disabled={action.disabled}
										variant={action.danger ? "destructive" : "default"}
										onClick={action.run}
									>
										<action.icon aria-hidden />
										{action.label}
										{action.shortcut ? (
											<ContextMenuShortcut>
												{action.shortcut}
											</ContextMenuShortcut>
										) : null}
									</ContextMenuItem>
								</DisabledTooltip>
							))}
						</ContextMenuGroup>
					</Fragment>
				))}
			</ContextMenuContent>
		</ContextMenu>
	);
}
