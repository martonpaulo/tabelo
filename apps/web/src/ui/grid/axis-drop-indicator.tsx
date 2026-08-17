import { type RefObject, useEffect, useState } from "react";
import type {
	DropIndicatorGeometry,
	DropIndicatorSetter,
} from "./use-axis-reorder";

// The line showing which gap a dragged block will land in.
//
// It owns its own state and hands the reorder controller the setter to write
// through, rather than the grid holding the geometry and passing it down. A
// drag then repaints this one element per pointer move instead of reconciling
// two hundred rows against the memo boundary sixty times a second. The grid
// already uses this shape for the axis menu, which is one root behind many
// triggers for the same reason.
//
// Transient by construction: it is drag state, never document state, so it
// reaches neither history nor persistence and is gone the moment the drag ends.
export function AxisDropIndicator({
	setterRef,
}: {
	readonly setterRef: RefObject<DropIndicatorSetter | null>;
}) {
	const [geometry, setGeometry] = useState<DropIndicatorGeometry | null>(null);

	useEffect(() => {
		setterRef.current = setGeometry;
		return () => {
			setterRef.current = null;
		};
	}, [setterRef]);

	if (!geometry) return null;

	const horizontal = geometry.axis === "row";
	return (
		<div
			aria-hidden
			// The technical contract the browser suite reads: a drop is pending, and
			// on which axis. There is no ARIA state for "the block lands here", and
			// the gesture is pointer-only with a keyboard equal that needs none.
			data-drop-indicator={geometry.axis}
			// Static, like every other piece of grid geometry: see
			// docs/design-system.md §7. The line is centred on the boundary it names
			// so it reads as a gap rather than as an edge of either neighbour.
			className="pointer-events-none absolute z-40 bg-selection-edge"
			style={
				horizontal
					? {
							top: `${geometry.start}rem`,
							left: `${geometry.cross}rem`,
							width: `${geometry.length}rem`,
							height: "0.125rem",
							transform: "translateY(-50%)",
						}
					: {
							left: `${geometry.start}rem`,
							top: `${geometry.cross}rem`,
							height: `${geometry.length}rem`,
							width: "0.125rem",
							transform: "translateX(-50%)",
						}
			}
		/>
	);
}
