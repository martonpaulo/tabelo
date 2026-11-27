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

// One question with one decisive answer, asked the same way wherever it is
// asked: delete this table, erase everything Tabelo stored, and anything else
// that cannot be undone, or, with `destructive` off, a choice that loses
// nothing, such as keeping long numbers as text (#548). The copy comes from
// the caller so it stays in copy.ts.
interface ConfirmDialogProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	// When a close has finished its transition, for a flow whose next step
	// may only open once this one is gone (see the design system's one-dialog
	// rule).
	readonly onOpenChangeComplete?: (open: boolean) => void;
	readonly onConfirm: () => void;
	readonly title: string;
	readonly description: string;
	readonly confirmLabel: string;
	// Off for a choice that removes nothing.
	readonly destructive?: boolean;
}

export function ConfirmDialog({
	open,
	onOpenChange,
	onOpenChangeComplete,
	onConfirm,
	title,
	description,
	confirmLabel,
	destructive = true,
}: ConfirmDialogProps) {
	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			onOpenChangeComplete={onOpenChangeComplete}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<DialogActions>
					<DialogCancel>{copy.actions.cancel}</DialogCancel>
					<DialogConfirm
						destructive={destructive}
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
