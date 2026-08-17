import { type RefObject, useCallback, useEffect, useMemo, useRef } from "react";
import { blockMoveOffset, type ContiguousBlock } from "@/core/operations";
import {
	HEADER_ROW,
	isContiguous,
	rectCoversHeader,
	selectionRect,
} from "@/core/selection";
import { useTabeloStore } from "@/state/store";
import {
	axisHandleIndex,
	axisHandleSelector,
	type GridDragKind,
	gridTargetAt,
	type ReorderAxis,
	reorderDragOf,
} from "./grid-drag";
import { moveRefusalMessage } from "./table-actions";
import type { GridAutoscrollPoint } from "./use-grid-autoscroll";

// Where the block would land, drawn as one line. Offsets are in rem against the
// positioned wrapper the table sits in, and are read from live boxes on every
// move: pane zoom, column resizing, and wrapped row heights are already applied
// to those boxes, so none of them needs bookkeeping of its own here.
export interface DropIndicatorGeometry {
	readonly axis: ReorderAxis;
	// Along the axis being reordered: the boundary itself.
	readonly start: number;
	// Across it: where the line begins, and how far it runs.
	readonly cross: number;
	readonly length: number;
}

export type DropIndicatorSetter = (
	geometry: DropIndicatorGeometry | null,
) => void;

// How far the pointer travels along the axis before a press on a grip becomes a
// reorder. Below it the press is only a press: the selection it made stands and
// the document is untouched, which is what keeps a mis-aimed click harmless.
const THRESHOLD_REM = 0.25;

interface ReorderDrag {
	readonly pointerId: number;
	readonly axis: ReorderAxis;
	readonly block: ContiguousBlock;
	// Where the pointer went down, along the reordered axis only. Jitter across
	// the axis never promotes a candidate, so a shaky press on a grip does not
	// turn into a move.
	readonly origin: number;
	readonly capture: HTMLElement;
	// A candidate until the threshold is crossed. Nothing is drawn, no autoscroll
	// runs, and no drop is possible while this is false.
	dragging: boolean;
	// The insertion boundary the last move resolved, or null while the pointer
	// has never been over the axis. Read once, on drop.
	boundary: number | null;
}

interface AxisReorderOptions {
	readonly gridRef: RefObject<HTMLTableElement | null>;
	readonly wrapperRef: RefObject<HTMLElement | null>;
	readonly draggingRef: RefObject<GridDragKind | null>;
	readonly setIndicatorRef: RefObject<DropIndicatorSetter | null>;
}

export interface AxisReorderController {
	// Attached to a grip. Mouse and pen only: a touch press falls through so the
	// pane keeps scrolling natively, and the keyboard and menu paths remain the
	// way to reorder there.
	readonly onGripPointerDown: (
		axis: ReorderAxis,
		index: number,
		event: React.PointerEvent<HTMLElement>,
	) => void;
	// Called by the autoscroll controller while a reorder drag is scrolling, so
	// the boundary keeps up with content the pointer is not moving over.
	readonly trackReorder: (
		point: GridAutoscrollPoint,
		grid: HTMLTableElement,
	) => void;
}

// The block a grip press acts on. A grip inside the current contiguous
// selection moves the whole of it; a grip outside moves its own row or column,
// and the selection follows the gesture first so what will move is visible
// before it does.
//
// The rectangle is read the same way `moveSelectedRow` reads it, so the two
// paths can never disagree about which rows a drag and an `Alt`+arrow would
// take.
function blockFor(axis: ReorderAxis, index: number): ContiguousBlock {
	const store = useTabeloStore.getState();
	const rows = store.document.rows.length;
	const columns = store.document.columns.length;
	const rect = selectionRect(store.selection, rows, columns);
	const covers =
		isContiguous(store.selection) &&
		(axis === "row"
			? !rectCoversHeader(rect) && index >= rect.top && index <= rect.bottom
			: index >= rect.left && index <= rect.right);

	if (!covers) {
		store.selectCell(
			axis === "row"
				? { row: index, column: 0 }
				: { row: HEADER_ROW, column: index },
			axis,
		);
		return { from: index, count: 1 };
	}

	return axis === "row"
		? { from: rect.top, count: rect.bottom - rect.top + 1 }
		: { from: rect.left, count: rect.right - rect.left + 1 };
}

