import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tabelo/ui/components/dialog";
import { Input } from "@tabelo/ui/components/input";
import { Label } from "@tabelo/ui/components/label";
import { type FormEvent, useEffect, useId, useState } from "react";
import { copy } from "@/copy/copy";
import { validateTableName } from "@/copy/product";
import { useTabeloStore } from "@/state/store";
import {
	DialogActions,
	DialogCancel,
	DialogConfirm,
} from "@/ui/primitives/dialog-buttons";

type NameError = "empty" | "too-long" | "save" | null;

export function RenameTableDialog({
	open,
	onOpenChange,
}: {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
}) {
	const currentName = useTabeloStore((state) => state.name);
	const [draft, setDraft] = useState(currentName);
	const [error, setError] = useState<NameError>(null);
	const titleId = useId();
	const descriptionId = useId();
	const inputId = useId();
	const errorId = useId();

	useEffect(() => {
		if (!open) return;
		setDraft(currentName);
		setError(null);
	}, [currentName, open]);

	const close = (nextOpen: boolean) => {
		if (nextOpen) return;
		setDraft(currentName);
		setError(null);
		onOpenChange(false);
	};

	const submit = (event: FormEvent) => {
		event.preventDefault();
		const validated = validateTableName(draft);
		if (!validated.ok) {
			setError(validated.reason);
			return;
		}
		const outcome = useTabeloStore.getState().renameTable(validated.name);
		if (outcome.status !== "saved") {
			setError("save");
			return;
		}
		onOpenChange(false);
	};

	const validated = validateTableName(draft);
	const unchanged = validated.ok && validated.name === currentName;
	const errorMessage =
		error === "empty"
			? copy.tableName.empty
			: error === "too-long"
				? copy.tableName.tooLong
				: error === "save"
					? copy.tableName.saveError
					: null;

	return (
		<Dialog open={open} onOpenChange={close}>
			<DialogContent
				showCloseButton={false}
				aria-labelledby={titleId}
				aria-describedby={descriptionId}
				className="sm:w-md"
			>
				<form className="grid gap-4" onSubmit={submit}>
					<DialogHeader>
						<DialogTitle id={titleId}>{copy.tableName.dialogTitle}</DialogTitle>
						<DialogDescription id={descriptionId}>
							{copy.tableName.description}
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-2">
						<Label htmlFor={inputId}>{copy.tableName.label}</Label>
						<Input
							id={inputId}
							autoFocus
							value={draft}
							className="text-sm md:text-sm"
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
			</DialogContent>
		</Dialog>
	);
}
