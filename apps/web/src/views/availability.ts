import type { TableDocument } from "@/core/types";
import { canSerialize } from "@/formats";
import type { PreconditionFailure } from "@/formats/types";
import type { WorkspacePane } from "@/workspace/layout";
import type { ViewDefinition, ViewId } from "./types";

type ViewChoiceRefusal =
	| { readonly code: "duplicate_view" }
	| {
			readonly code: "view_precondition";
			readonly failure: PreconditionFailure;
	  };

// UI choices, store commands, and external callers all use the same rule.
// Presentation translates the reason; this layer never owns user-facing copy.
export function viewChoiceRefusal({
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
}): ViewChoiceRefusal | null {
	if (panes.some((pane) => pane.id !== currentPaneId && pane.view === view.id))
		return { code: "duplicate_view" };
	if (view.id === currentViewId || !view.codec) return null;
	const failure = canSerialize(view.codec, document);
	return failure ? { code: "view_precondition", failure } : null;
}