// The gap the pointer is nearest, counted in items that stay before the block.
// The near half of a row or column names the gap above or left of it and the
// far half the one after, which is what makes every gap reachable including the
// one past the last item.
function resolveBoundary(
	grid: HTMLTableElement,
	point: GridAutoscrollPoint,
	axis: ReorderAxis,
): number | null {
	const selector = axisHandleSelector(axis);
	// The strip and the gutter each run along one axis only, so the sample is
	// pinned to the middle of that band and only the reordered coordinate comes
	// from the pointer. That is what lets the pointer wander over the cells, or
	// off the grid entirely on the other axis, without losing the target.
	const band = grid.querySelector<HTMLElement>(selector);
	if (!band) return null;
	const bandBox = band.getBoundingClientRect();
	const target = gridTargetAt(
		grid,
		axis === "row"
			? { x: (bandBox.left + bandBox.right) / 2, y: point.y }
			: { x: point.x, y: (bandBox.top + bandBox.bottom) / 2 },
		selector,
	);
	if (!target) return null;

	const index = axisHandleIndex(axis, target);
	if (index === null) return null;
	// Every table keeps exactly one header row and it is always the first, so
	// there is no gap above it for a row to land in.
	if (axis === "row" && index === HEADER_ROW) return 0;

	const box = target.getBoundingClientRect();
	const middle =
		axis === "row" ? (box.top + box.bottom) / 2 : (box.left + box.right) / 2;
	const position = axis === "row" ? point.y : point.x;
	return position < middle ? index : index + 1;
}

function indicatorFor(
	grid: HTMLTableElement,
	wrapper: HTMLElement,
	axis: ReorderAxis,
	boundary: number,
): DropIndicatorGeometry | null {
	const store = useTabeloStore.getState();
	const count =
		axis === "row" ? store.document.rows.length : store.document.columns.length;
	// The gap after the last item has no handle of its own, so it is drawn on
	// that item's trailing edge instead.
	const trailing = boundary >= count;
	const attribute = axis === "row" ? "data-row-header" : "data-column-header";
	const target = grid.querySelector<HTMLElement>(
		`[${attribute}="${Math.min(boundary, count - 1)}"]`,
	);
	if (!target) return null;

	const box = target.getBoundingClientRect();
	const tableBox = grid.getBoundingClientRect();
	const wrapperBox = wrapper.getBoundingClientRect();
	const rootFontSize = Number.parseFloat(
		getComputedStyle(grid.ownerDocument.documentElement).fontSize,
	);
	// A measured box is a pixel-valued browser API, so it is converted at this
	// boundary and never stored or authored in pixels.
	const toRem = (pixels: number) => pixels / rootFontSize;

	return axis === "row"
		? {
				axis,
				start: toRem((trailing ? box.bottom : box.top) - wrapperBox.top),
				cross: toRem(tableBox.left - wrapperBox.left),
				length: toRem(tableBox.width),
			}
		: {
				axis,
				start: toRem((trailing ? box.right : box.left) - wrapperBox.left),
				cross: toRem(tableBox.top - wrapperBox.top),
				length: toRem(tableBox.height),
			};
}

