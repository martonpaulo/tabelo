import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@tabelo/ui/components/dropdown-menu";
import {
	AlignCenter,
	AlignJustify,
	AlignLeft,
	AlignRight,
	ChevronDown,
	ChevronsLeftRight,
	ChevronsRightLeft,
	MoreVertical,
	RotateCcw,
} from "lucide-react";
import { Fragment } from "react";
import type { Alignment } from "@/core/types";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import {
	atMinimumColumnWidth,
	isDefaultColumnWidth,
	resolveColumnWidth,
	stepColumnWidth,
} from "./column-width";
import { buildTableActions } from "./table-actions";

// One menu component for both axes, replacing the near-identical row and column
// menus that were drifting apart. Everything it offers comes from the shared
// action list; alignment is the single column-only addition, because it is the
// one operation that belongs to a column rather than to a selection.

const alignments: {
	value: Alignment;
	label: string;
	icon: typeof AlignLeft;
}[] = [
	{ value: "default", label: copy.actions.alignDefault, icon: AlignJustify },
	{ value: "left", label: copy.actions.alignLeft, icon: AlignLeft },
	{ value: "center", label: copy.actions.alignCenter, icon: AlignCenter },
	{ value: "right", label: copy.actions.alignRight, icon: AlignRight },
];

interface AxisMenuProps {
	readonly axis: "row" | "column";
	readonly index: number;
}

export function AxisMenu({ axis, index }: AxisMenuProps) {
	const document = useTabeloStore((state) => state.document);
	const column = axis === "column" ? document.columns[index] : undefined;

	const select = () =>
		useTabeloStore
			.getState()
			.selectCell(
				axis === "column"
					? { row: 0, column: index }
					: { row: index, column: 0 },
				axis,
			);

	const label =
		axis === "column"
			? `${copy.actions.columnActions}: ${column?.header ?? ""}`
			: `${copy.actions.rowActions}: ${copy.a11y.rowNumber(index)}`;

	const Icon = axis === "column" ? ChevronDown : MoreVertical;
	const groupClass =
		axis === "column"
			? "group-hover/col:opacity-100"
			: "group-hover/row:opacity-100";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label={label}
				className={`inline-flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-accent-foreground focus-visible:opacity-100 data-popup-open:opacity-100 ${groupClass}`}
				onClick={select}
			>
				<Icon aria-hidden className="size-3.5" />
			</DropdownMenuTrigger>

			<DropdownMenuContent
				align={axis === "column" ? "end" : "start"}
				className="w-auto min-w-56"
			>
				{axis === "column" ? (
					<>
						<DropdownMenuGroup>
							{/* The drag handle is a pointer affordance; this is the same
							    change without one. The label carries the current width so
							    stepping can be heard as well as seen. */}
							<DropdownMenuLabel aria-live="polite">
								{copy.actions.columnWidth(resolveColumnWidth(column?.width))}
							</DropdownMenuLabel>
							<DropdownMenuItem
								closeOnClick={false}
								disabled={atMinimumColumnWidth(column?.width)}
								onClick={() =>
									useTabeloStore
										.getState()
										.resizeColumn(index, stepColumnWidth(column?.width, -1))
								}
							>
								<ChevronsRightLeft aria-hidden />
								{copy.actions.narrowColumn}
							</DropdownMenuItem>
							<DropdownMenuItem
								closeOnClick={false}
								disabled={isDefaultColumnWidth(column?.width)}
								onClick={() =>
									useTabeloStore.getState().resizeColumn(index, undefined)
								}
							>
								<RotateCcw aria-hidden />
								{copy.actions.resetColumnWidth}
							</DropdownMenuItem>
							<DropdownMenuItem
								closeOnClick={false}
								onClick={() =>
									useTabeloStore
										.getState()
										.resizeColumn(index, stepColumnWidth(column?.width, 1))
								}
							>
								<ChevronsLeftRight aria-hidden />
								{copy.actions.widenColumn}
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />

						{/* A column has one alignment, so these are radio items rather
						    than a tinted background that only a sighted user can read. */}
						<DropdownMenuRadioGroup
							value={column?.align ?? "default"}
							onValueChange={(next) =>
								useTabeloStore
									.getState()
									.setColumnAlignment(index, next as Alignment)
							}
						>
							<DropdownMenuLabel>{copy.actions.alignment}</DropdownMenuLabel>
							{alignments.map((option) => (
								<DropdownMenuRadioItem
									key={option.value}
									value={option.value}
									closeOnClick
								>
									<option.icon aria-hidden />
									{option.label}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
						<DropdownMenuSeparator />
					</>
				) : null}

				{buildTableActions({ axis }).map((group, groupIndex) => (
					<Fragment key={group.id}>
						{groupIndex > 0 ? <DropdownMenuSeparator /> : null}
						{group.actions.map((action) => (
							<DropdownMenuItem
								key={action.id}
								disabled={action.disabled}
								variant={action.danger ? "destructive" : "default"}
								onClick={() => {
									select();
									action.run();
								}}
							>
								<action.icon aria-hidden />
								{action.label}
								{action.shortcut ? (
									<DropdownMenuShortcut>{action.shortcut}</DropdownMenuShortcut>
								) : null}
							</DropdownMenuItem>
						))}
					</Fragment>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
