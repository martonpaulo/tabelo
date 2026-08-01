import { useEffect, useRef, useState } from "react";
import { copy } from "@/copy/copy";
import { rectColumns, rectRows, selectionRect } from "@/core/selection";
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

	const rect = selectionRect(selection, rowCount, columnCount);
	// The header row counts as a row here, because it is selectable and its
	// cells are cleared by the same key. Wording that distinguishes it belongs
	// to the copy pass in #78, not to this hook.
	const rows = rectRows(rect).length;
	const columns = rectColumns(rect).length;

	const [announcement, setAnnouncement] = useState("");
	// Seeded with the extent the app opens on, so the first render is silent:
	// nothing has changed for the user to be told about yet.
	const spoken = useRef(`${rows}x${columns}`);

	useEffect(() => {
		const extent = `${rows}x${columns}`;
		if (extent === spoken.current) return;
		const timer = setTimeout(() => {
			spoken.current = extent;
			setAnnouncement(copy.a11y.selectionSummary(rows, columns));
		}, SETTLE_MS);
		return () => clearTimeout(timer);
	}, [rows, columns]);

	return announcement;
}
