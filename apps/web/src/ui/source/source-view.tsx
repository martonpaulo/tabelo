import { useMemo } from "react";
import { textForView, useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import { getView } from "@/views/registry";
import type { ViewId } from "@/views/types";
import { SourceEditor } from "./source-editor";

// One component serves every source format. What differs between Markdown, CSV,
// TSV, HTML, and Jira is entirely described by the registry — codec, highlight
// language, editability — so there is nothing here that names a format.

interface SourceViewProps {
	readonly paneId: string;
	readonly viewId: ViewId;
}

export default function SourceView({ paneId, viewId }: SourceViewProps) {
	const view = getView(viewId);
	const document = useTabeloStore((state) => state.document);

	// The projection recomputes only when the document changes, not when some
	// other pane is being typed into.
	const projected = useMemo(
		() => textForView(document, viewId),
		[document, viewId],
	);

	// Only the view holding the pending draft shows unsaved text; every other
	// view is a pure projection. See docs/adr/0001.
	const draftText = useTabeloStore((state) =>
		state.draft?.paneId === paneId && state.draft.viewId === viewId
			? state.draft.text
			: null,
	);
	const isDraftOwner = draftText !== null;

	const issues = useTabeloStore((state) => state.issues);
	const invalidLine = isDraftOwner
		? (issues.find((issue) => issue.line !== undefined)?.line ?? null)
		: null;

	const editable = view.capabilities.editable;

	return (
		<SourceEditor
			value={draftText ?? projected}
			language={view.highlight}
			invalidLine={invalidLine}
			editable={editable}
			ariaLabel={copy.a11y.sourceEditor(view.label)}
			onChange={(text) => {
				if (!editable) return;
				useTabeloStore.getState().setDraft(paneId, viewId, text);
			}}
			onUndoBeyondLocal={() => useTabeloStore.getState().undo()}
			onRedoBeyondLocal={() => useTabeloStore.getState().redo()}
		/>
	);
}
