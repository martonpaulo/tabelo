import { history } from "@codemirror/commands";
import { Compartment, type Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { useTabeloStore } from "@/state/store";

// A source editor's own keystroke history, the first layer of undo
// (docs/adr/0003), and the one rule for when it ends.

const historyCompartment = new Compartment();

export function localHistory(): Extension {
	return historyCompartment.of(history());
}

// Drops the editor's local undo history and starts an empty one. Dropping the
// field and adding it back is what clears it: reconfiguring a compartment that
// keeps the field keeps its contents too, so this has to be two transactions.
export function clearLocalHistory(view: EditorView): void {
	view.dispatch({ effects: historyCompartment.reconfigure([]) });
	view.dispatch({ effects: historyCompartment.reconfigure(history()) });
}

export interface ExternalChangeWatch {
	// Runs `report` as this editor's own change: typing, or its own undo or
	// redo, handed to the store. A document change it causes keeps the history.
	readonly own: (report: () => void) => void;
	readonly dispose: () => void;
}

// Clears `view`'s local history whenever the document changes by anything but
// this editor's own report: a grid edit, another pane's text, a menu command, a
// row move, or a step of the document timeline (owner, 2026-09-19). Its
// keystroke history describes text from before that change, so undoing through
// it would rewrite the change away as if it were typing. With the history
// cleared, undo in this pane falls straight to the document timeline, which
// walks the change back as the step it is. Nothing is lost: every committed
// parse is already a timeline step, and a displaced draft is carried by the
// step that displaced it.
//
// The store notifies subscribers synchronously inside the update, which is
// what lets `own` mark exactly the changes this editor reported.
export function resetOnExternalChanges(view: EditorView): ExternalChangeWatch {
	let reporting = false;
	const dispose = useTabeloStore.subscribe((state, previous) => {
		if (reporting || state.document === previous.document) return;
		clearLocalHistory(view);
	});
	return {
		own: (report) => {
			reporting = true;
			try {
				report();
			} finally {
				reporting = false;
			}
		},
		dispose,
	};
}
