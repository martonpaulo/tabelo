import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tabelo/ui/components/dialog";
import { Input } from "@tabelo/ui/components/input";
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
import { FormFailure, FormField } from "@/ui/primitives/form-field";
import { useContentWhileOpen } from "@/ui/primitives/use-content-while-open";

// What is wrong with the typed name itself. A refused save is not one of
// these: the name is fine and stays valid, and the failure is the form's
// (#451).
type NameError = "empty" | "too-long" | "duplicate" | null;

export function RenameTableDialog({
	open,
	tableId,
	onOpenChange,
}: {
	readonly open: boolean;
	// Which table is being renamed: the list offers the command on every row,
	// so it is not always the active one (owner, 2026-09-20).
	readonly tableId: string | null;
	readonly onOpenChange: (open: boolean) => void;
}) {
	const activeName = useTabeloStore((state) => state.name);
	const entryName = useTabeloStore(
		(state) =>
			state.library.tables.find((table) => table.id === tableId)?.name ?? null,
	);
	const currentName = entryName ?? activeName;
	// An unnamed table starts the field empty with the default name as its
	// placeholder, and an empty field means that default (owner, 2026-09-19):
	// the default is a name the product chose, not text to delete first.
	const initialDraft = currentName === DEFAULT_TABLE_NAME ? "" : currentName;
	const [draft, setDraft] = useState(initialDraft);
	const [error, setError] = useState<NameError>(null);
	const [saveFailed, setSaveFailed] = useState(false);
	const titleId = useId();
	const descriptionId = useId();
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!open) return;
		setDraft(initialDraft);
		setError(null);
		setSaveFailed(false);
	}, [initialDraft, open]);

	const close = (nextOpen: boolean) => {
		if (nextOpen) return;
		setDraft(initialDraft);
		setError(null);
		setSaveFailed(false);
		onOpenChange(false);
	};

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const validated = validateTableName(
			draft.trim() === "" ? DEFAULT_TABLE_NAME : draft,
		);
		setSaveFailed(false);
		if (!validated.ok) {
			setError(validated.reason);
			return;
		}
		const outcome = useTabeloStore
			.getState()
			.renameTable(validated.name, tableId ?? undefined);
		if (outcome.status === "duplicate") {
			setError("duplicate");
			return;
		}
		if (outcome.status !== "saved") {
			setSaveFailed(true);
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

				<FormField label={copy.tableName.label} error={errorMessage}>
					{(control) => (
						<Input
							{...control}
							ref={inputRef}
							value={draft}
							placeholder={DEFAULT_TABLE_NAME}
							onChange={(event) => {
								setDraft(event.target.value);
								setError(null);
								setSaveFailed(false);
							}}
						/>
					)}
				</FormField>

				{saveFailed ? (
					<FormFailure>{copy.tableName.saveError}</FormFailure>
				) : null}

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
