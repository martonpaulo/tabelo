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

interface NewTableDialogProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly onConfirm: () => void;
}

export function NewTableDialog({
	open,
	onOpenChange,
	onConfirm,
}: NewTableDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>{copy.newTable.title}</DialogTitle>
					<DialogDescription>{copy.newTable.description}</DialogDescription>
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
						{copy.newTable.confirm}
					</DialogConfirm>
				</DialogActions>
			</DialogContent>
		</Dialog>
	);
}
