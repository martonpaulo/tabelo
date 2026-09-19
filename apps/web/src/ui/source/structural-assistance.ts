import {
	ChangeSet,
	EditorSelection,
	EditorState,
	type Extension,
	Transaction,
	type TransactionSpec,
} from "@codemirror/state";
import type { SourceRowRange, StructuralAssistance } from "@/formats/types";

// The source editor's side of a format's structural assistance (#297): a
// transaction filter that asks the codec's pure function for an adjustment and
// lands it in the same transaction as the user edit that triggered it. The
// editor never knows which format it is serving; it only has the function the
// codec declared. See "Source text is free; structural assistance is narrow"
// in AGENTS.md.
//
// Filter order: this and the empty-value caret snap in empty-values.ts are both
// transaction filters, and they never act on the same transaction. The snap
// only adjusts a transaction that moves the selection without changing the
// text, and this only adjusts one that changes the text, so whichever
// CodeMirror runs first hands the other a transaction it passes through
// untouched. The combined transaction this returns still changes the text, so
// the snap leaves it alone too.
export function assistanceExtension(
	assist: StructuralAssistance | undefined,
	enabled: boolean,
): Extension {
	if (!assist || !enabled) return [];
	return EditorState.transactionFilter.of((tr) =>
		assistedTransaction(tr, assist),
	);
}

// Only an ordinary user edit is adjusted. A synchronization transaction is kept
// out of history and carries no user event, so both checks below pass it
// through untouched, and it lands exactly as projected. Undo and redo restore
// what history recorded, adjustment included. Any other transaction without a
// user event is a programmatic change the user did not make.
function assistedTransaction(
	tr: Transaction,
	assist: StructuralAssistance,
): Transaction | readonly TransactionSpec[] {
	if (!tr.docChanged) return tr;
	if (tr.annotation(Transaction.addToHistory) === false) return tr;
	if (tr.annotation(Transaction.userEvent) === undefined) return tr;
	if (tr.isUserEvent("undo") || tr.isUserEvent("redo")) return tr;

	const changed: SourceRowRange[] = [];
	tr.changes.iterChangedRanges((_fromA, _toA, from, to) => {
		changed.push({ from, to });
	});
	const edits = assist(
		tr.startState.doc.toString(),
		tr.newDoc.toString(),
		changed,
	);
	if (!edits || edits.length === 0) return tr;
	// Sequential, so the adjustment is written against the text after the
	// user's edit. CodeMirror merges the two into one transaction: one update,
	// one change notification with the final text, one local history event, and
	// every selection range mapped through both changes. A caret sitting where
	// the adjustment inserts text stays in front of it, unless the feature asks
	// for it to land after, where the user's typing continues (#391). Several
	// edits are one change set, so a caret between them only moves by what was
	// inserted or removed in front of it (#401).
	// https://codemirror.net/docs/ref/#state.EditorState^transactionFilter
	const changes = edits.map(({ from, to, insert }) => ({ from, to, insert }));
	const landAfter = new Set(
		edits.filter((edit) => edit.caretAfter).map((edit) => edit.from),
	);
	if (landAfter.size === 0) return [tr, { changes, sequential: true }];
	const set = ChangeSet.of(changes, tr.newDoc.length);
	const selection = EditorSelection.create(
		tr.newSelection.ranges.map((range) =>
			range.map(set, landAfter.has(range.head) ? 1 : -1),
		),
		tr.newSelection.mainIndex,
	);
	return [tr, { changes, selection, sequential: true }];
}
