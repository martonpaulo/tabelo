import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tabelo/ui/components/dialog";
import { useEffect, useId, useState } from "react";
import { copy } from "@/copy/copy";
import { useTabeloStore } from "@/state/store";
import { preconditionRecovery } from "@/ui/precondition-recovery";
import {
	DialogActions,
	DialogCancel,
	DialogConfirm,
} from "@/ui/primitives/dialog-buttons";
import {
	SingleSelectionList,
	SingleSelectionOption,
	singleSelectionDialogContentStyles,
} from "@/ui/primitives/single-selection-list";
import { getView, listViews } from "@/views/registry";
import type { ViewId } from "@/views/types";
import { availabilityForView } from "./view-availability";

export function ChangeViewDialog({
	paneId,
	onClose,
}: {
	readonly paneId: string | null;
	readonly onClose: () => void;
}) {
	const panes = useTabeloStore((state) => state.workspace.panes);
	const document = useTabeloStore((state) => state.document);
	const pane = panes.find((candidate) => candidate.id === paneId);
	const current = pane ? getView(pane.view) : null;
	const [chosen, setChosen] = useState<ViewId | null>(null);
	const titleId = useId();
	const hintId = useId();

	useEffect(() => {
		if (paneId && current) setChosen(current.id);
	}, [current, paneId]);

	const selected = chosen ?? current?.id;
	const change = () => {
		if (!paneId || !selected || selected === current?.id) return;
		useTabeloStore.getState().setPaneView(paneId, selected);
		onClose();
	};

	return (
		<Dialog
			open={paneId !== null && current !== null}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<DialogContent
				showCloseButton={false}
				aria-labelledby={titleId}
				aria-describedby={hintId}
				className={singleSelectionDialogContentStyles}
			>
				<DialogHeader>
					<DialogTitle id={titleId}>{copy.workspace.changeView}</DialogTitle>
					<DialogDescription id={hintId} className="text-sm">
						{current ? copy.workspace.changeViewHint(current.label) : null}
					</DialogDescription>
				</DialogHeader>

				<SingleSelectionList
					aria-label={copy.workspace.changeView}
					value={selected ?? ""}
					onValueChange={(value) => setChosen(value as ViewId)}
				>
					{listViews().map((candidate) => {
						const availability = availabilityForView({
							view: candidate,
							panes,
							document,
							currentPaneId: paneId ?? undefined,
							currentViewId: current?.id,
						});
						return (
							<SingleSelectionOption
								key={candidate.id}
								value={candidate.id}
								selected={selected === candidate.id}
								icon={<candidate.icon />}
								label={candidate.label}
								description={candidate.description}
								availability={availability?.availability}
								recovery={
									preconditionRecovery(availability?.failure ?? null) ??
									undefined
								}
								onRecover={onClose}
							/>
						);
					})}
				</SingleSelectionList>

				<DialogActions>
					<DialogCancel>{copy.actions.cancel}</DialogCancel>
					<DialogConfirm
						disabledReason={
							selected === current?.id
								? copy.disabled.viewAlreadyShown
								: undefined
						}
						onClick={change}
					>
						{copy.workspace.changeView}
					</DialogConfirm>
				</DialogActions>
			</DialogContent>
		</Dialog>
	);
}
