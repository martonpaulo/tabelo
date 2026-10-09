import type { TableDocument } from "@/core/types";
import { type TabeloState, useTabeloStore } from "@/state/store";

// What an asynchronous command was started against, snapshotted before its
// first await (#409). A clipboard write, a clipboard read, or a file read can
// resolve after the user has moved the selection, edited, or opened another
// table, and a command that consulted the live state at that point would act on
// something it never saw. The store replaces the document and the selection on
// every change, so comparing references is enough to tell that anything moved.

export interface CommandTarget {
	readonly tableId: TabeloState["library"]["activeId"];
	readonly document: TableDocument;
	readonly selection: TabeloState["selection"];
}

// `current`: nothing the command depends on has changed. `edited`: the same
// table is open but its document or selection is not the one captured.
// `switched`: another table, or none, is active now.
type CommandTargetStatus = "current" | "edited" | "switched";

export function captureCommandTarget(): CommandTarget {
	const { library, document, selection } = useTabeloStore.getState();
	return { tableId: library.activeId, document, selection };
}

export function commandTargetStatus(
	target: CommandTarget,
): CommandTargetStatus {
	const state = useTabeloStore.getState();
	if (state.library.activeId !== target.tableId) return "switched";
	return state.document === target.document &&
		state.selection === target.selection
		? "current"
		: "edited";
}

// The same table and the same document, whatever the selection did since. This
// is what a copy mark needs: it records cells, not the cursor.
export function commandDocumentUnchanged(target: CommandTarget): boolean {
	const state = useTabeloStore.getState();
	return (
		state.library.activeId === target.tableId &&
		state.document === target.document
	);
}
