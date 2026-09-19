import {
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuShortcut,
} from "@tabelo/ui/components/context-menu";
import {
	menuToggleSegmentStyles,
	segmentedGroupStyles,
} from "@tabelo/ui/components/menu-styles";
import { cn } from "@tabelo/ui/lib/utils";
import { IconLink, IconPhoto } from "@tabler/icons-react";
import { useId } from "react";
import { copy } from "@/copy/copy";
import type { SelectionMarkState } from "@/core/cell-formatting";
import type { InlineMark } from "@/core/types";
import { ControlTooltip } from "@/ui/primitives/control-tooltip";
import { formatMarks } from "./format-commands";

// The Format group (#306): the five marks as one row of icon segments that
// each turn on and off by themselves, then the two commands that need a
// dialog. It is drawn once, here, for both menus that carry it: the cell menu,
// where it acts on the complete text of every selected cell, and the cell
// editor's menu, where it acts on the range or the caret being edited (#398).
// The caller says what each control reads and does; this only draws them.

export interface FormatMarkControl {
	// Pressed, unpressed, or mixed where the target disagrees.
	readonly checked: "true" | "false" | "mixed";
	// Why the mark cannot be applied, or nothing when it can.
	readonly refusal: string | undefined;
}

// A mark's state as the segment's `aria-checked`. A mark that cannot be
// applied reads as unpressed; its refusal says why.
export function markChecked(
	state: SelectionMarkState,
): FormatMarkControl["checked"] {
	if (state === "on") return "true";
	return state === "mixed" ? "mixed" : "false";
}

export function FormatMenuGroup({
	markControl,
	onMark,
	linkRefusal,
	onLink,
	imageRefusal,
	onImage,
}: {
	readonly markControl: (mark: InlineMark) => FormatMarkControl;
	readonly onMark: (mark: InlineMark) => void;
	readonly linkRefusal: string | undefined;
	readonly onLink: () => void;
	readonly imageRefusal: string | undefined;
	readonly onImage: () => void;
}) {
	const labelId = useId();
	return (
		<ContextMenuGroup aria-labelledby={labelId}>
			<ContextMenuLabel id={labelId}>{copy.actions.format}</ContextMenuLabel>
			<div className={cn(segmentedGroupStyles, "mx-1 mb-1")}>
				{formatMarks.map((entry) => {
					const control = markControl(entry.mark);
					return (
						<ControlTooltip
							key={entry.mark}
							name={entry.label}
							reason={control.refusal}
							shortcut={entry.shortcut}
						>
							<ContextMenuItem
								// A toggle, not one choice among its neighbours: each mark is
								// on or off by itself, and mixed where the target disagrees.
								role="menuitemcheckbox"
								aria-checked={control.checked}
								aria-keyshortcuts={entry.shortcut}
								data-format-toggle={entry.mark}
								disabled={control.refusal !== undefined}
								className={menuToggleSegmentStyles}
								onClick={() => onMark(entry.mark)}
							>
								<entry.icon aria-hidden />
							</ContextMenuItem>
						</ControlTooltip>
					);
				})}
			</div>
			<ControlTooltip reason={linkRefusal}>
				<ContextMenuItem disabled={linkRefusal !== undefined} onClick={onLink}>
					<IconLink aria-hidden />
					{copy.actions.link}
					<ContextMenuShortcut>{copy.shortcuts.link}</ContextMenuShortcut>
				</ContextMenuItem>
			</ControlTooltip>
			<ControlTooltip reason={imageRefusal}>
				<ContextMenuItem
					disabled={imageRefusal !== undefined}
					onClick={onImage}
				>
					<IconPhoto aria-hidden />
					{copy.actions.image}
				</ContextMenuItem>
			</ControlTooltip>
		</ContextMenuGroup>
	);
}
