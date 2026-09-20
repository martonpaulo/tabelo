import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tabelo/ui/components/dialog";
import { copy } from "@/copy/copy";
import {
	DialogActions,
	DialogCancel,
	DialogConfirm,
} from "@/ui/primitives/dialog-buttons";

// One destructive question, asked the same way wherever it is asked: delete
// this table, erase everything Tabelo stored, and anything else that cannot
// be undone. The copy comes from the caller so it stays in copy.ts.
interface ConfirmDialogProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly onConfirm: () => void;
	readonly title: string;
	readonly description: string;
	readonly confirmLabel: string;
}

export function ConfirmDialog({
	open,
	onOpenChange,
	onConfirm,
	title,
	description,
	confirmLabel,
}: ConfirmDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<DialogActions>
					<DialogCancel>{copy.actions.cancel}</DialogCancel>
					<DialogConfirm
						destructive
						onClick={() => {
							onConfirm();
							onOpenChange(false);
						}}
					>
						{confirmLabel}
					</DialogConfirm>
				</DialogActions>
			</DialogContent>
		</Dialog>
	);
}
