import { cn } from "@tabelo/ui/lib/utils";
import { memo } from "react";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import { GridPaneActions } from "@/ui/grid/grid-pane-actions";
import { Panel } from "@/ui/primitives/panel";
import { getView } from "@/views/registry";
import { gridAreaStyle, type WorkspacePane } from "@/workspace/layout";
import { PaneContent } from "./pane-content";
import { PaneIdentity, PaneMenu } from "./pane-menu";

// One pane frame for every view. The header carries only what belongs to this
// pane: which view it shows, and the state of that view. Document-level
// actions live in the floating app menu — see docs/design-system.md §5.

interface PaneProps {
	readonly pane: WorkspacePane;
	readonly active: boolean;
	// A pane occupying a single slot has half the width, so its header labels
	// shorten rather than wrap.
	readonly compact: boolean;
	// Stacked, the pane takes the full width in reading order and must not name
	// a slot: an inline grid area pointing at column two would conjure that
	// column back into existence.
	readonly stacked: boolean;
}

export const Pane = memo(function Pane({
	pane,
	active,
	compact,
	stacked,
}: PaneProps) {
	const view = getView(pane.view);

	return (
		<Panel
			aria-label={copy.a11y.pane(view.label)}
			style={stacked ? undefined : { gridArea: gridAreaStyle(pane.slots) }}
			className={cn(
				"min-w-0",
				// Tall enough to be worth scrolling to, and still allowed to grow
				// when it is the only pane on screen.
				stacked && "min-h-pane-stack flex-1",
				active && "ring-2 ring-selection-edge ring-inset",
			)}
			onPointerDownCapture={() => {
				if (!active) useTabeloStore.getState().setActivePane(pane.id);
			}}
			onFocusCapture={() => {
				if (!active) useTabeloStore.getState().setActivePane(pane.id);
			}}
		>
			<Panel.Header className="overflow-x-auto">
				<PaneIdentity view={view} compact={compact} />
				<Panel.Spacer />
				{view.kind === "grid" ? <GridPaneActions compact={compact} /> : null}
				<PaneMenu paneId={pane.id} view={view} />
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
		</Panel>
	);
});
