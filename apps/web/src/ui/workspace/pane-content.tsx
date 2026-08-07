import { lazy, Suspense } from "react";
import { copy } from "@/copy/copy";
import { canSerialize } from "@/formats";
import { useTabeloStore } from "@/state/store";
import { TableGrid } from "@/ui/grid/table-grid";
import { BlockedState } from "@/ui/source/blocked-state";
import type { ViewDefinition } from "@/views/types";

// CodeMirror and the preview are the two heavy things in the bundle, and a
// workspace showing only the grid should not pay for either. Both load on
// first use and stay loaded. Which views are lazy is declared per view in
// `views/registry.ts` (`loading`); this file never singles out a view by id
// or kind to decide how it loads.
const SourceView = lazy(() => import("@/ui/source/source-view"));
const HtmlPreview = lazy(() => import("@/ui/preview/html-preview"));

function PaneLoading() {
	return (
		<div role="status" className="flex h-full items-center justify-center">
			<span className="text-muted-foreground text-sm">
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
	readonly wrap: boolean;
}

export function PaneContent({ paneId, view, zoom, wrap }: PaneContentProps) {
	const document = useTabeloStore((state) => state.document);
	const failure = view.codec ? canSerialize(view.codec, document) : null;
	if (failure) return <BlockedState failure={failure} />;

	// Every view goes through this one path. Whether it shows a loading state
	// first comes from its own registry declaration, not from a check against
	// `view.kind` here.
	const fallback = view.loading === "lazy" ? <PaneLoading /> : null;

	return (
		<Suspense fallback={fallback}>
			{view.kind === "grid" ? (
				<GridPane zoom={zoom} />
			) : view.kind === "preview" ? (
				<HtmlPreview />
			) : (
				// Deliberately unkeyed: one source view replaces another in place, so
				// the editor is reconfigured rather than torn down and rebuilt. A key
				// here would remount CodeMirror on every view change, which flashes an
				// empty editor for a frame and discards the caret and the local undo
				// history with it.
				<SourceView paneId={paneId} viewId={view.id} zoom={zoom} wrap={wrap} />
			)}
		</Suspense>
	);
}
