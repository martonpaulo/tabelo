import { HEADER_ROW, selectedAxis, selectionContains } from "@/core/selection";
import { useTabeloStore } from "@/state/store";

// Opening a menu selects what it acts on, so the actions and the highlight can
// never disagree about their target. The one exception is a target the
// selection already holds: collapsing onto it would discard the rest of what
// the user picked, and the menu would then act on one column of the several
// they meant. That is the same rule the context menu has always applied to a
// right-click inside the selection, and with several regions in play it is what
// keeps every action reachable at all.
//
// Both menu surfaces call this, so the rule has one owner.

export function targetAxisForMenu(axis: "row" | "column", index: number): void {
	const store = useTabeloStore.getState();
	const covered = selectedAxis(
		store.selection,
		axis,
		store.document.rows.length,
		store.document.columns.length,
	);
	if (covered.includes(index)) return;

	store.selectCell(
		axis === "column"
			? { row: HEADER_ROW, column: index }
			: { row: index, column: 0 },
		axis,
	);
}

export function targetCellForMenu(row: number, column: number): void {
	const store = useTabeloStore.getState();
	// Asked of the selection itself rather than recomputed from an anchor and a
	// focus: only the selection knows that a row or column region spans the
	// whole other axis, and that a column reaches the header row. Recomputing it
	// here collapsed a select-all the moment the user right-clicked inside it.
	if (
		selectionContains(
			store.selection,
			store.document.rows.length,
			store.document.columns.length,
			row,
			column,
		)
	) {
		return;
	}
	store.selectCell({ row, column });
}
