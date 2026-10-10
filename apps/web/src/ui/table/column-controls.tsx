import {
	ContextMenuLabel,
	ContextMenuRadioGroup,
	ContextMenuSegmentedItem,
} from "@tabelo/ui/components/context-menu";
import { segmentedGroupStyles } from "@tabelo/ui/components/menu-styles";
import { cn } from "@tabelo/ui/lib/utils";
import {
	IconAlignCenter,
	IconAlignJustified,
	IconAlignLeft,
	IconAlignRight,
} from "@tabler/icons-react";
import { useId } from "react";
import { copy } from "@/copy/copy";
import type { Alignment, ExpectedColumnType } from "@/core/types";
import { expectedTypeOptions } from "@/ui/grid/cell-type-options";
import { ControlTooltip } from "@/ui/primitives/control-tooltip";

// A column's two settings as a table menu draws them, in the Visual Table's
// column menu and on a source pane's column letter alike (#433). Each reads
// its value from the column and reports the choice; what applies it is the
// caller's.

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

// The column's expected type as segments, read from the column. The grid's
// column menu and a source pane's column letter (#395) both draw it; the
// letter says why it is off when the text has no table to act on.
export function ColumnExpectedTypeGroup({
	value,
	onChange,
	reason,
}: {
	readonly value: ExpectedColumnType;
	readonly onChange: (next: ExpectedColumnType) => void;
	readonly reason?: string;
}) {
	const labelId = useId();
	return (
		<ContextMenuRadioGroup
			aria-labelledby={labelId}
			value={value}
			onValueChange={(next) => onChange(next as ExpectedColumnType)}
		>
			<ContextMenuLabel id={labelId}>
				{copy.actions.expectedType}
			</ContextMenuLabel>
			<div className={cn(segmentedGroupStyles, "mx-1 mb-1")}>
				{expectedTypeOptions.map((option) => (
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
				))}
			</div>
		</ContextMenuRadioGroup>
	);
}

// Four immediate choices laid side by side, the same segmented drawing as the
// expected type above them. Each segment is an icon with its full name as its
// accessible name, and the radio semantics read the checked value from the
// column rather than the last click (2026-09-19, replacing the submenu).
export function ColumnAlignmentGroup({
	align,
	onChange,
	reason,
}: {
	readonly align?: Alignment;
	readonly onChange: (next: Alignment) => void;
	readonly reason?: string;
}) {
	const labelId = useId();
	return (
		<ContextMenuRadioGroup
			aria-labelledby={labelId}
			value={align ?? "default"}
			onValueChange={(next) => onChange(next as Alignment)}
		>
			<ContextMenuLabel id={labelId}>{copy.actions.alignment}</ContextMenuLabel>
			<div className={cn(segmentedGroupStyles, "mx-1 mb-1")}>
				{alignments.map((option) => (
					<ControlTooltip
						key={option.value}
						name={option.label}
						reason={reason}
					>
						<ContextMenuSegmentedItem
							value={option.value}
							aria-label={option.label}
							disabled={reason !== undefined}
							aria-description={reason}
						>
							<option.icon aria-hidden />
						</ContextMenuSegmentedItem>
					</ControlTooltip>
				))}
			</div>
		</ContextMenuRadioGroup>
	);
}
