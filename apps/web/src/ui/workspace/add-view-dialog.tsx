import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tabelo/ui/components/dialog";
import { type ReactNode, useId, useState } from "react";
import { copy } from "@/copy/copy";
import { useTabeloStore } from "@/state/store";
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
import type { SplitOption } from "@/workspace/layout";
import { availabilityForView } from "./view-availability";

// Adding a view is one question asked once: which view goes in the pane the
// split is about to create. Asking up front is what lets the split and the view
// land in a single update, so no workspace holding a pane with an unchosen view
// is ever rendered. See docs/adr/0006.

interface AddViewDialogProps {
	// The split this is choosing a view for. Null closes the dialog, so the
	// pending split and the open state cannot disagree.
	readonly option: SplitOption | null;
	readonly onClose: () => void;
	// The pane that was created, handed back so focus can be placed in it.
	readonly onAdded: (paneId: string) => void;
}

export function AddViewDialog({
	option,
	onClose,
	onAdded,
}: AddViewDialogProps) {
	const panes = useTabeloStore((state) => state.workspace.panes);
	const document = useTabeloStore((state) => state.document);
	const [chosen, setChosen] = useState<ViewId | null>(null);
	const titleId = useId();
	const hintId = useId();

	const views = listViews();
	const splitPane = panes.find((pane) => pane.id === option?.paneId);

	const availabilityFor = (id: ViewId) =>
		availabilityForView({ view: getView(id), panes, document });

	const offered = views.filter(
		(view) => availabilityFor(view.id) === undefined,
	);
	// Falls back rather than staying null, so the confirm button always has a
	// meaning while any view at all can be added.
	const selected =
		chosen && availabilityFor(chosen) === undefined ? chosen : offered[0]?.id;

	const add = () => {
		if (!option || !selected) return;
		useTabeloStore.getState().addPaneBySplit(option, selected);
		onAdded(useTabeloStore.getState().workspace.activePaneId);
		setChosen(null);
		onClose();
	};

	return (
		<Dialog
			open={option !== null}
			onOpenChange={(next) => {
				if (next) return;
				setChosen(null);
				onClose();
			}}
		>
			<DialogContent
				showCloseButton={false}
				aria-labelledby={titleId}
				aria-describedby={hintId}
				className={singleSelectionDialogContentStyles}
			>
				<DialogHeader>
					<DialogTitle id={titleId}>{copy.addView.title}</DialogTitle>
					<DialogDescription id={hintId} className="text-sm">
						{option && splitPane
							? copy.addView.hint(
									option.edge,
									copy.a11y.pane(getView(splitPane.view).label),
								)
							: null}
					</DialogDescription>
				</DialogHeader>

				<SingleSelectionList
					aria-label={copy.addView.view}
					value={selected ?? ""}
					onValueChange={(value) => setChosen(value as ViewId)}
				>
					{views.map((candidate) => (
						<ViewChoice
							key={candidate.id}
							id={candidate.id}
							label={candidate.label}
							description={candidate.description}
							icon={<candidate.icon />}
							availability={availabilityFor(candidate.id)}
							selected={selected === candidate.id}
						/>
					))}
				</SingleSelectionList>

				<DialogActions>
					<DialogCancel>{copy.actions.cancel}</DialogCancel>
					<DialogConfirm
						disabledReason={
							selected ? undefined : copy.disabled.chooseAvailableView
						}
						onClick={add}
					>
						{copy.addView.confirm}
					</DialogConfirm>
				</DialogActions>
			</DialogContent>
		</Dialog>
	);
}

interface ViewChoiceProps {
	readonly id: ViewId;
	readonly label: string;
	readonly description: string;
	readonly icon: ReactNode;
	readonly selected: boolean;
	readonly availability: ReturnType<typeof availabilityForView>;
}

function ViewChoice({
	id,
	label,
	description,
	icon,
	selected,
	availability,
}: ViewChoiceProps) {
	return (
		<SingleSelectionOption
			value={id}
			selected={selected}
			availability={availability}
			icon={icon}
			label={label}
			description={description}
		/>
	);
}
