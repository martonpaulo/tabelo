// @vitest-environment happy-dom

import { json } from "@codemirror/lang-json";
import { forceParsing, syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { emptyValueMarkers, jsonEmptyCells } from "./empty-values";

let view: EditorView | null = null;

afterEach(() => {
	view?.destroy();
	view = null;
});

// CodeMirror parses only the first 3000 characters when an editor opens and
// the rest in the background, so an empty string past that point is absent
// from the first tree (#600).
const lateEmptyString = `[${" ".repeat(3100)}{"City": ""}]`;

describe("emptyValueMarkers", () => {
	it("marks a field the syntax tree reaches only after the editor opens", () => {
		view = new EditorView({
			doc: lateEmptyString,
			extensions: [json(), emptyValueMarkers(jsonEmptyCells)],
		});
		expect(syntaxTree(view.state).length).toBeLessThan(view.state.doc.length);

		forceParsing(view, view.state.doc.length, 5_000);

		expect(syntaxTree(view.state).length).toBe(view.state.doc.length);
		expect(view.dom.querySelectorAll(".cm-tabeloEmptyValue")).toHaveLength(1);
	});
});
