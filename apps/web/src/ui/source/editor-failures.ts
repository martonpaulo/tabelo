import type { Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

// Routes every exception CodeMirror meets to one reporter, so a failing editor
// shows its pane's failure state instead of breaking silently or blanking the
// app. React's boundary cannot see any of these: they run outside render.
//
// Two paths are needed, because CodeMirror handles exceptions in two ways.
// Plugins, update listeners, DOM event handlers, and measure callbacks are
// caught by CodeMirror itself and handed to `EditorView.exceptionSink`, which
// by default only logs and leaves the editor running without the plugin that
// failed. A transaction, by contrast, is applied without a guard: a state
// field or a language parser that throws while computing the next state (as
// the Jira stream tokenizer did before 884cf98) throws out of `dispatch`, from
// a keystroke or from the idle parse worker, where nothing catches it. Every
// dispatch goes through `dispatchTransactions`, so guarding the update there
// covers both callers. The failed update is not applied, so the editor is left
// on the last state it reached, which the store already holds.
//
// `report` is read at call time, so the editor that is built once can follow
// a reporter that changes.
export function editorFailures(report: () => (error: unknown) => void) {
	return {
		extension: EditorView.exceptionSink.of((error) => report()(error)),
		dispatchTransactions(
			transactions: readonly Transaction[],
			view: EditorView,
		): void {
			try {
				view.update(transactions);
			} catch (error) {
				report()(error);
			}
		},
	};
}
