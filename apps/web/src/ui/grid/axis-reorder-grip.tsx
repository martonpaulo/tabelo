import { controlStateTransitionStyles } from "@tabelo/ui/components/motion-styles";
import { cn } from "@tabelo/ui/lib/utils";
import { GripHorizontal, GripVertical } from "lucide-react";
import type { ReorderAxis } from "./grid-drag";

// The drag target for reordering, one per data row and per column.
//
// Pointer-only and `aria-hidden`, exactly like the column resize handle beside
// it: `Alt`+arrows and the axis menu's four Move actions are the keyboard equal,
// and they remain the accessible path. Giving this a name and a tab stop would
// add two stops to every row of a two-hundred-row table for an operation the
// keyboard already reaches, which is the trap docs/design-system.md §9 warns
// against. A grip is not a button either: it does nothing at all when clicked.
//
// It is a distinct target rather than a second meaning for the number or the
// letter beside it. Those already own selection, including drag-select along
// the axis, and a gesture cannot mean two things on the same pixels.
interface AxisReorderGripProps {
	readonly axis: ReorderAxis;
	readonly index: number;
	// Whether the user is working in this row or column, which is where the
	// affordance shows itself at rest. Same rule as the axis menu trigger, per
	// docs/design-system.md §6.
	readonly revealed: boolean;
	readonly onPointerDown: (
		axis: ReorderAxis,
		index: number,
		event: React.PointerEvent<HTMLElement>,
	) => void;
}

export function AxisReorderGrip({
	axis,
	index,
	revealed,
	onPointerDown,
}: AxisReorderGripProps) {
	// A row is reordered up and down, so its grip is the tall one; a column is
	// reordered left and right, so its grip lies on its side.
	const Icon = axis === "row" ? GripVertical : GripHorizontal;
	const groupClass =
		axis === "column"
			? "group-hover/col:opacity-100 group-focus-within/col:opacity-100"
			: "group-hover/row:opacity-100 group-focus-within/row:opacity-100";

	return (
		<span
			aria-hidden
			// The technical contract the browser suite drives the gesture through.
			data-reorder-grip={`${axis}:${index}`}
			className={cn(
				// The icon stays small so the grid stays quiet while the ::after box
				// grows the target to the control minimum without taking layout, the
				// same technique the axis menu trigger uses on the other side of the
				// number.
				"relative inline-flex size-5 shrink-0 items-center justify-center rounded",
				"after:absolute after:-inset-1 after:content-['']",
				// `grab` and `grabbing` are what tell a pointer user this is a drag
				// rather than a click, per docs/design-system.md §9's cursor rule.
				// Deliberately not `touch-none`: touch keeps native pane scrolling,
				// and the controller ignores touch pointers.
				"cursor-grab active:cursor-grabbing",
				"text-muted-foreground hover:text-foreground",
				controlStateTransitionStyles,
				revealed ? "opacity-100" : "opacity-0",
				groupClass,
			)}
			onPointerDown={(event) => onPointerDown(axis, index, event)}
		>
			<Icon aria-hidden className="size-3.5" />
		</span>
	);
}
