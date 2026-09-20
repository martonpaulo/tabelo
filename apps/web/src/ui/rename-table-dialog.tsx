import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tabelo/ui/components/dialog";
import { Input } from "@tabelo/ui/components/input";
import { Label } from "@tabelo/ui/components/label";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { copy } from "@/copy/copy";
import { DEFAULT_TABLE_NAME } from "@/copy/product";
import { validateTableName } from "@/core/table-name";
import { useTabeloStore } from "@/state/store";
import {
	DialogActions,
	DialogCancel,
	DialogConfirm,
} from "@/ui/primitives/dialog-buttons";
import { useContentWhileOpen } from "@/ui/primitives/use-content-while-open";

type NameError = "empty" | "too-long" | "save" | "duplicate" | null;

export function RenameTableDialog({
	open,
	onOpenChange,
}: {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
}) {
	const currentName = useTabeloStore((state) => state.name);
	// An unnamed table starts the field empty with the default name as its
	// placeholder, and an empty field means that default (owner, 2026-09-19):
	// the default is a name the product chose, not text to delete first.
	const initialDraft = currentName === DEFAULT_TABLE_NAME ? "" : currentName;
	const [draft, setDraft] = useState(initialDraft);
	const [error, setError] = useState<NameError>(null);
	const titleId = useId();
	const descriptionId = useId();
	const inputId = useId();
	const errorId = useId();
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!open) return;
		setDraft(initialDraft);
		setError(null);
	}, [initialDraft, open]);

	const close = (nextOpen: boolean) => {
		if (nextOpen) return;
		setDraft(initialDraft);
		setError(null);
		onOpenChange(false);
	};

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const validated = validateTableName(
			draft.trim() === "" ? DEFAULT_TABLE_NAME : draft,
		);
		if (!validated.ok) {
			setError(validated.reason);
			return;
		}
		const outcome = useTabeloStore.getState().renameTable(validated.name);
		if (outcome.status === "duplicate") {
			setError("duplicate");
			return;
		}
		if (outcome.status !== "saved") {
			setError("save");
			return;
		}
		onOpenChange(false);
	};

	const validated = validateTableName(
		draft.trim() === "" ? DEFAULT_TABLE_NAME : draft,
	);
	const unchanged = validated.ok && validated.name === currentName;
	const errorMessage =
		error === "empty"
			? copy.tableName.empty
			: error === "too-long"
				? copy.tableName.tooLong
				: error === "duplicate"
					? copy.tableName.duplicate
					: error === "save"
						? copy.tableName.saveError
						: null;

	const content = useContentWhileOpen(
		open,
		<DialogContent
			aria-labelledby={titleId}
			aria-describedby={descriptionId}
			// A form dialog hands focus to its first field through the popup's
			// own focus manager, never React's `autoFocus`: that fires on mount,
			// before the menu that opened the dialog returns focus to its
			// trigger, and typing then lands outside the dialog.
			initialFocus={inputRef}
		>
			<form className="grid gap-4" onSubmit={submit}>
				<DialogHeader>
					<DialogTitle id={titleId}>{copy.actions.renameTable}</DialogTitle>
					<DialogDescription id={descriptionId}>
						{copy.tableName.description}
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-2">
					<Label htmlFor={inputId}>{copy.tableName.label}</Label>
					<Input
						ref={inputRef}
						id={inputId}
						value={draft}
						placeholder={DEFAULT_TABLE_NAME}
						aria-invalid={errorMessage ? true : undefined}
						aria-describedby={errorMessage ? errorId : undefined}
						onChange={(event) => {
							setDraft(event.target.value);
							setError(null);
						}}
					/>
					{errorMessage ? (
						<p id={errorId} className="text-destructive text-sm" role="alert">
							{errorMessage}
						</p>
					) : null}
				</div>

				<DialogActions>
					<DialogCancel>{copy.actions.cancel}</DialogCancel>
					<DialogConfirm
						type="submit"
						disabledReason={unchanged ? copy.tableName.unchanged : undefined}
					>
						{copy.tableName.confirm}
					</DialogConfirm>
				</DialogActions>
			</form>
		</DialogContent>,
	);

	return (
		<Dialog open={open} onOpenChange={close}>
			{content}
		</Dialog>
	);
}
