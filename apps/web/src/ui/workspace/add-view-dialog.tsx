import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@tabelo/ui/components/dialog";
import { useId, useState } from "react";
import { copy } from "@/copy/copy";
import { canSerialize } from "@/formats";
import { useTabeloStore } from "@/state/store";
import { DialogCancel, DialogConfirm } from "@/ui/primitives/dialog-buttons";
import { MenuOption } from "@/ui/primitives/menu-option";
import {
	SingleSelectionList,
	SingleSelectionOption,
} from "@/ui/primitives/single-selection-list";
import { getView, listViews } from "@/views/registry";
import type { ViewId } from "@/views/types";
import type { SplitOption } from "@/workspace/layout";

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

	const reasonFor = (id: ViewId): string | undefined => {
		// One view per workspace is an invariant the persisted schema validates,
		// so the picker states it rather than discovering it after the fact.
		if (panes.some((pane) => pane.view === id)) {
			return copy.disabled.viewAlreadyOpen(getView(id).label);
		}
		const codec = getView(id).codec;
		const failure = codec ? canSerialize(codec, document) : null;
		return failure ? copy.disabled.codecPrecondition(failure) : undefined;
	};

	const offered = views.filter((view) => reasonFor(view.id) === undefined);
	// Falls back rather than staying null, so the confirm button always has a
	// meaning while any view at all can be added.
	const selected =
		chosen && reasonFor(chosen) === undefined ? chosen : offered[0]?.id;

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
				className="text-sm"
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
							reason={reasonFor(candidate.id)}
							selected={selected === candidate.id}
						/>
					))}
				</SingleSelectionList>

				<DialogFooter>
					<DialogCancel>{copy.actions.cancel}</DialogCancel>
					<DialogConfirm disabled={!selected} onClick={add}>
						{copy.addView.confirm}
					</DialogConfirm>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

interface ViewChoiceProps {
	readonly id: ViewId;
	readonly label: string;
	readonly description: string;
	readonly selected: boolean;
	// Why this view cannot be added. Disabled and explained rather than hidden,
	// so a view the user is looking for never simply vanishes from the list.
	readonly reason: string | undefined;
}

function ViewChoice({
	id,
	label,
	description,
	selected,
	reason,
}: ViewChoiceProps) {
	return (
		<SingleSelectionOption
			value={id}
			selected={selected}
			disabledReason={reason}
		>
			<MenuOption label={label} description={description} />
		</SingleSelectionOption>
	);
}
