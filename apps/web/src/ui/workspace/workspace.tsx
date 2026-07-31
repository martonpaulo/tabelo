import { cn } from "@tabelo/ui/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { copy } from "@/copy/copy";
import { useTabeloStore } from "@/state/store";
import {
	gridAreaOf,
	layoutSplitsColumns,
	layoutSplitsRows,
	type SplitOption,
	splitOptions,
} from "@/workspace/layout";
import { AddViewDialog } from "./add-view-dialog";
import { Pane } from "./pane";
import { useStackedWorkspace } from "./stacking";

// The workspace is one CSS grid. Panes place themselves from their slots, and
// the narrow gap plus a coloured background gives the separators without pane
// needing to know its neighbours.
//
// Below the stacking width that tiling is not narrowed, it is abandoned: the
// grid becomes a column, the panes stop naming slots, and the workspace scrolls
// between them. The preset and its ratios are untouched, so widening the window
// restores exactly what the user chose.

type Axis = "columns" | "rows";

interface ResizerProps {
	readonly axis: Axis;
	readonly ratio: number;
	readonly containerRef: React.RefObject<HTMLDivElement | null>;
}

function Resizer({ axis, ratio, containerRef }: ResizerProps) {
	const dragging = useRef(false);

	const apply = useCallback(
		(clientX: number, clientY: number) => {
			const container = containerRef.current;
			if (!container) return;
			const bounds = container.getBoundingClientRect();
			const next =
				axis === "columns"
					? (clientX - bounds.left) / bounds.width
					: (clientY - bounds.top) / bounds.height;
			const store = useTabeloStore.getState();
			if (axis === "columns") store.setColumnRatio(next);
			else store.setRowRatio(next);
		},
		[axis, containerRef],
	);

	// Keyboard resizing keeps the layout adjustable without a pointer, which
	// matters because this is the one control with no menu equivalent.
	const nudge = (delta: number) => {
		const store = useTabeloStore.getState();
		if (axis === "columns")
			store.setColumnRatio(store.workspace.columnRatio + delta);
		else store.setRowRatio(store.workspace.rowRatio + delta);
	};

	const isColumns = axis === "columns";

	return (
		// A focusable separator with a value is the ARIA Authoring Practices
		// window-splitter pattern. <hr> cannot be dragged, and a splitter that
		// reports its position is exactly what aria-valuenow is for.
		// biome-ignore lint/a11y/useSemanticElements: see above
		<div
			role="separator"
			tabIndex={0}
			aria-orientation={isColumns ? "vertical" : "horizontal"}
			aria-label={
				isColumns ? copy.workspace.resizeColumns : copy.workspace.resizeRows
			}
			aria-valuenow={Math.round(ratio * 100)}
			aria-valuemin={15}
			aria-valuemax={85}
			className={
				isColumns
					? "absolute top-0 z-30 h-full w-2 -translate-x-1/2 cursor-col-resize touch-none hover:bg-selection-edge/30 focus-visible:bg-selection-edge/40"
					: "absolute left-0 z-30 h-2 w-full -translate-y-1/2 cursor-row-resize touch-none hover:bg-selection-edge/30 focus-visible:bg-selection-edge/40"
			}
			style={
				isColumns ? { left: `${ratio * 100}%` } : { top: `${ratio * 100}%` }
			}
			onPointerDown={(event) => {
				event.preventDefault();
				event.currentTarget.setPointerCapture(event.pointerId);
				dragging.current = true;
			}}
			onPointerMove={(event) => {
				if (!dragging.current) return;
				apply(event.clientX, event.clientY);
			}}
			onPointerUp={(event) => {
				event.currentTarget.releasePointerCapture(event.pointerId);
				dragging.current = false;
			}}
			onKeyDown={(event) => {
				const decrease = isColumns ? "ArrowLeft" : "ArrowUp";
				const increase = isColumns ? "ArrowRight" : "ArrowDown";
				if (event.key === decrease) {
					event.preventDefault();
					nudge(-0.02);
				}
				if (event.key === increase) {
					event.preventDefault();
					nudge(0.02);
				}
			}}
		/>
	);
}

export function Workspace() {
	const workspace = useTabeloStore((state) => state.workspace);
	const containerRef = useRef<HTMLDivElement>(null);
	const stacked = useStackedWorkspace();

	// The split a picker is currently open for, and the pane the last one
	// created. Both are local: neither outlives the interaction, so neither
	// belongs in the store, in history, or in what is persisted.
	const [pendingSplit, setPendingSplit] = useState<SplitOption | null>(null);
	const [addedPaneId, setAddedPaneId] = useState<string | null>(null);

	// The workspace changed shape under the user, so focus is placed rather than
	// left on a control that has since moved or gone. The pane frame is a
	// labelled region, so landing on it says which pane arrived.
	useEffect(() => {
		if (!addedPaneId) return;
		containerRef.current
			?.querySelector<HTMLElement>(`[data-pane-id="${addedPaneId}"]`)
			?.focus();
	}, [addedPaneId]);

	// A resizer is only meaningful where its axis actually splits, and stacking
	// splits neither: there is one column and the panes size themselves.
	const splitsColumns = !stacked && layoutSplitsColumns(workspace.layout);
	const splitsRows = !stacked && layoutSplitsRows(workspace.layout);

	// Where the workspace can still grow. Empty at four panes, which is what
	// removes every control rather than disabling one.
	const options = splitOptions(workspace);

	return (
		<main
			ref={containerRef}
			aria-label={copy.a11y.workspace}
			className={cn(
				"tabelo-scroll-boundary relative min-h-0 min-w-0 flex-1 gap-2 bg-surface-app p-2",
				// Stacked, the workspace itself scrolls between panes; tiled, it
				// never does and each pane scrolls its own content.
				stacked ? "flex flex-col overflow-y-auto" : "grid",
			)}
			style={
				stacked
					? undefined
					: {
							gridTemplateColumns: splitsColumns
								? `${workspace.columnRatio}fr ${1 - workspace.columnRatio}fr`
								: "1fr 1fr",
							gridTemplateRows: splitsRows
								? `${workspace.rowRatio}fr ${1 - workspace.rowRatio}fr`
								: "1fr 1fr",
						}
			}
		>
			{workspace.panes.map((pane) => {
				const area = gridAreaOf(pane.slots);
				// Stacked panes have the whole width, so nothing needs shortening.
				const compact = !stacked && area.columnEnd - area.columnStart === 1;
				const split = options.find((option) => option.paneId === pane.id);
				return (
					<Pane
						key={pane.id}
						pane={pane}
						active={pane.id === workspace.activePaneId}
						compact={compact}
						stacked={stacked}
						splitEdge={split?.edge}
						splitLayout={split?.layout}
						onSplit={setPendingSplit}
						justAdded={pane.id === addedPaneId}
					/>
				);
			})}

			{splitsColumns ? (
				<Resizer
					axis="columns"
					ratio={workspace.columnRatio}
					containerRef={containerRef}
				/>
			) : null}
			{splitsRows ? (
				<Resizer
					axis="rows"
					ratio={workspace.rowRatio}
					containerRef={containerRef}
				/>
			) : null}

			<AddViewDialog
				option={pendingSplit}
				onClose={() => setPendingSplit(null)}
				onAdded={setAddedPaneId}
			/>
		</main>
	);
}
