import { cn } from "@tabelo/ui/lib/utils";
import { useLayoutEffect, useState } from "react";
import { copy } from "@/copy/copy";
import type { CellPosition, CellRect } from "@/core/selection";
import { useTabeloStore } from "@/state/store";
import { usePaneEntered } from "@/ui/workspace/use-pane-entry";
import { fillRefusalMessage, runFillDirection } from "./table-actions";
import type { FillDragController } from "./use-fill-drag";

// Where the handle stands with the table scrolled to its origin, in rem, and
// which axes it follows the scroll on: those of a pinned corner cell, which
// stays put on that axis while the table scrolls under it (#356). The scroll
// ranges are what the follow animation turns progress back into distance.
interface HandlePosition {
	readonly top: number;
	readonly left: number;
	readonly followX: boolean;
	readonly followY: boolean;
	readonly rangeX: number;
	readonly rangeY: number;
}

function samePosition(a: HandlePosition | null, b: HandlePosition): boolean {
	return (
		a !== null &&
		a.top === b.top &&
		a.left === b.left &&
		a.followX === b.followX &&
		a.followY === b.followY &&
		a.rangeX === b.rangeX &&
		a.rangeY === b.rangeY
	);
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

		// The handle is placed in the table's scrolling coordinates, which is
		// right for an ordinary cell: both scroll together. A pinned cell sticks
		// from the table's origin on its pinned axis, the first data row under
		// the header and the first column beside the gutter, so on that axis it
		// sits exactly as far along as the pane has scrolled. Its handle is
		// placed where the cell stands at the origin and then moved by the
		// scroll itself, on a scroll-driven animation the browser advances in the
		// same frame as the scroll (index.css, `follow-scroll-hold-*`); placing
		// it from a scroll listener left it a frame behind the cell (#356).
		const scroller = grid.closest<HTMLElement>('[data-slot="panel-body"]');
		const style = getComputedStyle(cell);
		const sticky = style.position === "sticky" && scroller !== null;
		const followY = sticky && style.top !== "auto";
		const followX = sticky && style.left !== "auto";

		const measure = () => {
			const box = cell.getBoundingClientRect();
			const wrapperBox = wrapper.getBoundingClientRect();
			const rootFontSize = Number.parseFloat(
				getComputedStyle(grid.ownerDocument.documentElement).fontSize,
			);
			const scrollTop = followY && scroller ? scroller.scrollTop : 0;
			const scrollLeft = followX && scroller ? scroller.scrollLeft : 0;
			const next: HandlePosition = {
				top:
					((source.top !== source.bottom && corner.row === source.top
						? box.top
						: box.bottom) -
						wrapperBox.top -
						scrollTop) /
					rootFontSize,
				left:
					((source.left !== source.right && corner.column === source.left
						? box.left
						: box.right) -
						wrapperBox.left -
						scrollLeft) /
					rootFontSize,
				followX,
				followY,
				// Pixel values straight from the scroller, applied to the handle's
				// animation and never stored as presentation state.
				rangeX: scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
				rangeY: scroller ? scroller.scrollHeight - scroller.clientHeight : 0,
			};
			setPosition((previous) =>
				samePosition(previous, next) ? previous : next,
			);
		};
		measure();

		// A column or row resize moves the corner without changing the selection,
		// so the handle is placed again whenever the table or the corner cell
		// changes size. The table covers every column to the corner's left, and
		// the cell covers its own row and column; the scroller's own size sets
		// the scroll range a pinned corner's handle follows.
		const resize = new ResizeObserver(measure);
		resize.observe(grid);
		resize.observe(cell);
		if (!sticky || !scroller) return () => resize.disconnect();
		resize.observe(scroller);

		// A pinned cell stops sticking where its table ends, which the animation
		// cannot know. Measuring again after a scroll settles that case and
		// changes nothing anywhere else, since the origin it finds is the same.
		let frame = 0;
		const onScroll = () => {
			if (frame !== 0) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				measure();
			});
		};
		scroller.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			scroller.removeEventListener("scroll", onScroll);
			cancelAnimationFrame(frame);
			resize.disconnect();
		};
	}, [corner.column, corner.row, gridRef, source, wrapperRef]);

	if (!position) return null;

	// Two elements, because each axis follows the scroll on its own animation
	// and two animations of one property would override each other: the
	// placement follows the vertical scroll, the button inside it the
	// horizontal one.
	return (
		<div
			className={cn(
				"absolute z-40",
				position.followY && "follow-scroll-hold-y",
			)}
			style={
				{
					top: `${position.top}rem`,
					left: `${position.left}rem`,
					"--tabelo-scroll-range-x": `${position.rangeX}px`,
					"--tabelo-scroll-range-y": `${position.rangeY}px`,
				} as React.CSSProperties
			}
		>
			<button
				type="button"
				tabIndex={entered ? 0 : -1}
				aria-label={copy.a11y.fillHandle}
				aria-describedby="grid-fill-handle-hint"
				data-fill-handle
				className={cn(
					"absolute top-0 left-0 inline-flex h-control-sm w-control-sm -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-interactive",
					"cursor-crosshair touch-none",
					position.followX && "follow-scroll-hold-x",
				)}
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
					className="size-2 rounded-xs border border-background bg-selection-edge shadow-sm"
				/>
				<span id="grid-fill-handle-hint" className="sr-only">
					{copy.a11y.fillHandleHint}
				</span>
			</button>
		</div>
	);
}
