import { cn } from "@tabelo/ui/lib/utils";
import { useLayoutEffect, useState } from "react";
import { copy } from "@/copy/copy";
import type { CellPosition, CellRect } from "@/core/selection";
import { useTabeloStore } from "@/state/store";
import { usePaneEntered } from "@/ui/workspace/use-pane-entry";
import { fillRefusalMessage, runFillDirection } from "./table-actions";
import type { FillDragController } from "./use-fill-drag";

interface HandlePosition {
	readonly top: number;
	readonly left: number;
}

interface FillHandleProps {
	readonly gridRef: React.RefObject<HTMLTableElement | null>;
	readonly wrapperRef: React.RefObject<HTMLElement | null>;
	readonly source: CellRect;
	readonly corner: CellPosition;
	readonly onPointerDown: FillDragController["onHandlePointerDown"];
}

export function FillHandle({
	gridRef,
	wrapperRef,
	source,
	corner,
	onPointerDown,
}: FillHandleProps) {
	const entered = usePaneEntered();
	const [position, setPosition] = useState<HandlePosition | null>(null);

	useLayoutEffect(() => {
		const grid = gridRef.current;
		const wrapper = wrapperRef.current;
		const cell = grid?.querySelector<HTMLElement>(
			`[data-cell="${corner.row}:${corner.column}"]`,
		);
		if (!grid || !wrapper || !cell) {
			setPosition(null);
			return;
		}

		const box = cell.getBoundingClientRect();
		const wrapperBox = wrapper.getBoundingClientRect();
		const rootFontSize = Number.parseFloat(
			getComputedStyle(grid.ownerDocument.documentElement).fontSize,
		);
		setPosition({
			top:
				((source.top !== source.bottom && corner.row === source.top
					? box.top
					: box.bottom) -
					wrapperBox.top) /
				rootFontSize,
			left:
				((source.left !== source.right && corner.column === source.left
					? box.left
					: box.right) -
					wrapperBox.left) /
				rootFontSize,
		});
	}, [corner.column, corner.row, gridRef, source, wrapperRef]);

	if (!position) return null;

	return (
		<button
			type="button"
			tabIndex={entered ? 0 : -1}
			aria-label={copy.a11y.fillHandle}
			aria-describedby="grid-fill-handle-hint"
			data-fill-handle
			className={cn(
				"absolute z-40 inline-flex h-control-sm w-control-sm -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-interactive",
				"cursor-crosshair touch-none outline-none focus-visible:ring-2 focus-visible:ring-selection-edge",
			)}
			style={{ top: `${position.top}rem`, left: `${position.left}rem` }}
			onPointerDown={onPointerDown}
			onKeyDown={(event) => {
				const mod = event.metaKey || event.ctrlKey;
				if (!mod || !event.altKey || event.shiftKey) return;
				const direction =
					event.key === "ArrowUp"
						? "up"
						: event.key === "ArrowDown"
							? "down"
							: event.key === "ArrowLeft"
								? "left"
								: event.key === "ArrowRight"
									? "right"
									: null;
				if (!direction) return;
				event.preventDefault();
				const refusal = runFillDirection(direction);
				if (refusal) {
					useTabeloStore.getState().pushNotice({
						severity: "warning",
						message: fillRefusalMessage[refusal],
					});
				}
			}}
		>
			<span
				aria-hidden
				className="size-2 rounded-[0.125rem] border border-background bg-selection-edge shadow-sm"
			/>
			<span id="grid-fill-handle-hint" className="sr-only">
				{copy.a11y.fillHandleHint}
			</span>
		</button>
	);
}
