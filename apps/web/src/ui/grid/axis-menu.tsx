import {
	createDropdownMenuHandle,
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	type DropdownMenuHandle,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@tabelo/ui/components/dropdown-menu";
import { controlStateTransitionStyles } from "@tabelo/ui/components/motion-styles";
import { cn } from "@tabelo/ui/lib/utils";
import {
	AlignCenter,
	AlignJustify,
	AlignLeft,
	AlignRight,
	ChevronDown,
	ChevronsLeftRight,
	MoreVertical,
	WrapText,
} from "lucide-react";
import { useEffect, useState } from "react";
import { copy } from "@/copy/copy";
import type { Alignment, ExpectedColumnType } from "@/core/types";
import { useTabeloStore } from "@/state/store";
import { DisabledTooltip } from "@/ui/primitives/disabled-tooltip";
import { MenuSelectionOption } from "@/ui/primitives/menu-selection-option";
import { usePaneEntered } from "@/ui/workspace/use-pane-entry";
import { isSameColumnWidth } from "@/workspace/column-width";
import { expectedTypeOptions } from "./cell-type-options";
import { DropdownTableActions } from "./dropdown-table-actions";
import { targetAxisForMenu } from "./menu-target";

// One menu component for both axes, replacing the near-identical row and column
// menus that were drifting apart. Everything it offers comes from the shared
// action list; alignment and expected type are the column-only additions,
// because both belong to a column rather than to a cell range.
//
// The affordance is per row and per column, but the machinery behind it is not:
// only one axis menu can be open at a time, so the grid mounts one root and
// every gutter renders a detached trigger against it. Mounting a root per row
// doubled the grid's mount and re-render cost for menus that were closed. This
// is the same reasoning GridContextMenu already applies to right-click.

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

type Axis = "row" | "column";

// What a trigger tells the shared root about itself when it opens it.
interface AxisMenuPayload {
	readonly axis: Axis;
	readonly index: number;
	readonly measureFitWidth?: () => number | undefined;
}

export type AxisMenuHandle = DropdownMenuHandle<AxisMenuPayload>;

export function createAxisMenuHandle(): AxisMenuHandle {
	return createDropdownMenuHandle<AxisMenuPayload>();
}

// A column names itself by its header, falling back to its index-strip letter
// when it has none, so the menu of an unnamed column is still identifiable.
function axisMenuLabel(
	axis: Axis,
	index: number,
	header: string,
	expectedType?: ExpectedColumnType,
): string {
	return axis === "column"
		? `${copy.actions.columnActions}: ${copy.a11y.columnWithExpectedType(header, index, expectedType ?? "text")}`
		: `${copy.actions.rowActions}: ${copy.a11y.rowNumber(index)}`;
}

interface AxisMenuTriggerProps {
	readonly handle: AxisMenuHandle;
	readonly axis: Axis;
	readonly index: number;
	// Whether this row or column is the one the user is working in. Revealing
	// the affordance there is what teaches the relationship between a selection
	// and its actions, without putting an icon on every row at once.
	readonly revealed?: boolean;
	readonly measureFitWidth?: () => number | undefined;
}

export function AxisMenuTrigger({
	handle,
	axis,
	index,
	revealed = false,
	measureFitWidth,
}: AxisMenuTriggerProps) {
	const entered = usePaneEntered();
	// The only document state a trigger needs is its own column identity, so it
	// subscribes to that column rather than to the whole document. There is one
	// of these per row and per column; a broad selector here woke every one on
	// every keystroke.
	const column = useTabeloStore((state) =>
		axis === "column" ? state.document.columns[index] : undefined,
	);

	const Icon = axis === "column" ? ChevronDown : MoreVertical;
	// Anywhere in the row or column counts, not just the icon itself: hovering,
	// tabbing into it, or having the selection there all bring it out.
	const groupClass =
		axis === "column"
			? "group-hover/col:opacity-100 group-focus-within/col:opacity-100"
			: "group-hover/row:opacity-100 group-focus-within/row:opacity-100";

	return (
		<DropdownMenuTrigger
			handle={handle}
			payload={{ axis, index, measureFitWidth }}
			aria-label={axisMenuLabel(
				axis,
				index,
				column?.header ?? "",
				column?.expectedType,
			)}
			data-expected-type={column?.expectedType}
			tabIndex={entered ? 0 : -1}
			// The icon stays small so the grid stays quiet, while the ::after box
			// grows the target to the control minimum without taking any
			// layout: the row gutter has no room to spare. Same technique as the
			// checkbox and radio primitives.
			className={cn(
				"relative inline-flex size-5 shrink-0 items-center justify-center rounded",
				"after:absolute after:-inset-1 after:content-['']",
				"text-muted-foreground hover:bg-accent hover:text-accent-foreground",
				controlStateTransitionStyles,
				"focus-visible:opacity-100 data-popup-open:opacity-100",
				revealed ? "opacity-100" : "opacity-0",
				groupClass,
			)}
		>
			<Icon aria-hidden className="size-3.5" />
		</DropdownMenuTrigger>
	);
}

// The one root every trigger opens. Mount it once anywhere inside the grid.
export function AxisMenuPopupHost({
	handle,
}: {
	readonly handle: AxisMenuHandle;
}) {
	return (
		<DropdownMenu handle={handle}>
			{({ payload }) =>
				payload ? (
					<DropdownMenuContent
						align={payload.axis === "column" ? "end" : "start"}
						className="w-auto min-w-56"
					>
						{/* Keyed by its target so moving from one row's menu straight to
						    another remounts the body, and the selection follows. */}
						<AxisMenuBody
							key={`${payload.axis}:${payload.index}`}
							{...payload}
						/>
					</DropdownMenuContent>
				) : null
			}
		</DropdownMenu>
	);
}

// Only ever rendered while its menu is open, so a broader store read here costs
// nothing per keystroke the way one in the trigger would.
function AxisMenuBody({ axis, index, measureFitWidth }: AxisMenuPayload) {
	const column = useTabeloStore((state) =>
		axis === "column" ? state.document.columns[index] : undefined,
	);
	const wrappedColumns = useTabeloStore(
		(state) => state.workspace.wrappedColumns,
	);
	const columnWidths = useTabeloStore((state) => state.workspace.columnWidths);
	const wrapped = column ? wrappedColumns.includes(column.id) : false;
	const currentWidth = column ? columnWidths[column.id] : undefined;
	const [fitWidth] = useState(() => measureFitWidth?.());
	const fitReason =
		!column || fitWidth === undefined
			? copy.disabled.columnFitUnavailable
			: wrapped
				? copy.disabled.fitWrappedColumn
				: isSameColumnWidth(currentWidth, fitWidth)
					? copy.disabled.columnAlreadyFitted
					: undefined;

	const select = () => targetAxisForMenu(axis, index);

	// Selecting on mount rather than on an open flag: with one shared root, the
	// root's own open change carries no payload, and this body mounts exactly
	// when the menu it belongs to opens.
	useEffect(() => {
		targetAxisForMenu(axis, index);
	}, [axis, index]);

	return (
		<>
			{axis === "column" ? (
				<>
					<DropdownMenuGroup>
						<DisabledTooltip reason={fitReason}>
							<DropdownMenuItem
								disabled={fitReason !== undefined}
								onClick={() => {
									if (fitWidth !== undefined) {
										useTabeloStore.getState().resizeColumn(index, fitWidth);
									}
								}}
							>
								<ChevronsLeftRight aria-hidden />
								{copy.actions.fitColumnToContent}
							</DropdownMenuItem>
						</DisabledTooltip>
						<DropdownMenuCheckboxItem
							checked={wrapped}
							closeOnClick={false}
							onCheckedChange={() => {
								if (column) {
									useTabeloStore.getState().toggleColumnWrap(column.id);
								}
							}}
						>
							<WrapText aria-hidden />
							{copy.actions.wrapColumnText}
						</DropdownMenuCheckboxItem>
					</DropdownMenuGroup>
					<DropdownMenuSeparator />

					<DropdownMenuRadioGroup
						aria-labelledby="column-expected-type-label"
						value={column?.expectedType ?? "text"}
						onValueChange={(next) =>
							useTabeloStore
								.getState()
								.setColumnExpectedType(index, next as ExpectedColumnType)
						}
					>
						<DropdownMenuLabel id="column-expected-type-label">
							{copy.actions.expectedType}
						</DropdownMenuLabel>
						{expectedTypeOptions.map((option) => (
							<MenuSelectionOption
								key={option.value}
								value={option.value}
								icon={<option.icon />}
								label={option.label}
							/>
						))}
					</DropdownMenuRadioGroup>
					<DropdownMenuSeparator />

					<ColumnAlignmentSubmenu index={index} align={column?.align} />
					<DropdownMenuSeparator />
				</>
			) : null}

			<DropdownTableActions axis={axis} beforeRun={select} />
		</>
	);
}

// A submenu rather than four rows in the root menu: alignment is a flat list of
// immediate choices with nothing to state beforehand, which is the whole of the
// class docs/design-system.md §3 allows one for. The radio semantics travel with
// it, so the checked value is still read from the column rather than the last
// click.
function ColumnAlignmentSubmenu({
	index,
	align,
}: {
	readonly index: number;
	readonly align?: Alignment;
}) {
	const current = align ?? "default";
	// The trigger wears the column's own alignment, so the root menu still says
	// which one is set without a second line of copy explaining it.
	const TriggerIcon =
		alignments.find((option) => option.value === current)?.icon ?? AlignJustify;

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>
				<TriggerIcon aria-hidden />
				{copy.actions.alignment}
			</DropdownMenuSubTrigger>
			{/* No width of its own: the primitive already sizes a submenu to its
			    content above a shared floor, and the shared spacing rhythm comes
			    with it. */}
			<DropdownMenuSubContent aria-label={copy.actions.alignment}>
				{/* A column has one alignment, so these are radio items rather than
				    a tinted background that only a sighted user can read. The
				    group takes no name of its own: the menu around it already
				    carries one, and two would be announced twice. */}
				<DropdownMenuRadioGroup
					value={current}
					onValueChange={(next) =>
						useTabeloStore
							.getState()
							.setColumnAlignment(index, next as Alignment)
					}
				>
					{alignments.map((option) => (
						<MenuSelectionOption
							key={option.value}
							value={option.value}
							icon={<option.icon />}
							label={option.label}
						/>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}
