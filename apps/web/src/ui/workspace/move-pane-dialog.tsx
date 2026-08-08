import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@tabelo/ui/components/dialog";
import { useEffect, useId, useMemo, useState } from "react";
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
import { getView } from "@/views/registry";
import { getLayout, movePaneDestinations } from "@/workspace/layout";
import { LayoutGlyph } from "./layout-glyph";

export function MovePaneDialog({
	paneId,
	onClose,
}: {
	readonly paneId: string | null;
	readonly onClose: () => void;
}) {
	const workspace = useTabeloStore((state) => state.workspace);
	const pane = workspace.panes.find((candidate) => candidate.id === paneId);
	const destinations = useMemo(
		() => movePaneDestinations(workspace, paneId ?? ""),
		[workspace, paneId],
	);
	const [selected, setSelected] = useState<string | null>(null);
	const titleId = useId();
	const hintId = useId();

	useEffect(() => {
		if (!paneId) {
			setSelected(null);
			return;
		}
		setSelected((current) =>
			destinations.some((destination) => destination.paneId === current)
				? current
				: (destinations[0]?.paneId ?? null),
		);
	}, [destinations, paneId]);

	const move = () => {
		if (!paneId || !selected) return;
		if (useTabeloStore.getState().movePane(paneId, selected)) onClose();
	};

	const selectedAvailable = destinations.some(
		(destination) => destination.paneId === selected,
	);

	return (
		<Dialog
			open={paneId !== null && pane !== undefined}
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
					<DialogTitle id={titleId}>{copy.workspace.movePane}</DialogTitle>
					<DialogDescription id={hintId} className="text-sm">
						{pane
							? copy.workspace.movePaneHint(getView(pane.view).label)
							: null}
					</DialogDescription>
				</DialogHeader>

				<SingleSelectionList
					aria-label={copy.workspace.moveDestination}
					value={selected ?? ""}
					onValueChange={setSelected}
				>
					{destinations.map((destination) => {
						const destinationPane = workspace.panes.find(
							(candidate) => candidate.id === destination.paneId,
						);
						return (
							<SingleSelectionOption
								key={destination.paneId}
								value={destination.paneId}
								selected={selected === destination.paneId}
								icon={
									<LayoutGlyph
										preset={getLayout(workspace.layout)}
										highlightSlots={destination.slots}
									/>
								}
								label={copy.panePositions[destination.position]}
								description={
									destinationPane
										? copy.workspace.destinationView(
												getView(destinationPane.view).label,
											)
										: undefined
								}
							/>
						);
					})}
				</SingleSelectionList>

				<DialogActions>
					<DialogCancel>{copy.actions.cancel}</DialogCancel>
					<DialogConfirm
						disabledReason={
							selectedAvailable
								? undefined
								: copy.disabled.chooseMoveDestination
						}
						onClick={move}
					>
						{copy.workspace.movePane}
					</DialogConfirm>
				</DialogActions>
			</DialogContent>
		</Dialog>
	);
}
