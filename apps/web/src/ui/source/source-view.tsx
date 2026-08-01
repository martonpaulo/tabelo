import { useContext, useMemo } from "react";
import { copy } from "@/copy/copy";
import { textForView, useTabeloStore } from "@/state/store";
import { PaneEntryContext } from "@/ui/workspace/use-pane-entry";
import { getView } from "@/views/registry";
import type { ViewId } from "@/views/types";
import { BlockedState } from "./blocked-state";
import { type SourceDiagnostic, SourceEditor } from "./source-editor";
import { sourceFeedbackIds } from "./source-feedback";

// One component serves every source format. What differs between Markdown, CSV,
// TSV, HTML, Jira, and JSON is entirely described by the registry: codec, highlight
// language, editability, so there is nothing here that names a format.

interface SourceViewProps {
	readonly paneId: string;
	readonly viewId: ViewId;
	readonly zoom: number;
	readonly wrap: boolean;
}

export default function SourceView({
	paneId,
	viewId,
	zoom,
	wrap,
}: SourceViewProps) {
	const view = getView(viewId);
	const document = useTabeloStore((state) => state.document);
	const entered = useContext(PaneEntryContext);

	// The projection recomputes only when the document changes, not when some
	// other pane is being typed into.
	const projected = useMemo(
		() => textForView(document, viewId),
		[document, viewId],
	);

	// Only the view holding the pending draft shows unsaved text; every other
	// view is a pure projection. See docs/adr/0001.
	const draft = useTabeloStore((state) =>
		state.draft?.paneId === paneId && state.draft.viewId === viewId
			? state.draft
			: null,
	);

	const invalid = draft?.status === "invalid";
	const diagnostics = useMemo((): readonly SourceDiagnostic[] => {
		if (!draft) return [];
		const severity = draft.status === "invalid" ? "error" : "warning";
		const details = draft.status === "invalid" ? draft.issues : draft.warnings;
		return details.map((issue) => ({
			line: issue.line,
			message: copy.source.issue(issue),
			severity,
		}));
	}, [draft]);

	const editable = view.capabilities.editable;
	const feedbackIds = sourceFeedbackIds(paneId);

	// The editor description exists for the pane's lifetime, so diagnostics
	// update an element assistive technology already knows. It is not a live
	// region because aria-describedby is the sole announcement channel here.
	const description = diagnostics.map(({ message }) => message).join(" ");
	if (!projected.ok) return <BlockedState failure={projected.failure} />;

	return (
		<>
			<p id={feedbackIds.description} className="sr-only">
				{description}
			</p>
			<SourceEditor
				paneId={paneId}
				zoom={zoom}
				wrap={wrap}
				value={draft?.text ?? projected.text}
				language={view.highlight}
				diagnostics={diagnostics}
				invalid={invalid}
				entered={entered}
				describedBy={description ? feedbackIds.description : undefined}
				editable={editable}
				ariaLabel={copy.a11y.sourceEditor(view.label)}
				onChange={(text) => {
					if (!editable) return;
					useTabeloStore.getState().setDraft(paneId, viewId, text);
				}}
				onUndoBeyondLocal={() => useTabeloStore.getState().undo()}
				onRedoBeyondLocal={() => useTabeloStore.getState().redo()}
			/>
		</>
	);
}
