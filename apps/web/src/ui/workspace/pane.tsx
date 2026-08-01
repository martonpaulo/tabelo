import { disclosureTransitionStyles } from "@tabelo/ui/components/motion-styles";
import { cn } from "@tabelo/ui/lib/utils";
import { Plus } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { copy } from "@/copy/copy";
import { useTabeloStore } from "@/state/store";
import { Panel } from "@/ui/primitives/panel";
import { getView } from "@/views/registry";
import {
	gridAreaStyle,
	type LayoutId,
	type SplitEdge,
	type SplitOption,
	type WorkspacePane,
} from "@/workspace/layout";
import { PaneContent } from "./pane-content";
import { PaneIdentity, PaneMenu } from "./pane-menu";
import { PaneEntryContext, usePaneEntry } from "./use-pane-entry";

// One pane frame for every view. The header carries only what belongs to this
// pane: which view it shows and the state of that view. Document-level
// actions live in the floating app menu: see docs/design-system.md §5.

interface PaneProps {
	readonly pane: WorkspacePane;
	readonly active: boolean;
	// With one pane there is no competing selection to identify. The pane still
	// owns focus and aria-current, but the persistent active edge would be noise.
	readonly showActiveIndicator: boolean;
	// A pane occupying a single slot has half the width, so its header labels
	// shorten rather than wrap.
	readonly compact: boolean;
	// Stacked, the pane takes the full width in reading order and must not name
	// a slot: an inline grid area pointing at column two would conjure that
	// column back into existence.
	readonly stacked: boolean;
	// The layout each of this pane's splits would reach, one per edge it can be
	// cut along. Both absent means this pane cannot be cut in half, which is
	// what makes the control disappear at four panes; both present is the
	// whole-grid pane of "single", which can be cut either way.
	//
	// Passed apart rather than as option objects, because this component is
	// memoized: a freshly derived object every render would defeat that and
	// re-render every pane on any workspace change, which is enough to unsettle
	// a menu that is open inside one.
	readonly splitBottom: LayoutId | undefined;
	readonly splitRight: LayoutId | undefined;
	readonly onSplit: (option: SplitOption) => void;
	readonly onChangeView: (
		paneId: string,
		opener: HTMLButtonElement | null,
	) => void;
	// Set for the pane a split just created, so it says so once.
	readonly justAdded: boolean;
}

export const Pane = memo(function Pane({
	pane,
	active,
	showActiveIndicator,
	compact,
	stacked,
	splitBottom,
	splitRight,
	onSplit,
	onChangeView,
	justAdded,
}: PaneProps) {
	const view = getView(pane.view);
	const ref = useRef<HTMLElement>(null);
	const entered = usePaneEntry(ref);

	const [announcement, setAnnouncement] = useState("");
	useEffect(() => {
		if (justAdded) setAnnouncement(copy.a11y.paneAdded(view.label));
		else if (entered) setAnnouncement(copy.a11y.enteredPane);
		else setAnnouncement("");
	}, [entered, justAdded, view.label]);

	return (
		<PaneEntryContext.Provider value={entered}>
			<Panel
				ref={ref}
				data-pane-id={pane.id}
				aria-current={active ? "true" : undefined}
				aria-label={copy.a11y.pane(view.label)}
				aria-description={entered ? undefined : copy.a11y.paneInteractHint}
				style={stacked ? undefined : { gridArea: gridAreaStyle(pane.slots) }}
				className={cn(
					"group/pane min-w-0",
					// Tall enough to be worth scrolling to, and still allowed to grow
					// when it is the only pane on screen.
					stacked && "min-h-pane-stack flex-1",
				)}
				onPointerDownCapture={() => {
					if (!active) useTabeloStore.getState().setActivePane(pane.id);
				}}
				onFocusCapture={() => {
					if (!active) useTabeloStore.getState().setActivePane(pane.id);
				}}
			>
				{/* Static identity and one command trigger share the row. The spacer
				    keeps the actions button right-aligned as the name shortens. */}
				<Panel.Header className="overflow-hidden">
					<PaneIdentity view={view} compact={compact} />
					<Panel.Spacer />
					<PaneMenu
						paneId={pane.id}
						view={view}
						onChangeView={(opener) => onChangeView(pane.id, opener)}
					/>
				</Panel.Header>

				{/* Content scale is published to the body and nowhere else, so a zoomed
			    pane keeps its header, controls, and focus targets at full size. */}
				<Panel.Body
					style={{ "--pane-zoom": pane.zoom } as React.CSSProperties}
					className={cn(
						view.kind === "source" && "overflow-hidden",
						view.capabilities.editable
							? "bg-surface-panel"
							: "bg-surface-readonly",
					)}
				>
					<PaneContent paneId={pane.id} view={view} zoom={pane.zoom} />
				</Panel.Body>

				{splitRight ? (
					<SplitControl
						edge="right"
						onSplit={() =>
							onSplit({ paneId: pane.id, edge: "right", layout: splitRight })
						}
						view={view.label}
					/>
				) : null}
				{splitBottom ? (
					<SplitControl
						edge="bottom"
						onSplit={() =>
							onSplit({ paneId: pane.id, edge: "bottom", layout: splitBottom })
						}
						view={view.label}
					/>
				) : null}

				{active && showActiveIndicator ? (
					<Panel.Overlay className="tabelo-active-pane-indicator" />
				) : null}
				<div role="status" className="sr-only">
					{announcement}
				</div>
			</Panel>
		</PaneEntryContext.Provider>
	);
});

// The control that grows the workspace, sitting on the edge the new pane will
// appear along. Because a pane is only ever cut across an axis it spans whole,
// that edge is always an outer edge of the workspace: no control ever lands on
// the divider between two panes, so which pane is splitting is never in doubt.
//
// Absolutely positioned so that appearing and disappearing moves nothing
// (§5, §7), and revealed only when the pointer reaches its narrow edge band.
// Keyboard focus reveals the same button, since nothing may depend on hover
// alone (§9). It stays outside the pane body, so reaching it is not entering
// the pane: it belongs to the workspace ring beside the pane frame (§9).
function SplitControl({
	edge,
	onSplit,
	view,
}: {
	readonly edge: SplitEdge;
	readonly onSplit: () => void;
	readonly view: string;
}) {
	return (
		<div
			data-split-control={edge}
			className={cn(
				"group/split-edge",
				edge === "bottom"
					? "absolute bottom-0 left-0 z-20 h-2 w-full"
					: "absolute top-0 right-0 z-20 h-full w-2",
			)}
		>
			<button
				type="button"
				aria-label={copy.a11y.addViewAt(edge, copy.a11y.pane(view))}
				onClick={onSplit}
				className={cn(
					"absolute inline-flex size-8 items-center justify-center rounded-interactive",
					"cursor-pointer bg-surface-floating text-muted-foreground ring-1 ring-line-subtle",
					"opacity-0 hover:text-foreground",
					disclosureTransitionStyles,
					// Plain focus, not focus-visible: a control that has the focus while
					// staying invisible is the failure this reveal rule exists to
					// prevent, and focus-visible would not match a programmatic focus.
					"focus:opacity-100 group-hover/split-edge:opacity-100",
					"focus-visible:outline-2 focus-visible:outline-selection-edge",
					edge === "bottom"
						? "bottom-1 left-1/2 -translate-x-1/2"
						: "top-1/2 right-1 -translate-y-1/2",
				)}
			>
				<Plus aria-hidden className="size-5" />
			</button>
		</div>
	);
}
