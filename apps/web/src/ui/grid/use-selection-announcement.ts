import { useEffect, useRef, useState } from "react";
import { copy } from "@/copy/copy";
import {
	type GridSelection,
	isContiguous,
	rectColumns,
	rectRows,
	selectionColumns,
	selectionRect,
	selectionRows,
} from "@/core/selection";
import { useTabeloStore } from "@/state/store";

// Holding Shift+Down should say the extent the user stopped at, not one
// utterance per keystroke, so the summary is written only once it settles.
const SETTLE_MS = 300;

// How large the selection is, which is the scope Backspace and Mod+Backspace
// act on and the one thing per-cell aria-selected never conveys.
//
// Derived from the selection and the document rather than stored: an extent
// that could disagree with the real selection would be worse than silence. It
// is transient by construction and reaches neither history nor persistence.
//
// Moving the focused cell inside an unchanged selection says nothing. The cell
// announces its own value as focus lands on it, and repeating the extent on
// every arrow key would double-speak over that.
export function useSelectionAnnouncement(): string {
	const selection = useTabeloStore((state) => state.selection);
	const rowCount = useTabeloStore((state) => state.document.rows.length);
	const columnCount = useTabeloStore((state) => state.document.columns.length);

	const summary = selectionSummary(selection, rowCount, columnCount);

	const [announcement, setAnnouncement] = useState("");
	// Seeded with the extent the app opens on, so the first render is silent:
	// nothing has changed for the user to be told about yet.
	const spoken = useRef(summary);

	useEffect(() => {
		if (summary === spoken.current) return;
		const timer = setTimeout(() => {
			spoken.current = summary;
			setAnnouncement(summary);
		}, SETTLE_MS);
		return () => clearTimeout(timer);
	}, [summary]);

	return announcement;
}

// One continuous region has an extent, so it is read as one. Several separate
// regions have no single shape, so the total is what gets read: every selected
// column counted once, not whichever region the modifier touched last.
function selectionSummary(
	selection: GridSelection,
	rowCount: number,
	columnCount: number,
): string {
	if (isContiguous(selection)) {
		const rect = selectionRect(selection, rowCount, columnCount);
		// The header row counts as a row here, because it is selectable and its
		// cells are cleared by the same key. Wording that distinguishes it belongs
		// to the copy pass in #78, not to this hook.
		return copy.a11y.selectionSummary(
			rectRows(rect).length,
			rectColumns(rect).length,
		);
	}

	const modes = new Set(selection.ranges.map((range) => range.mode));
	if (modes.size === 1 && modes.has("column")) {
		return copy.a11y.multiSelectionSummary(
			"column",
			selectionColumns(selection, rowCount, columnCount).length,
		);
	}
	if (modes.size === 1 && modes.has("row")) {
		return copy.a11y.multiSelectionSummary(
			"row",
			selectionRows(selection, rowCount, columnCount).length,
		);
	}
	// Regions of different shapes have no shared unit to count, so the count is
	// of the regions themselves.
	return copy.a11y.multiSelectionSummary("area", selection.ranges.length);
}
