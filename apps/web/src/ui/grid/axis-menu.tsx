import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
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
	MoreVertical,
} from "lucide-react";
import { Fragment } from "react";
import type { Alignment } from "@/core/types";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
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
							<DropdownMenuLabel>{copy.actions.alignment}</DropdownMenuLabel>
							{alignments.map((option) => (
								<DropdownMenuItem
									key={option.value}
									onClick={() =>
										useTabeloStore
											.getState()
											.setColumnAlignment(index, option.value)
									}
									className={
										column?.align === option.value ? "bg-accent/60" : undefined
									}
								>
									<option.icon aria-hidden />
									{option.label}
								</DropdownMenuItem>
							))}
						</DropdownMenuGroup>
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
