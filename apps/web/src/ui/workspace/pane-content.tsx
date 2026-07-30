import { lazy, Suspense } from "react";
import { canSerialize } from "@/formats";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import { TableGrid } from "@/ui/grid/table-grid";
import { BlockedState } from "@/ui/source/blocked-state";
import type { ViewDefinition } from "@/views/types";

// CodeMirror and the preview are the two heavy things in the bundle, and a
// workspace showing only the grid should not pay for either. Both load on
// first use and stay loaded.
const SourceView = lazy(() => import("@/ui/source/source-view"));
const HtmlPreview = lazy(() => import("@/ui/preview/html-preview"));

function PaneLoading() {
	return (
		<div className="flex h-full items-center justify-center">
			<span className="text-muted-foreground text-xs">
				{copy.status.loading}
			</span>
		</div>
	);
}

function GridPane({ zoom }: { readonly zoom: number }) {
	return <TableGrid zoom={zoom} />;
}

// Rendering is chosen by the view's kind, never by its id. That is what keeps
// adding a format from touching this file.
interface PaneContentProps {
	readonly paneId: string;
	readonly view: ViewDefinition;
	// Content scale. Text-only views read it from `--pane-zoom` in the cascade;
	// the grid needs the number because column widths are measured, not styled.
	readonly zoom: number;
}

export function PaneContent({ paneId, view, zoom }: PaneContentProps) {
	const document = useTabeloStore((state) => state.document);
	if (view.kind === "grid") return <GridPane zoom={zoom} />;
	const failure = view.codec ? canSerialize(view.codec, document) : null;
	if (failure) return <BlockedState failure={failure} />;

	return (
		<Suspense fallback={<PaneLoading />}>
			{view.kind === "preview" ? (
				<HtmlPreview />
			) : (
				<SourceView
					key={view.id}
					paneId={paneId}
					viewId={view.id}
					zoom={zoom}
				/>
			)}
		</Suspense>
	);
}
