import { type ComponentType, lazy, Suspense, useState } from "react";
import { copy } from "@/copy/copy";
import { canSerialize } from "@/formats";
import { useTabeloStore } from "@/state/store";
import { TableGrid } from "@/ui/grid/table-grid";
import { BlockedState } from "@/ui/source/blocked-state";
import type { ViewDefinition, ViewKind } from "@/views/types";
import type { SourceDisplayOverrides } from "@/workspace/source-display";

// A code-split view that can be loaded ahead of its first render. React.lazy
// suspends the first render of every lazy component, even one whose module has
// already arrived, and React then holds the loading state on screen for at
// least 300 ms before revealing the content (its fallback throttle). So a
// module that is already here is rendered directly instead, and the loading
// state is left for a module that genuinely is not. Which path a mounted pane
// takes is fixed when it mounts: switching from the lazy wrapper to the direct
// component later would be a different element type, and React would remount
// the view, taking CodeMirror's caret and local history with it.
function preloadableView<Props extends object>(
	load: () => Promise<{ readonly default: ComponentType<Props> }>,
) {
	let loaded: ComponentType<Props> | null = null;
	let pending: Promise<{ readonly default: ComponentType<Props> }> | null =
		null;
	const preload = () => {
		pending ??= load().then((module) => {
			loaded = module.default;
			return module;
		});
		return pending;
	};
	const Suspending = lazy(preload);
	function View(props: Props) {
		const [Direct] = useState(() => loaded);
		return Direct ? <Direct {...props} /> : <Suspending {...props} />;
	}
	return { View, preload };
}

// CodeMirror and the preview are the two heavy things in the bundle, so neither
// is in the initial one, and a workspace showing only the grid paints without
// waiting for either. Which views are lazy is declared per view in
// `views/registry.ts` (`loading`); this file never singles out a view by id
// or kind to decide how it loads.
const sourceView = preloadableView(() => import("@/ui/source/source-view"));
const htmlPreview = preloadableView(() => import("@/ui/preview/html-preview"));
const SourceView = sourceView.View;
const HtmlPreview = htmlPreview.View;

const preloadByKind: Readonly<
	Record<ViewKind, (() => Promise<unknown>) | null>
> = {
	grid: null,
	preview: htmlPreview.preload,
	source: sourceView.preload,
};

// Loads the code of every lazy view in the list and settles when all of it is
// here. A failed load settles too: the pane's own lazy path then meets the same
// failure it always did.
export function preloadPaneContent(
	views: readonly ViewDefinition[],
): Promise<void> {
	const loads = views
		.filter((view) => view.loading === "lazy")
		.map((view) => preloadByKind[view.kind]?.());
	return Promise.allSettled(loads).then(() => undefined);
}

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
	// The pane's own source display choices, resolved by the source view.
	readonly display: SourceDisplayOverrides;
}

export function PaneContent({ paneId, view, zoom, display }: PaneContentProps) {
	const document = useTabeloStore((state) => state.document);
	const failure = view.codec ? canSerialize(view.codec, document) : null;
	if (failure) return <BlockedState failure={failure} target={view.label} />;

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
				<SourceView
					paneId={paneId}
					viewId={view.id}
					zoom={zoom}
					overrides={display}
				/>
			)}
		</Suspense>
	);
}
