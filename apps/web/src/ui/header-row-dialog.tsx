import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tabelo/ui/components/dialog";
import { useRef } from "react";
import { copy } from "@/copy/copy";
import { useTabeloStore } from "@/state/store";
import {
	DialogActions,
	DialogAlternative,
	DialogCancel,
	DialogConfirm,
} from "@/ui/primitives/dialog-buttons";
import { paneEntryTarget } from "@/ui/primitives/panel";

export function HeaderRowDialog({
	onImported,
}: {
	readonly onImported: () => void;
}) {
	const open = useTabeloStore((state) => state.pendingImport !== null);
	const answered = useRef(false);

	const answer = (headerRow: boolean) => {
		answered.current = true;
		useTabeloStore.getState().answerPendingImport(headerRow);
		onImported();
	};

	// An answer replaces the document, so the cell that opened the question no
	// longer exists and the dialog would hand focus to nothing; the workspace
	// then fell back to the pane itself, one level out, where the arrow keys do
	// nothing (#350). Focus goes where entering the active pane would put it.
	// A cancel changes nothing, so the primitive's own return still holds.
	const finalFocus = () => {
		if (!answered.current) return true;
		answered.current = false;
		// This runs after the close transition, so anything the user focused in
		// the meantime wins: only focus that is still lost is placed.
		// Lost means the body, the closing dialog's own portal (its buttons and
		// focus guards), or a pane frame, which is where the primitive's own
		// fallback lands when the element that opened the dialog is gone.
		const active = window.document.activeElement;
		if (
			active !== null &&
			active !== window.document.body &&
			!active.closest("[data-base-ui-portal]") &&
			!active.hasAttribute("data-pane-id")
		) {
			return false;
		}
		const { activePaneId } = useTabeloStore.getState().workspace;
		const pane = document.querySelector<HTMLElement>(
			`[data-pane-id="${activePaneId}"]`,
		);
		return (pane && paneEntryTarget(pane)) ?? true;
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) useTabeloStore.getState().cancelPendingImport();
			}}
		>
			<DialogContent showCloseButton={false} finalFocus={finalFocus}>
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
