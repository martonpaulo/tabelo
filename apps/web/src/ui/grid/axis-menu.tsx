import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@tabelo/ui/components/dropdown-menu";
import { cn } from "@tabelo/ui/lib/utils";
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
import type { Alignment } from "@/core/types";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import { DisabledTooltip } from "@/ui/primitives/disabled-tooltip";
import {
	atMinimumColumnWidth,
	isDefaultColumnWidth,
	resolveColumnWidth,
	stepColumnWidth,
} from "./column-width";
import { DropdownTableActions } from "./dropdown-table-actions";

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
	// Whether this row or column is the one the user is working in. Revealing
	// the affordance there is what teaches the relationship between a selection
	// and its actions, without putting an icon on every row at once.
	readonly revealed?: boolean;
}

export function AxisMenu({ axis, index, revealed = false }: AxisMenuProps) {
	const document = useTabeloStore((state) => state.document);
	const column = axis === "column" ? document.columns[index] : undefined;
	const atMinimumWidth = atMinimumColumnWidth(column?.width);
	const atDefaultWidth = isDefaultColumnWidth(column?.width);

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
	// Anywhere in the row or column counts, not just the icon itself: hovering,
	// tabbing into it, or having the selection there all bring it out.
	const groupClass =
		axis === "column"
			? "group-hover/col:opacity-100 group-focus-within/col:opacity-100"
			: "group-hover/row:opacity-100 group-focus-within/row:opacity-100";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label={label}
				// The icon stays small so the grid stays quiet, while the ::after box
				// grows the target to the control minimum without taking any
				// layout: the row gutter has no room to spare. Same technique as the
				// checkbox and radio primitives.
				className={cn(
					"relative inline-flex size-5 shrink-0 items-center justify-center rounded",
					"after:absolute after:-inset-1 after:content-['']",
					"text-muted-foreground transition-opacity hover:bg-accent hover:text-accent-foreground",
					"focus-visible:opacity-100 data-popup-open:opacity-100",
					revealed ? "opacity-100" : "opacity-0",
					groupClass,
				)}
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
							<DisabledTooltip
								reason={
									atMinimumWidth ? copy.disabled.minimumColumnWidth : undefined
								}
							>
								<DropdownMenuItem
									closeOnClick={false}
									disabled={atMinimumWidth}
									onClick={() =>
										useTabeloStore
											.getState()
											.resizeColumn(index, stepColumnWidth(column?.width, -1))
									}
								>
									<ChevronsRightLeft aria-hidden />
									{copy.actions.narrowColumn}
								</DropdownMenuItem>
							</DisabledTooltip>
							<DisabledTooltip
								reason={
									atDefaultWidth ? copy.disabled.defaultColumnWidth : undefined
								}
							>
								<DropdownMenuItem
									closeOnClick={false}
									disabled={atDefaultWidth}
									onClick={() =>
										useTabeloStore.getState().resizeColumn(index, undefined)
									}
								>
									<RotateCcw aria-hidden />
									{copy.actions.resetColumnWidth}
								</DropdownMenuItem>
							</DisabledTooltip>
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

				<DropdownTableActions axis={axis} beforeRun={select} />
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
