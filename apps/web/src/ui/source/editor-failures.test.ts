// @vitest-environment happy-dom

import { type Extension, StateField } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { editorFailures } from "./editor-failures";

// Both ways an exception leaves CodeMirror end at the same reporter: the ones
// CodeMirror catches itself, and a transaction whose next state cannot be
// computed, which it does not catch.

let view: EditorView | null = null;

afterEach(() => {
	view?.destroy();
	view = null;
});

function editor(
	report: (error: unknown) => void,
	extension: Extension,
): EditorView {
	const failures = editorFailures(() => report);
	view = new EditorView({
		doc: "Name",
		dispatchTransactions: failures.dispatchTransactions,
		extensions: [failures.extension, extension],
	});
	return view;
}

describe("editorFailures", () => {
	it("reports a plugin that throws while updating", () => {
		const report = vi.fn();
		const failing = ViewPlugin.define(() => ({
			update(update) {
				if (update.docChanged) throw new Error("plugin failed");
			},
		}));
		const target = editor(report, failing);
		target.dispatch({ changes: { from: 4, insert: "s" } });
		expect(report).toHaveBeenCalledTimes(1);
	});

	it("reports a transaction whose next state throws, without throwing", () => {
		const report = vi.fn();
		const failing = StateField.define<number>({
			create: () => 0,
			update(value, transaction) {
				if (transaction.docChanged) throw new Error("parser failed");
				return value;
			},
		});
		const target = editor(report, failing);
		expect(() =>
			target.dispatch({ changes: { from: 4, insert: "s" } }),
		).not.toThrow();
		expect(report).toHaveBeenCalledTimes(1);
		// The failed update is not applied, so the editor keeps the text it had.
		expect(target.state.doc.toString()).toBe("Name");
	});

	it("stays quiet while nothing fails", () => {
		const report = vi.fn();
		const target = editor(report, []);
		target.dispatch({ changes: { from: 4, insert: "s" } });
		expect(report).not.toHaveBeenCalled();
		expect(target.state.doc.toString()).toBe("Names");
	});
});
