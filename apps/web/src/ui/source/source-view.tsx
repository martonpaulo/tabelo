import { useContext, useEffect, useMemo } from "react";
import { copy } from "@/copy/copy";
import { usePreferences } from "@/preferences/use-preferences";
import { textForView, useTabeloStore } from "@/state/store";
import { PaneEntryContext } from "@/ui/workspace/use-pane-entry";
import { useReportPaneOccurrences } from "@/ui/workspace/use-pane-occurrences";
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
	// The indicator preferences drive every marker in every pane: see #93.
	// Nothing about them is pane state, so they neither reach the workspace nor
	// survive as a copy here.
	const { spaceIndicators, tabIndicators, emptyValueIndicators } =
		usePreferences();

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

	// Leaving for the grid or the preview, and the pane closing, both unmount
	// this component while the header outlives it, so the summary has to be
	// dropped on the way out. A change to another source view keeps this
	// component mounted and is the editor's own business: it ends the multiple
	// selection there, which clears the header through the ordinary path.
	const reportOccurrences = useReportPaneOccurrences();
	useEffect(() => {
		return () => reportOccurrences(null);
	}, [reportOccurrences]);

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
				viewId={viewId}
				zoom={zoom}
				wrap={wrap}
				value={draft?.text ?? projected.text}
				language={view.highlight}
				spaceIndicators={spaceIndicators}
				tabIndicators={tabIndicators}
				emptyValueIndicators={emptyValueIndicators}
				fieldSeparator={view.codec?.fieldSeparator}
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
				onOccurrencesChange={reportOccurrences}
				onOccurrenceAdded={({ selected, total }) =>
					// The app's one polite region, shared rather than added to: see
					// docs/design-system.md §4. The header carries the same sentence
					// visibly, so this is the spoken half of one piece of feedback.
					useTabeloStore
						.getState()
						.announceStatus(copy.workspace.occurrencesSelected(selected, total))
				}
			/>
		</>
	);
}
