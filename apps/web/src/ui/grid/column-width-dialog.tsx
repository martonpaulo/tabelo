import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tabelo/ui/components/dialog";
import { Input } from "@tabelo/ui/components/input";
import { Label } from "@tabelo/ui/components/label";
import { cn } from "@tabelo/ui/lib/utils";
import { type FormEvent, useEffect, useId, useState } from "react";
import { copy } from "@/copy/copy";
import { useTabeloStore } from "@/state/store";
import {
	DialogActions,
	DialogAlternative,
	DialogCancel,
	DialogConfirm,
} from "@/ui/primitives/dialog-buttons";
import {
	DEFAULT_COLUMN_WIDTH,
	isSameColumnWidth,
	MAX_COLUMN_WIDTH,
	MIN_COLUMN_WIDTH,
	parseColumnWidth,
	resolveColumnWidth,
} from "@/workspace/column-width";

// Typing a column's exact width, and returning it to the default (#370). A
// dialog because a number entry is a choice a menu cannot hold. The width is a
// workspace preference like every other width path, so this writes through the
// same store action as a drag, a keyboard step, and Fit.

// Widths are stored at one sixteenth of a rem; show them without float noise.
const formatWidth = (width: number) =>
	String(Number.parseFloat(width.toFixed(4)));

export function ColumnWidthDialog({
	column,
	onClose,
	finalFocus,
}: {
	// The column being edited, or null while the dialog is closed.
	readonly column: number | null;
	readonly onClose: () => void;
	readonly finalFocus: () => HTMLElement | null;
}) {
	const open = column !== null;
	const id = useTabeloStore((state) =>
		column === null ? undefined : state.document.columns[column]?.id,
	);
	const stored = useTabeloStore((state) =>
		id === undefined ? undefined : state.workspace.columnWidths[id],
	);
	const current = resolveColumnWidth(stored);
	const [draft, setDraft] = useState(formatWidth(current));
	const [submitted, setSubmitted] = useState(false);
	const titleId = useId();
	const descriptionId = useId();
	const inputId = useId();
	const hintId = useId();

	// Each opening starts from the column's own width, not the last draft.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useEffect(() => {
		if (!open) return;
		setDraft(formatWidth(current));
		setSubmitted(false);
	}, [open, column]);

	const entry = parseColumnWidth(draft);
	const isDefault = stored === undefined;
	const unchanged = entry.ok && isSameColumnWidth(stored, entry.width);
	const error =
		!entry.ok && submitted
			? entry.reason === "too-small"
				? copy.columnWidth.tooSmall(MIN_COLUMN_WIDTH)
				: entry.reason === "too-large"
					? copy.columnWidth.tooLarge(MAX_COLUMN_WIDTH)
					: copy.columnWidth.notANumber
			: null;
	const letter = column === null ? "" : copy.a11y.columnLetter(column);

	const apply = (width: number | undefined) => {
		if (column === null) return;
		const store = useTabeloStore.getState();
		store.resizeColumn(column, width, "column");
		store.announceStatus(
			copy.status.columnWidth(letter, resolveColumnWidth(width)),
		);
		onClose();
	};

	const submit = (event: FormEvent) => {
		event.preventDefault();
		setSubmitted(true);
		if (!entry.ok || unchanged) return;
		// Typing the default number is the same choice as Use default: the column
		// goes back to following the default rather than pinning today's value.
		apply(isSameColumnWidth(undefined, entry.width) ? undefined : entry.width);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<DialogContent
				showCloseButton={false}
				aria-labelledby={titleId}
				aria-describedby={descriptionId}
				finalFocus={finalFocus}
				className="sm:w-md"
			>
				<form className="grid gap-4" onSubmit={submit}>
					<DialogHeader>
						<DialogTitle id={titleId}>
							{copy.columnWidth.dialogTitle(letter)}
						</DialogTitle>
						<DialogDescription id={descriptionId}>
							{copy.columnWidth.description(
								MIN_COLUMN_WIDTH,
								MAX_COLUMN_WIDTH,
								DEFAULT_COLUMN_WIDTH,
							)}
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-2">
						<Label htmlFor={inputId}>{copy.columnWidth.label}</Label>
						<Input
							id={inputId}
							autoFocus
							inputMode="decimal"
							// Selected on arrival so a typed number replaces the current one.
							onFocus={(event) => event.currentTarget.select()}
							value={draft}
							className="text-sm md:text-sm"
							aria-invalid={error ? true : undefined}
							aria-describedby={hintId}
							onChange={(event) => {
								setDraft(event.target.value);
								setSubmitted(false);
							}}
						/>
						<p
							id={hintId}
							// The line keeps its height when empty, so an error appearing
							// or the default note going away never moves the buttons.
							className={cn(
								"min-h-5 text-sm",
								error ? "text-destructive" : "text-muted-foreground",
							)}
							role={error ? "alert" : undefined}
						>
							{error ?? (isDefault ? copy.columnWidth.isDefault : null)}
						</p>
					</div>

					<DialogActions>
						<DialogCancel>{copy.actions.cancel}</DialogCancel>
						<DialogAlternative
							type="button"
							disabledReason={
								isDefault ? copy.columnWidth.alreadyDefault : undefined
							}
							onClick={() => apply(undefined)}
						>
							{copy.columnWidth.useDefault}
						</DialogAlternative>
						<DialogConfirm
							type="submit"
							disabledReason={
								unchanged ? copy.columnWidth.unchanged : undefined
							}
						>
							{copy.columnWidth.confirm}
						</DialogConfirm>
					</DialogActions>
				</form>
			</DialogContent>
		</Dialog>
	);
}
