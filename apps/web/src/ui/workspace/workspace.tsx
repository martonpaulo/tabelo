import { useCallback, useRef } from "react";
import { useTabeloStore } from "@/state/store";
import { copy } from "@/ui/copy";
import {
	gridAreaOf,
	layoutSplitsColumns,
	layoutSplitsRows,
} from "@/workspace/layout";
import { Pane } from "./pane";

// The workspace is one CSS grid. Panes place themselves from their slots, and
// the 1px gap plus a coloured background gives the separators without any pane
// needing to know its neighbours.

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

	const splitsColumns = layoutSplitsColumns(workspace.layout);
	const splitsRows = layoutSplitsRows(workspace.layout);

	// Below this width the 2x2 grid stops being readable, so every pane simply
	// stacks. The layout choice is remembered, not discarded.
	const stacked = "max-[899px]:!grid-cols-1 max-[899px]:!grid-rows-none";

	return (
		<main
			ref={containerRef}
			aria-label={copy.a11y.workspace}
			className={`relative grid min-h-0 flex-1 gap-px bg-line-strong ${stacked}`}
			style={{
				gridTemplateColumns: splitsColumns
					? `${workspace.columnRatio}fr ${1 - workspace.columnRatio}fr`
					: "1fr 1fr",
				gridTemplateRows: splitsRows
					? `${workspace.rowRatio}fr ${1 - workspace.rowRatio}fr`
					: "1fr 1fr",
			}}
		>
			{workspace.panes.map((pane) => {
				const area = gridAreaOf(pane.slots);
				const compact = area.columnEnd - area.columnStart === 1;
				return (
					<Pane
						key={pane.id}
						pane={pane}
						active={pane.id === workspace.activePaneId}
						compact={compact}
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
		</main>
	);
}
