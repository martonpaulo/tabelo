import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tabelo/ui/components/dialog";
import { useId, useRef } from "react";
import { copy } from "@/copy/copy";
import type { CellPosition } from "@/core/selection";
import type { ConversionConfirmation } from "@/core/typed-input";
import type { CellValue, CellValueType } from "@/core/types";
import {
	DialogActions,
	DialogCancel,
	DialogConfirm,
} from "@/ui/primitives/dialog-buttons";
import { cellTypeOptions } from "./cell-type-options";

// A Cell type change the core says to confirm first (#371): one that loses the
// value it replaces, or one that invents a boolean for an empty cell. It names
// the value before and after, and what changing the type back would give, so
// the loss is stated rather than implied.

export interface PendingCellTypeChange {
	readonly position: CellPosition;
	readonly target: CellValueType;
	readonly before: CellValue;
	readonly after: CellValue;
	readonly confirm: ConversionConfirmation;
}

// Text in quotes, so an empty cell reads as "" and the number 35 is not taken
// for the text "35"; null, numbers, and booleans as they are.
function shown(value: CellValue): string {
	return typeof value === "string" ? JSON.stringify(value) : String(value);
}

function description(change: PendingCellTypeChange): string {
	if (change.confirm.kind === "fills-empty") {
		return copy.cellTypeChange.fillsEmpty(shown(change.after));
	}
	const { back } = change.confirm;
	return copy.cellTypeChange.losesOriginal(
		shown(change.before),
		shown(change.after),
		back === null ? null : shown(back),
	);
}

export function CellTypeChangeDialog({
	change,
	onCancel,
	onConfirm,
	finalFocus,
}: {
	readonly change: PendingCellTypeChange | null;
	readonly onCancel: () => void;
	readonly onConfirm: (change: PendingCellTypeChange) => void;
	readonly finalFocus: () => HTMLElement | null;
}) {
	const titleId = useId();
	const descriptionId = useId();
	// The last change stays on screen while the dialog closes, so its words do
	// not blank out during the exit transition.
	const last = useRef<PendingCellTypeChange | null>(null);
	if (change) last.current = change;
	const current = change ?? last.current;
	const label =
		cellTypeOptions.find((option) => option.value === current?.target)?.label ??
		"";

	return (
		<Dialog
			open={change !== null}
			onOpenChange={(open) => {
				if (!open) onCancel();
			}}
		>
			<DialogContent
				showCloseButton={false}
				aria-labelledby={titleId}
				aria-describedby={descriptionId}
				finalFocus={finalFocus}
				className="sm:w-md"
			>
				<DialogHeader>
					<DialogTitle id={titleId}>
						{copy.cellTypeChange.title(label)}
					</DialogTitle>
					<DialogDescription id={descriptionId}>
						{current ? description(current) : null}
					</DialogDescription>
				</DialogHeader>
				<DialogActions>
					<DialogCancel>{copy.actions.cancel}</DialogCancel>
					<DialogConfirm
						onClick={() => {
							if (change) onConfirm(change);
						}}
					>
						{copy.cellTypeChange.confirm}
					</DialogConfirm>
				</DialogActions>
			</DialogContent>
		</Dialog>
	);
}
