import type {
	GridAutoscrollAxis,
	GridAutoscrollPoint,
} from "./use-grid-autoscroll";

// What a pointer drag in the grid is currently doing. It lives here rather than
// beside either consumer because the autoscroll controller and the reorder
// controller both switch on it, and importing it from the grid component would
// close a cycle.
//
// The two families behave differently on purpose. A selection drag paints as it
// goes and every move is observable; a reorder drag paints only a line and
// changes the document once, on drop.
export type GridDragKind =
	| "cell"
	| "column"
	| "row"
	| "fill-row"
	| "fill-column"
	| "row-reorder"
	| "column-reorder";

export type ReorderAxis = "row" | "column";

export function reorderDragOf(axis: ReorderAxis): GridDragKind {
	return axis === "row" ? "row-reorder" : "column-reorder";
}

// Which axes a drag may scroll. A row gesture never scrolls sideways and a
// column gesture never scrolls down, so overshooting on the axis the gesture
// does not own leaves the grid where it is.
export function autoscrollAxisOf(drag: GridDragKind): GridAutoscrollAxis {
	if (drag === "column" || drag === "column-reorder" || drag === "fill-column")
		return "horizontal";
	if (drag === "row" || drag === "row-reorder" || drag === "fill-row")
		return "vertical";
	return "both";
}

// The innermost grid element matching `selector` under a viewport point.
// `elementsFromPoint` rather than `elementFromPoint`, because the sticky chrome
// layers and the drop indicator can all sit over the element being looked for.
export function gridTargetAt(
	grid: HTMLTableElement,
	point: GridAutoscrollPoint,
	selector: string,
): HTMLElement | null {
	for (const sampled of grid.ownerDocument.elementsFromPoint(
		point.x,
		point.y,
	)) {
		const target = sampled.closest<HTMLElement>(selector);
		if (target && grid.contains(target)) return target;
	}
	return null;
}

export function axisHandleSelector(axis: ReorderAxis): string {
	return axis === "row" ? "[data-row-header]" : "[data-column-header]";
}

export function axisHandleIndex(
	axis: ReorderAxis,
	element: HTMLElement,
): number | null {
	const raw =
		axis === "row" ? element.dataset.rowHeader : element.dataset.columnHeader;
	const index = Number(raw);
	return Number.isInteger(index) ? index : null;
}
