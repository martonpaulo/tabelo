import { type RefObject, useCallback, useEffect, useMemo, useRef } from "react";
import type { CellRect } from "@/core/selection";
import { selectionFillRefusal, selectionRect } from "@/core/selection";
import { useTabeloStore } from "@/state/store";
import type { FillPreviewGeometry, FillPreviewSetter } from "./fill-preview";
import { type GridDragKind, gridTargetAt } from "./grid-drag";
import { commitFillTarget } from "./table-actions";
import type { GridAutoscrollPoint } from "./use-grid-autoscroll";

const THRESHOLD_REM = 0.25;

type FillAxis = "row" | "column";

interface FillDrag {
	readonly pointerId: number;
	readonly capture: HTMLElement;
	readonly source: CellRect;
	readonly origin: GridAutoscrollPoint;
	axis: FillAxis | null;
	target: CellRect | null;
}

interface FillDragOptions {
	readonly gridRef: RefObject<HTMLTableElement | null>;
	readonly wrapperRef: RefObject<HTMLElement | null>;
	readonly draggingRef: RefObject<GridDragKind | null>;
	readonly setPreviewRef: RefObject<FillPreviewSetter | null>;
}

export interface FillDragController {
	readonly onHandlePointerDown: (
		event: React.PointerEvent<HTMLButtonElement>,
	) => void;
	readonly trackFill: (
		point: GridAutoscrollPoint,
		grid: HTMLTableElement,
	) => void;
}

function targetForPoint(
	grid: HTMLTableElement,
	point: GridAutoscrollPoint,
	source: CellRect,
	axis: FillAxis,
): CellRect | null {
	const sourceCell = grid.querySelector<HTMLElement>(
		`[data-cell="${source.top}:${source.left}"]`,
	);
	if (!sourceCell) return null;
	const sourceBox = sourceCell.getBoundingClientRect();
	const sampled = gridTargetAt(
		grid,
		axis === "row"
			? { x: (sourceBox.left + sourceBox.right) / 2, y: point.y }
			: { x: point.x, y: (sourceBox.top + sourceBox.bottom) / 2 },
		"[data-cell]",
	);
	if (!sampled) return null;
	const [row, column] = sampled.dataset.cell?.split(":").map(Number) ?? [];
	if (
		row === undefined ||
		column === undefined ||
		!Number.isInteger(row) ||
		!Number.isInteger(column) ||
		row < 0
	) {
		return null;
	}
	return axis === "row"
		? {
				...source,
				top: Math.min(source.top, row),
				bottom: Math.max(source.bottom, row),
			}
		: {
				...source,
				left: Math.min(source.left, column),
				right: Math.max(source.right, column),
			};
}

function addedRect(source: CellRect, target: CellRect): CellRect | null {
	if (target.top < source.top) return { ...target, bottom: source.top - 1 };
	if (target.bottom > source.bottom)
		return { ...target, top: source.bottom + 1 };
	if (target.left < source.left) return { ...target, right: source.left - 1 };
	if (target.right > source.right) return { ...target, left: source.right + 1 };
	return null;
}

function previewFor(
	grid: HTMLTableElement,
	wrapper: HTMLElement,
	source: CellRect,
	target: CellRect,
): FillPreviewGeometry | null {
	const added = addedRect(source, target);
	if (!added) return null;
	const first = grid.querySelector<HTMLElement>(
		`[data-cell="${added.top}:${added.left}"]`,
	);
	const last = grid.querySelector<HTMLElement>(
		`[data-cell="${added.bottom}:${added.right}"]`,
	);
	if (!first || !last) return null;
	const firstBox = first.getBoundingClientRect();
	const lastBox = last.getBoundingClientRect();
	const wrapperBox = wrapper.getBoundingClientRect();
	const rootFontSize = Number.parseFloat(
		getComputedStyle(grid.ownerDocument.documentElement).fontSize,
	);
	return {
		top: (firstBox.top - wrapperBox.top) / rootFontSize,
		left: (firstBox.left - wrapperBox.left) / rootFontSize,
		width: (lastBox.right - firstBox.left) / rootFontSize,
		height: (lastBox.bottom - firstBox.top) / rootFontSize,
		target: `${target.top}:${target.left}:${target.bottom}:${target.right}`,
	};
}

