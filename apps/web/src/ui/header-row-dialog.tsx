import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tabelo/ui/components/dialog";
import { copy } from "@/copy/copy";
import { useTabeloStore } from "@/state/store";
import {
	DialogActions,
	DialogAlternative,
	DialogCancel,
	DialogConfirm,
} from "@/ui/primitives/dialog-buttons";

export function HeaderRowDialog({
	onImported,
}: {
	readonly onImported: () => void;
}) {
	const open = useTabeloStore((state) => state.pendingImport !== null);

	const answer = (headerRow: boolean) => {
		useTabeloStore.getState().answerPendingImport(headerRow);
		onImported();
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) useTabeloStore.getState().cancelPendingImport();
			}}
		>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>{copy.headerImport.title}</DialogTitle>
					<DialogDescription>{copy.headerImport.description}</DialogDescription>
				</DialogHeader>
				<DialogActions>
					<DialogCancel>{copy.actions.cancel}</DialogCancel>
					<DialogAlternative onClick={() => answer(false)}>
						{copy.headerImport.asData}
					</DialogAlternative>
					<DialogConfirm onClick={() => answer(true)}>
						{copy.headerImport.asHeaders}
					</DialogConfirm>
				</DialogActions>
			</DialogContent>
		</Dialog>
	);
}
