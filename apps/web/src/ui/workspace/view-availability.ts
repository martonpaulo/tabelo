import { copy } from "@/copy/copy";
import type { TableDocument } from "@/core/types";
import { canSerialize } from "@/formats";
import type { PreconditionFailure } from "@/formats/types";
import type { SelectionOptionAvailability } from "@/ui/primitives/selection-option";
import type { ViewDefinition, ViewId } from "@/views/types";
import type { WorkspacePane } from "@/workspace/layout";

// Why a view cannot be chosen, and, when a codec refused it, the failure that
// says so. The two travel together so a chooser never recomputes or decodes a
// refusal to offer its correction: the reason the user reads and the position
// the correction goes to come from the same result.
export interface ViewAvailability {
	readonly availability: SelectionOptionAvailability;
	readonly failure: PreconditionFailure | null;
}

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
}): ViewAvailability | undefined {
	if (
		panes.some((pane) => pane.id !== currentPaneId && pane.view === view.id)
	) {
		return {
			availability: {
				kind: "in-use",
				reason: copy.disabled.viewAlreadyOpen(view.label),
			},
			failure: null,
		};
	}

	if (view.id === currentViewId || !view.codec) return undefined;
	const failure = canSerialize(view.codec, document);
	return failure
		? {
				availability: {
					kind: "unavailable",
					reason: copy.disabled.codecPrecondition(failure),
				},
				failure,
			}
		: undefined;
}