export function useFillDrag({
	gridRef,
	wrapperRef,
	draggingRef,
	setPreviewRef,
}: FillDragOptions): FillDragController {
	const dragRef = useRef<FillDrag | null>(null);

	const teardown = useCallback(() => {
		const drag = dragRef.current;
		dragRef.current = null;
		if (!drag) return;
		if (drag.capture.hasPointerCapture(drag.pointerId)) {
			drag.capture.releasePointerCapture(drag.pointerId);
		}
		if (
			draggingRef.current === "fill-row" ||
			draggingRef.current === "fill-column"
		) {
			draggingRef.current = null;
		}
		setPreviewRef.current?.(null);
	}, [draggingRef, setPreviewRef]);

	const trackFill = useCallback(
		(point: GridAutoscrollPoint, grid: HTMLTableElement) => {
			const drag = dragRef.current;
			const wrapper = wrapperRef.current;
			if (!drag?.axis || !wrapper) return;
			const target = targetForPoint(grid, point, drag.source, drag.axis);
			if (!target) return;
			drag.target = target;
			setPreviewRef.current?.(previewFor(grid, wrapper, drag.source, target));
		},
		[setPreviewRef, wrapperRef],
	);

	const onHandlePointerDown = useCallback(
		(event: React.PointerEvent<HTMLButtonElement>) => {
			if (event.button !== 0 || dragRef.current) return;
			const store = useTabeloStore.getState();
			if (
				selectionFillRefusal(
					store.selection,
					store.document.rows.length,
					store.document.columns.length,
				)
			) {
				return;
			}
			event.stopPropagation();
			const capture = event.currentTarget;
			capture.setPointerCapture(event.pointerId);
			dragRef.current = {
				pointerId: event.pointerId,
				capture,
				source: selectionRect(
					store.selection,
					store.document.rows.length,
					store.document.columns.length,
				),
				origin: { x: event.clientX, y: event.clientY },
				axis: null,
				target: null,
			};
		},
		[],
	);

	useEffect(() => {
		const view = gridRef.current?.ownerDocument.defaultView ?? window;
		const onPointerMove = (event: PointerEvent) => {
			const drag = dragRef.current;
			const grid = gridRef.current;
			if (!drag || !grid || event.pointerId !== drag.pointerId) return;

			if (!drag.axis) {
				const rootFontSize = Number.parseFloat(
					getComputedStyle(grid.ownerDocument.documentElement).fontSize,
				);
				const deltaX = event.clientX - drag.origin.x;
				const deltaY = event.clientY - drag.origin.y;
				if (
					Math.max(Math.abs(deltaX), Math.abs(deltaY)) <
					rootFontSize * THRESHOLD_REM
				)
					return;
				drag.axis = Math.abs(deltaY) >= Math.abs(deltaX) ? "row" : "column";
				draggingRef.current = drag.axis === "row" ? "fill-row" : "fill-column";
			}
			trackFill({ x: event.clientX, y: event.clientY }, grid);
		};

		const onPointerUp = (event: PointerEvent) => {
			const drag = dragRef.current;
			if (!drag || event.pointerId !== drag.pointerId) return;
			const target = drag.target;
			teardown();
			if (target && addedRect(drag.source, target)) commitFillTarget(target);
		};

		const onCancel = (event: PointerEvent) => {
			if (event.pointerId === dragRef.current?.pointerId) teardown();
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || !dragRef.current) return;
			event.preventDefault();
			event.stopPropagation();
			teardown();
		};

		view.addEventListener("pointermove", onPointerMove);
		view.addEventListener("pointerup", onPointerUp);
		view.addEventListener("pointercancel", onCancel);
		view.addEventListener("lostpointercapture", onCancel);
		view.addEventListener("blur", teardown);
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
	}, [draggingRef, gridRef, teardown, trackFill]);

	return useMemo(
		() => ({ onHandlePointerDown, trackFill }),
		[onHandlePointerDown, trackFill],
	);
}