// The pointer half of grid reordering. `Alt`+arrows and the axis menu keep
// their own path and remain the accessible one; this ends in the same store
// action, so a drag can never produce a document shape the keyboard could not.
export function useAxisReorder({
	gridRef,
	wrapperRef,
	draggingRef,
	setIndicatorRef,
}: AxisReorderOptions): AxisReorderController {
	const dragRef = useRef<ReorderDrag | null>(null);

	// Every ending runs through here: drop, cancel, pointer loss, unmount. The
	// document is never touched on the way out, so whatever ends a drag other
	// than a valid drop leaves the table exactly as the drag found it.
	const teardown = useCallback(() => {
		const drag = dragRef.current;
		dragRef.current = null;
		if (!drag) return;
		if (drag.capture.hasPointerCapture(drag.pointerId)) {
			drag.capture.releasePointerCapture(drag.pointerId);
		}
		if (draggingRef.current === reorderDragOf(drag.axis)) {
			draggingRef.current = null;
		}
		setIndicatorRef.current?.(null);
	}, [draggingRef, setIndicatorRef]);

	const paint = useCallback(
		(drag: ReorderDrag) => {
			const grid = gridRef.current;
			const wrapper = wrapperRef.current;
			if (!grid || !wrapper || drag.boundary === null) return;
			setIndicatorRef.current?.(
				indicatorFor(grid, wrapper, drag.axis, drag.boundary),
			);
		},
		[gridRef, setIndicatorRef, wrapperRef],
	);

	const trackReorder = useCallback(
		(point: GridAutoscrollPoint, grid: HTMLTableElement) => {
			const drag = dragRef.current;
			if (!drag?.dragging) return;
			const boundary = resolveBoundary(grid, point, drag.axis);
			// A pointer that has left the band keeps the boundary it last found, so
			// the line stays where the user last aimed it rather than disappearing.
			if (boundary !== null) drag.boundary = boundary;
			paint(drag);
		},
		[paint],
	);

	const onGripPointerDown = useCallback(
		(
			axis: ReorderAxis,
			index: number,
			event: React.PointerEvent<HTMLElement>,
		) => {
			// Touch is deliberately not a reorder gesture: a press-and-drag there
			// competes with scrolling the pane, and the keyboard and menu paths
			// already expose the operation.
			if (event.pointerType === "touch") return;
			if (event.button !== 0) return;
			if (dragRef.current) return;

			// A <span> is not focusable, so without this the browser moves focus to
			// <body> after the handler runs and the grid stops answering keys.
			event.preventDefault();

			const capture = event.currentTarget;
			capture.setPointerCapture(event.pointerId);
			dragRef.current = {
				pointerId: event.pointerId,
				axis,
				block: blockFor(axis, index),
				origin: axis === "row" ? event.clientY : event.clientX,
				capture,
				dragging: false,
				boundary: null,
			};
		},
		[],
	);

	// Capture is held by the grip, so its own element sees the rest of the
	// gesture wherever the pointer goes, including outside the grid and outside
	// the window. Listening here rather than on the element keeps every ending in
	// one place and survives the row being re-rendered underneath the drag.
	useEffect(() => {
		const view = gridRef.current?.ownerDocument.defaultView ?? window;

		const onPointerMove = (event: PointerEvent) => {
			const drag = dragRef.current;
			const grid = gridRef.current;
			if (!drag || !grid || event.pointerId !== drag.pointerId) return;

			if (!drag.dragging) {
				const rootFontSize = Number.parseFloat(
					getComputedStyle(grid.ownerDocument.documentElement).fontSize,
				);
				const travelled = Math.abs(
					(drag.axis === "row" ? event.clientY : event.clientX) - drag.origin,
				);
				if (travelled < rootFontSize * THRESHOLD_REM) return;
				drag.dragging = true;
				// Only now does the autoscroll controller see a drag, so a press that
				// never crossed the threshold cannot scroll the pane either.
				draggingRef.current = reorderDragOf(drag.axis);
			}

			trackReorder({ x: event.clientX, y: event.clientY }, grid);
		};

		const onPointerUp = (event: PointerEvent) => {
			const drag = dragRef.current;
			if (!drag || event.pointerId !== drag.pointerId) return;
			const dropped = drag.dragging ? drag.boundary : null;
			const { axis, block } = drag;
			teardown();
			if (dropped === null) return;

			const offset = blockMoveOffset(dropped, block);
			// A drop back where the block already is is not a change, so it is not a
			// history step either.
			if (offset === 0) return;

			const store = useTabeloStore.getState();
			const refusal =
				axis === "row"
					? store.moveSelectedRow(offset)
					: store.moveSelectedColumn(offset);
			if (refusal) {
				store.pushNotice({
					severity: "warning",
					message: moveRefusalMessage[refusal],
				});
			}
		};

		const onCancel = (event: PointerEvent) => {
			if (event.pointerId !== dragRef.current?.pointerId) return;
			teardown();
		};

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || !dragRef.current) return;
			// Escape belongs to the drag while one is running, so it does not also
			// collapse the selection or leave the pane on the way out.
			event.preventDefault();
			event.stopPropagation();
			teardown();
		};

		view.addEventListener("pointermove", onPointerMove);
		view.addEventListener("pointerup", onPointerUp);
		view.addEventListener("pointercancel", onCancel);
		view.addEventListener("lostpointercapture", onCancel);
		view.addEventListener("blur", teardown);
		// Capture, so the grid's own Escape handling never runs first.
		view.addEventListener("keydown", onKeyDown, true);
		return () => {
			view.removeEventListener("pointermove", onPointerMove);
			view.removeEventListener("pointerup", onPointerUp);
			view.removeEventListener("pointercancel", onCancel);
			view.removeEventListener("lostpointercapture", onCancel);
			view.removeEventListener("blur", teardown);
			view.removeEventListener("keydown", onKeyDown, true);
			teardown();
		};
	}, [draggingRef, gridRef, teardown, trackReorder]);

	// Stable, so the autoscroll controller can depend on it without tearing down
	// and re-registering its window listeners on every render of the grid.
	return useMemo(
		() => ({ onGripPointerDown, trackReorder }),
		[onGripPointerDown, trackReorder],
	);
}
