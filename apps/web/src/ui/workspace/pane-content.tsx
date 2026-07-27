import { lazy, Suspense, useMemo } from "react";
import { isDocumentBlank } from "@/core/document";
import { useTabeloStore } from "@/state/store";
import { EmptyState } from "@/ui/grid/empty-state";
import { TableGrid } from "@/ui/grid/table-grid";
import type { ViewDefinition } from "@/views/types";

// CodeMirror and the preview are the two heavy things in the bundle, and a
// workspace showing only the grid should not pay for either. Both load on
// first use and stay loaded.
const SourceView = lazy(() => import("@/ui/source/source-view"));
const HtmlPreview = lazy(() => import("@/ui/preview/html-preview"));

function PaneLoading() {
	return (
		<div className="flex h-full items-center justify-center">
			<span className="text-muted-foreground text-xs">Loading…</span>
		</div>
	);
}

function GridPane({ zoom }: { readonly zoom: number }) {
	const document = useTabeloStore((state) => state.document);
	const blank = useMemo(() => isDocumentBlank(document), [document]);

	return (
		<>
			<TableGrid zoom={zoom} />
			{blank ? <EmptyState /> : null}
		</>
	);
}

// Rendering is chosen by the view's kind, never by its id — that is what keeps
// adding a format from touching this file.
interface PaneContentProps {
	readonly paneId: string;
	readonly view: ViewDefinition;
	// Content scale. Text-only views read it from `--pane-zoom` in the cascade;
	// the grid needs the number because column widths are measured, not styled.
	readonly zoom: number;
}

export function PaneContent({ paneId, view, zoom }: PaneContentProps) {
	if (view.kind === "grid") return <GridPane zoom={zoom} />;

	return (
		<Suspense fallback={<PaneLoading />}>
			{view.kind === "preview" ? (
				<HtmlPreview />
			) : (
				<SourceView key={view.id} paneId={paneId} viewId={view.id} />
			)}
		</Suspense>
	);
}
