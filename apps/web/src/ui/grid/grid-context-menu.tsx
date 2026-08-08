import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuTrigger,
} from "@tabelo/ui/components/context-menu";
import { Fragment, type ReactNode, useState } from "react";
import { DisabledTooltip } from "@/ui/primitives/disabled-tooltip";
import { targetAxisForMenu, targetCellForMenu } from "./menu-target";
import { buildTableActions, type TableActionContext } from "./table-actions";

// One context menu for the whole grid rather than one per cell. Mounting a
// menu on every cell of a 200-row table would be wasteful, and the axis the
// user clicked is enough to decide what the menu should offer.

export type ContextAxis = TableActionContext["axis"];

export function GridContextMenu({
	children,
}: {
	readonly children: ReactNode;
}) {
	const [axis, setAxis] = useState<ContextAxis>("cell");

	return (
		<ContextMenu>
			<ContextMenuTrigger
				render={<div className="min-w-max" />}
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
