import {
	Dialog,
	DialogCancel,
	DialogConfirm,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@tabelo/ui/components/dialog";
import { copy } from "@/ui/copy";

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
				<DialogFooter>
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
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
