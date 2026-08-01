import { copy } from "@/copy/copy";
import type { TableDocument } from "@/core/types";
import { canSerialize } from "@/formats";
import type { SelectionOptionAvailability } from "@/ui/primitives/selection-option";
import type { ViewDefinition, ViewId } from "@/views/types";
import type { WorkspacePane } from "@/workspace/layout";

// Add view and Change view ask the same availability question. Keeping it here
// stops an already-open view from becoming an error in one chooser and an
// ordinary disabled row in the other.
export function availabilityForView({
	view,
	panes,
	document,
	currentPaneId,
	currentViewId,
}: {
	readonly view: ViewDefinition;
	readonly panes: readonly WorkspacePane[];
	readonly document: TableDocument;
	readonly currentPaneId?: string;
	readonly currentViewId?: ViewId;
}): SelectionOptionAvailability | undefined {
	if (
		panes.some((pane) => pane.id !== currentPaneId && pane.view === view.id)
	) {
		return {
			kind: "in-use",
			reason: copy.disabled.viewAlreadyOpen(view.label),
		};
	}

	if (view.id === currentViewId || !view.codec) return undefined;
	const failure = canSerialize(view.codec, document);
	return failure
		? {
				kind: "unavailable",
				reason: copy.disabled.codecPrecondition(failure),
			}
		: undefined;
}
