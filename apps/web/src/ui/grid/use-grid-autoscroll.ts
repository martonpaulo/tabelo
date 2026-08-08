import { type RefObject, useEffect, useRef } from "react";

export type GridAutoscrollAxis = "horizontal" | "vertical" | "both";

export interface GridAutoscrollPoint {
	readonly x: number;
	readonly y: number;
}

interface GridAutoscrollOptions<DragKind> {
	readonly gridRef: RefObject<HTMLTableElement | null>;
	readonly draggingRef: RefObject<DragKind | null>;
	readonly axisOf: (drag: DragKind) => GridAutoscrollAxis;
	readonly onScroll: (
		drag: DragKind,
		point: GridAutoscrollPoint,
		grid: HTMLTableElement,
	) => void;
}

const MAX_SCROLL_PER_FRAME_REM = 2;
const TARGET_SAMPLE_INSET_REM = 0.5;
const REDUCED_MOTION_STEP_INTERVAL_MS = 120;

function outsideDistance(value: number, start: number, end: number): number {
	if (value < start) return value - start;
	if (value > end) return value - end;
	return 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(Math.max(value, minimum), maximum);
}

function axisAllows(axis: GridAutoscrollAxis, direction: "x" | "y"): boolean {
	return (
		axis === "both" || axis === (direction === "x" ? "horizontal" : "vertical")
	);
}

function reducedMotionStep(
	grid: HTMLTableElement,
	point: GridAutoscrollPoint,
	scrollport: DOMRect,
	direction: "x" | "y",
	fallback: number,
): number {
	const x = clamp(point.x, scrollport.left + 1, scrollport.right - 1);
	const y = clamp(point.y, scrollport.top + 1, scrollport.bottom - 1);
	const target = grid.ownerDocument
		.elementsFromPoint(x, y)
		.map((sampled) =>
			sampled.closest<HTMLElement>(
				"[data-cell], [data-column-header], [data-row-header]",
			),
		)
		.find((candidate) => candidate && grid.contains(candidate));
	if (!target) return fallback;
	const box = target.getBoundingClientRect();
	return direction === "x" ? box.width : box.height;
}

// Every Pointer Events drag in the grid shares this controller. Cell, row, and
// column selection use it now; reorder (#139) and fill (#203) extend the drag
// kind and callback instead of creating another frame loop.
export function useGridAutoscroll<DragKind>({
	gridRef,
	draggingRef,
	axisOf,
	onScroll,
}: GridAutoscrollOptions<DragKind>): void {
	const frameRef = useRef<number | null>(null);
	const pointerRef = useRef<GridAutoscrollPoint | null>(null);

	useEffect(() => {
		const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
		let lastReducedMotionStep = Number.NEGATIVE_INFINITY;

		const stopFrame = () => {
			if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
			frameRef.current = null;
			lastReducedMotionStep = Number.NEGATIVE_INFINITY;
		};

		const finishDrag = () => {
			draggingRef.current = null;
			pointerRef.current = null;
			stopFrame();
		};

		const runFrame = (timestamp: number) => {
			frameRef.current = null;
			const drag = draggingRef.current;
			const pointer = pointerRef.current;
			const grid = gridRef.current;
			const scroller = grid?.closest<HTMLElement>('[data-slot="panel-body"]');
			if (drag === null || !pointer || !grid || !scroller) return;

			const box = scroller.getBoundingClientRect();
			const axis = axisOf(drag);
			const outsideX = axisAllows(axis, "x")
				? outsideDistance(pointer.x, box.left, box.right)
				: 0;
			const outsideY = axisAllows(axis, "y")
				? outsideDistance(pointer.y, box.top, box.bottom)
				: 0;
			if (outsideX === 0 && outsideY === 0) return;

			const rootFontSize = Number.parseFloat(
				getComputedStyle(grid.ownerDocument.documentElement).fontSize,
			);
			const maximum = rootFontSize * MAX_SCROLL_PER_FRAME_REM;
			const sampleInset = rootFontSize * TARGET_SAMPLE_INSET_REM;
			let deltaX = Math.sign(outsideX) * Math.min(Math.abs(outsideX), maximum);
			let deltaY = Math.sign(outsideY) * Math.min(Math.abs(outsideY), maximum);

			if (reducedMotion.matches) {
				if (
					timestamp - lastReducedMotionStep <
					REDUCED_MOTION_STEP_INTERVAL_MS
				) {
					frameRef.current = requestAnimationFrame(runFrame);
					return;
				}
				lastReducedMotionStep = timestamp;
				if (outsideX !== 0) {
					deltaX =
						Math.sign(outsideX) *
						reducedMotionStep(grid, pointer, box, "x", maximum);
				}
				if (outsideY !== 0) {
					deltaY =
						Math.sign(outsideY) *
						reducedMotionStep(grid, pointer, box, "y", maximum);
				}
			}

			const beforeLeft = scroller.scrollLeft;
			const beforeTop = scroller.scrollTop;
			scroller.scrollBy({ left: deltaX, top: deltaY, behavior: "auto" });
			onScroll(
				drag,
				{
					x: clamp(pointer.x, box.left + sampleInset, box.right - sampleInset),
					y: clamp(pointer.y, box.top + sampleInset, box.bottom - sampleInset),
				},
				grid,
			);

			const moved =
				scroller.scrollLeft !== beforeLeft || scroller.scrollTop !== beforeTop;
			if (moved) frameRef.current = requestAnimationFrame(runFrame);
		};

		const scheduleFrame = () => {
			if (frameRef.current === null) {
				frameRef.current = requestAnimationFrame(runFrame);
			}
		};

		const trackPointer = (event: PointerEvent) => {
			const drag = draggingRef.current;
			const grid = gridRef.current;
			const scroller = grid?.closest<HTMLElement>('[data-slot="panel-body"]');
			if (drag === null || !scroller) {
				stopFrame();
				return;
			}

			pointerRef.current = { x: event.clientX, y: event.clientY };
			const box = scroller.getBoundingClientRect();
			const axis = axisOf(drag);
			const outsideX =
				axisAllows(axis, "x") &&
				(event.clientX < box.left || event.clientX > box.right);
			const outsideY =
				axisAllows(axis, "y") &&
				(event.clientY < box.top || event.clientY > box.bottom);
			if (outsideX || outsideY) scheduleFrame();
			else stopFrame();
		};

		window.addEventListener("pointermove", trackPointer);
		window.addEventListener("pointerup", finishDrag);
		window.addEventListener("pointercancel", finishDrag);
		window.addEventListener("blur", finishDrag);
		return () => {
			window.removeEventListener("pointermove", trackPointer);
			window.removeEventListener("pointerup", finishDrag);
			window.removeEventListener("pointercancel", finishDrag);
			window.removeEventListener("blur", finishDrag);
			stopFrame();
		};
	}, [axisOf, draggingRef, gridRef, onScroll]);
}
