import { copy } from "@/copy/copy";
import { type CellPosition, HEADER_ROW } from "@/core/selection";
import type { PreconditionFailure } from "@/formats/types";
import { useTabeloStore } from "@/state/store";

// A codec that refuses to represent the document already says which columns or
// rows are at fault. Every surface that shows that refusal offers the same one
// command beside it, so the user is taken to the offending cell instead of
// being told a letter and left to find it.
//
// The refused choice stays disabled. This is a separate command with its own
// label, because a control must never answer to activation while reporting
// itself as disabled.

export interface PreconditionRecovery {
	readonly label: string;
	// The same reason the disabled choice carries, reused as the command's
	// accessible description and as the notice it raises. One explanation.
	readonly reason: string;
	readonly target: CellPosition;
	readonly run: () => void;
}

// The first declared position, columns before rows. A failure names positions
// in the format's own terms and nothing here reads its code, so a format added
// later gets the same recovery without touching this.
export function recoveryTarget(
	failure: PreconditionFailure,
): CellPosition | null {
	const column = failure.columns?.[0];
	// A column is at fault through its header, which is the cell that has to
	// change; a row is at fault through its first column's value.
	if (column !== undefined) return { row: HEADER_ROW, column };

	const row = failure.rows?.[0];
	if (row !== undefined) return { row, column: 0 };

	return null;
}

// Null when there is nothing to go to: a failure with no declared position
// leaves the choice disabled with its reason rather than offering a command
// that would do nothing.
export function preconditionRecovery(
	failure: PreconditionFailure | null,
): PreconditionRecovery | null {
	if (!failure) return null;
	const target = recoveryTarget(failure);
	if (!target) return null;

	const reason = copy.disabled.codecPrecondition(failure);
	return {
		label: copy.actions.fixTable,
		reason,
		target,
		run: () => {
			const store = useTabeloStore.getState();
			// Selection and the notice only. The document, the workspace, and the
			// refused view are all left exactly as they were.
			store.selectCell(target);
			store.pushNotice({ severity: "warning", message: reason });
			focusGridCell(target);
		},
	};
}

// The grid follows the selection with DOM focus only while focus is already
// inside it, so a recovery that starts in a dialog or a menu has to place it.
// Deferred by a frame because the surface being closed restores focus to its
// own opener first, and that restoration would otherwise land last.
//
// With no grid pane open there is no element to find, and the selection simply
// waits for one: recovery never opens a pane the user did not ask for.
function focusGridCell(target: CellPosition): void {
	requestAnimationFrame(() => {
		window.document
			.querySelector<HTMLElement>(
				`[data-cell="${target.row}:${target.column}"]`,
			)
			?.focus();
	});
}
