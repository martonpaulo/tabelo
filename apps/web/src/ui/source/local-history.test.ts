// @vitest-environment happy-dom

import { redoDepth, undo, undoDepth } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { samplePeopleMatrix, samplePerson } from "@/core/sample-data";
import { textForView, useTabeloStore } from "@/state/store";
import {
	type ExternalChangeWatch,
	localHistory,
	resetOnExternalChanges,
} from "./local-history";

const initialState = useTabeloStore.getInitialState();

let view: EditorView;
let watch: ExternalChangeWatch;

function markdownPaneId(): string {
	const pane = useTabeloStore
		.getState()
		.workspace.panes.find((candidate) => candidate.view === "markdown");
	if (!pane) throw new Error("the default workspace has a Markdown pane");
	return pane.id;
}

function projection(): string {
	const shown = textForView(useTabeloStore.getState().document, "markdown");
	if (!shown.ok) throw new Error("the sample table projects to Markdown");
	return shown.text;
}

function firstName(): string | undefined {
	return documentToMatrix(useTabeloStore.getState().document)[1]?.[0];
}

// Types `insert` right after the first `marker` and reports the text to the
// store exactly as the editor does: as this editor's own change.
function typeAfter(marker: string, insert: string): void {
	const at = view.state.doc.toString().indexOf(marker) + marker.length;
	view.dispatch({
		changes: { from: at, insert },
		userEvent: "input.type",
	});
	const text = view.state.doc.toString();
	watch.own(() =>
		useTabeloStore.getState().setDraft(markdownPaneId(), "markdown", text),
	);
}

// What the pane's Mod+Z does: local history first, the timeline after it.
function undoInPane(): void {
	if (!undo(view)) useTabeloStore.getState().undo();
}

beforeEach(() => {
	useTabeloStore.getState().discardDraft();
	useTabeloStore.setState(initialState, true);
	useTabeloStore
		.getState()
		.applyDocument(
			documentFromMatrix(samplePeopleMatrix(2), { headerRow: true }),
		);
	view = new EditorView({ doc: projection(), extensions: [localHistory()] });
	watch = resetOnExternalChanges(view);
});

afterEach(() => {
	watch.dispose();
	view.destroy();
});

describe("a source editor's local history", () => {
	it("survives the document changes its own typing commits", () => {
		typeAfter(samplePerson(0).name, "X");
		expect(firstName()).toBe(`${samplePerson(0).name}X`);
		expect(undoDepth(view.state)).toBe(1);
	});

	it("is cleared, redo included, by a grid edit", () => {
		typeAfter(samplePerson(0).name, "X");
		typeAfter(samplePerson(1).name, "Y");
		undo(view);
		expect(redoDepth(view.state)).toBe(1);
		useTabeloStore.getState().editCell(1, 1, "Lisbon");
		expect(undoDepth(view.state)).toBe(0);
		expect(redoDepth(view.state)).toBe(0);
	});

	it("is cleared by a step of the document timeline and by a row move", () => {
		typeAfter(samplePerson(0).name, "X");
		useTabeloStore.getState().undo();
		expect(undoDepth(view.state)).toBe(0);

		typeAfter(samplePerson(0).name, "Y");
		expect(useTabeloStore.getState().moveRowAt(1, -1)).toBeNull();
		expect(undoDepth(view.state)).toBe(0);
	});

	it("is kept when only a draft changes and the document does not", () => {
		typeAfter(samplePerson(0).name, "X");
		useTabeloStore.getState().discardDraft();
		expect(undoDepth(view.state)).toBe(1);
	});

	it("lets undo walk back an external change, then the typing before it", () => {
		const original = firstName();
		typeAfter(samplePerson(0).name, "X");
		const typed = useTabeloStore.getState().document;
		useTabeloStore.getState().editCell(1, 1, "Lisbon");

		undoInPane();
		expect(useTabeloStore.getState().document).toBe(typed);
		undoInPane();
		expect(firstName()).toBe(original);

		useTabeloStore.getState().redo();
		useTabeloStore.getState().redo();
		expect(documentToMatrix(useTabeloStore.getState().document)[2]?.[1]).toBe(
			"Lisbon",
		);
	});

	it("stops watching once disposed", () => {
		typeAfter(samplePerson(0).name, "X");
		watch.dispose();
		useTabeloStore.getState().editCell(1, 1, "Lisbon");
		expect(undoDepth(view.state)).toBe(1);
	});
});
