import { history, redo, undo, undoDepth } from "@codemirror/commands";
import {
	EditorSelection,
	EditorState,
	Transaction,
	type TransactionSpec,
} from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { markdownCodec } from "@/formats/markdown";
import { assistanceExtension } from "./structural-assistance";

const assist = markdownCodec.structuralAssistance;
const table = "| name | city |\n| ---- | ---- |";

function editorState(enabled = true, doc = table): EditorState {
	return EditorState.create({
		doc,
		extensions: [
			history(),
			EditorState.allowMultipleSelections.of(true),
			assistanceExtension(assist, enabled),
		],
	});
}

// Runs a history command the way a key binding would, returning the state it
// produced.
function run(
	state: EditorState,
	command: typeof undo,
): { state: EditorState; transactions: Transaction[] } {
	const transactions: Transaction[] = [];
	let next = state;
	command({
		state,
		dispatch: (tr) => {
			transactions.push(tr);
			next = tr.state;
		},
	});
	return { state: next, transactions };
}

const typeAfterCity: TransactionSpec = {
	changes: { from: 13, insert: "name" },
	userEvent: "input.type",
};

describe("structural assistance in the source editor", () => {
	it("folds the adjustment into the user's transaction", () => {
		const tr = editorState().update(typeAfterCity);
		expect(tr.newDoc.toString()).toBe(
			"| name | cityname |\n| ---- | -------- |",
		);
		expect(tr.isUserEvent("input.type")).toBe(true);
	});

	it("undoes and redoes the edit and its adjustment as one step", () => {
		const typed = editorState().update(typeAfterCity).state;
		expect(undoDepth(typed)).toBe(1);
		const undone = run(typed, undo);
		expect(undone.transactions).toHaveLength(1);
		expect(undone.state.doc.toString()).toBe(table);
		const redone = run(undone.state, redo);
		expect(redone.state.doc.toString()).toBe(typed.doc.toString());
	});

	it("maps every selection range through both changes", () => {
		const state = editorState();
		const tr = state.update({
			changes: { from: 13, insert: "name" },
			selection: EditorSelection.create([
				EditorSelection.cursor(17),
				EditorSelection.cursor(3),
				EditorSelection.cursor(35),
			]),
			userEvent: "input.type",
		});
		const heads = tr.newSelection.ranges.map((range) => range.head);
		// The carets before the divider change stay put, and the one at the end
		// of the divider moves past the dashes added in front of it.
		expect(heads).toEqual([3, 17, 39]);
	});

	it("leaves synchronization, programmatic, and disabled edits as they are", () => {
		const sync = editorState().update({
			changes: { from: 13, insert: "name" },
			annotations: Transaction.addToHistory.of(false),
		});
		expect(sync.newDoc.toString()).toBe("| name | cityname |\n| ---- | ---- |");

		const programmatic = editorState().update({
			changes: { from: 13, insert: "name" },
		});
		expect(programmatic.newDoc.toString()).toBe(
			"| name | cityname |\n| ---- | ---- |",
		);

		const disabled = editorState(false).update(typeAfterCity);
		expect(disabled.newDoc.toString()).toBe(
			"| name | cityname |\n| ---- | ---- |",
		);
	});
});
