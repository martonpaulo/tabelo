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
import type {
	CellValue,
	CellValueType,
	ExpectedColumnType,
} from "@/core/types";
import {
	DialogActions,
	DialogCancel,
	DialogConfirm,
} from "@/ui/primitives/dialog-buttons";
import { cellTypeOptions, expectedTypeOptions } from "./cell-type-options";

// A type change the core says to confirm first. Three commands reach it with
// the same shape: a Cell type change that loses the value it replaces or
// invents a boolean for an empty cell (#371), a column's expected type change
// that some of its cells cannot follow (#392), and a transpose that turns the
// first column's typed values into header text (#235). Cancel changes nothing.

export interface PendingCellTypeChange {
	readonly position: CellPosition;
	readonly target: CellValueType;
	readonly before: CellValue;
	readonly after: CellValue;
	readonly confirm: ConversionConfirmation;
}

export interface PendingColumnTypeChange {
	// The column whose menu asked; the store widens it to the selected columns
	// exactly as it did when it counted.
	readonly column: number;
	readonly target: ExpectedColumnType;
	readonly unconverted: number;
}

interface TypeChangeText {
	readonly title: string;
	readonly description: string;
	readonly confirm: string;
}

function TypeChangeDialog({
	text,
	onCancel,
	onConfirm,
	finalFocus,
}: {
	readonly text: TypeChangeText | null;
	readonly onCancel: () => void;
	readonly onConfirm: () => void;
	readonly finalFocus: () => HTMLElement | null;
}) {
	const titleId = useId();
	const descriptionId = useId();
	// The last words stay on screen while the dialog closes, so they do not
	// blank out during the exit transition.
	const last = useRef<TypeChangeText | null>(null);
	if (text) last.current = text;
	const current = text ?? last.current;

	return (
		<Dialog
			open={text !== null}
			onOpenChange={(open) => {
				if (!open) onCancel();
			}}
		>
			<DialogContent
				aria-labelledby={titleId}
				aria-describedby={descriptionId}
				finalFocus={finalFocus}
			>
				<DialogHeader>
					<DialogTitle id={titleId}>{current?.title}</DialogTitle>
					<DialogDescription id={descriptionId}>
						{current?.description}
					</DialogDescription>
				</DialogHeader>
				<DialogActions>
					<DialogCancel>{copy.actions.cancel}</DialogCancel>
					<DialogConfirm
						onClick={() => {
							if (text) onConfirm();
						}}
					>
						{current?.confirm}
					</DialogConfirm>
				</DialogActions>
			</DialogContent>
		</Dialog>
	);
}

function cellChangeText(change: PendingCellTypeChange): TypeChangeText {
	const label =
		cellTypeOptions.find((option) => option.value === change.target)?.label ??
		"";
	return {
		title: copy.cellTypeChange.title(label),
		description:
			change.confirm.kind === "fills-empty"
				? copy.cellTypeChange.fillsEmpty(change.after)
				: copy.cellTypeChange.losesOriginal(
						change.before,
						change.after,
						change.confirm.back,
					),
		confirm: copy.cellTypeChange.confirm,
	};
}

function columnChangeText(change: PendingColumnTypeChange): TypeChangeText {
	const label =
		expectedTypeOptions.find((option) => option.value === change.target)
			?.label ?? "";
	return {
		title: copy.columnTypeChange.title(label),
		description: copy.columnTypeChange.description(change.unconverted, label),
		confirm: copy.columnTypeChange.confirm,
	};
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
	return (
		<TypeChangeDialog
			text={change ? cellChangeText(change) : null}
			onCancel={onCancel}
			onConfirm={() => {
				if (change) onConfirm(change);
			}}
			finalFocus={finalFocus}
		/>
	);
}

export function ColumnTypeChangeDialog({
	change,
	onCancel,
	onConfirm,
	finalFocus,
}: {
	readonly change: PendingColumnTypeChange | null;
	readonly onCancel: () => void;
	readonly onConfirm: (change: PendingColumnTypeChange) => void;
	readonly finalFocus: () => HTMLElement | null;
}) {
	return (
		<TypeChangeDialog
			text={change ? columnChangeText(change) : null}
			onCancel={onCancel}
			onConfirm={() => {
				if (change) onConfirm(change);
			}}
			finalFocus={finalFocus}
		/>
	);
}

// The number of first-column values a transpose would turn into header text,
// or null while nothing is waiting.
export function TransposeTypeChangeDialog({
	typedValues,
	onCancel,
	onConfirm,
	finalFocus,
}: {
	readonly typedValues: number | null;
	readonly onCancel: () => void;
	readonly onConfirm: () => void;
	readonly finalFocus: () => HTMLElement | null;
}) {
	return (
		<TypeChangeDialog
			text={
				typedValues === null
					? null
					: {
							title: copy.transposeTypedValues.title,
							description: copy.transposeTypedValues.description(typedValues),
							confirm: copy.transposeTypedValues.confirm,
						}
			}
			onCancel={onCancel}
			onConfirm={onConfirm}
			finalFocus={finalFocus}
		/>
	);
}
