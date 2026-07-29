import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuTrigger,
} from "@tabelo/ui/components/context-menu";
import { Fragment, type ReactNode, useState } from "react";
import { useTabeloStore } from "@/state/store";
import { DisabledTooltip } from "@/ui/primitives/disabled-tooltip";
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
					const store = useTabeloStore.getState();

					if (columnHeader) {
						const column = Number(columnHeader.dataset.columnHeader);
						setAxis("column");
						store.selectCell({ row: 0, column }, "column");
						return;
					}
					if (rowHeader) {
						const row = Number(rowHeader.dataset.rowHeader);
						setAxis("row");
						store.selectCell({ row, column: 0 }, "row");
						return;
					}
					if (cell) {
						const [row, column] = (cell.dataset.cell ?? "0:0")
							.split(":")
							.map(Number);
						setAxis("cell");
						const rect = {
							top: Math.min(
								store.selection.anchor.row,
								store.selection.focus.row,
							),
							bottom: Math.max(
								store.selection.anchor.row,
								store.selection.focus.row,
							),
							left: Math.min(
								store.selection.anchor.column,
								store.selection.focus.column,
							),
							right: Math.max(
								store.selection.anchor.column,
								store.selection.focus.column,
							),
						};
						const inside =
							row >= rect.top &&
							row <= rect.bottom &&
							column >= rect.left &&
							column <= rect.right;
						if (!inside) store.selectCell({ row, column });
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
										<ContextMenuShortcut>{action.shortcut}</ContextMenuShortcut>
									) : null}
								</ContextMenuItem>
							</DisabledTooltip>
						))}
					</Fragment>
				))}
			</ContextMenuContent>
		</ContextMenu>
	);
}
