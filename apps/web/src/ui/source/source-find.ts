import {
	closeSearchPanel,
	findNext,
	findPrevious,
	getSearchQuery,
	openSearchPanel,
	replaceAll,
	replaceNext,
	SearchQuery,
	search,
	searchPanelOpen,
	setSearchQuery,
} from "@codemirror/search";
import {
	EditorSelection,
	EditorState,
	type Extension,
	Prec,
	Transaction,
} from "@codemirror/state";
import {
	EditorView,
	keymap,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import type {
	FindSummary,
	FindTarget,
	PaneFind,
} from "@/ui/workspace/use-pane-find";

// Find and replace inside a source pane (#280): the pane's own bar, driving
// CodeMirror's search over the text the editor shows. A match in Markdown is a
// match in the Markdown the user is looking at, not in the table behind it.
//
// Matching, stepping, highlighting, and replacing are all upstream's. Tabelo
// renders its own bar rather than CodeMirror's panel, which is not this
// product's design line, and drives the upstream commands from it. Two things
// here exist only to make that possible:
//
// - Upstream paints matches only while its panel is open, and its commands
//   open the panel when there is no valid query. So the panel is opened with an
//   empty, hidden element and kept for exactly as long as the bar is: it is the
//   switch that turns upstream's highlighting on, and nothing is drawn in it.
// - Upstream announces each step through the editor's own live region. The
//   bar already speaks the position through the app's one polite channel
//   (docs/design-system/9-accessibility.md), so those announcements are dropped rather than
//   read twice.
//
// https://codemirror.net/docs/ref/#search

const hiddenPanel = search({
	literal: true,
	createPanel: () => {
		const dom = document.createElement("div");
		dom.className = "cm-tabeloFindHost";
		dom.hidden = true;
		return { dom };
	},
});

// Literal, never a regular expression: regular expressions are out of scope,
// and `literal` is also what stops a `\n` typed in the field being read as an
// escape instead of the two characters it is.
function queryFor(
	text: string,
	caseSensitive: boolean,
	replacement = "",
): SearchQuery {
	return new SearchQuery({
		search: text,
		caseSensitive,
		literal: true,
		replace: replacement,
	});
}

// The count and the current position, from one pass over the same cursor the
// commands search with, so the number the bar shows and the occurrence Enter
// moves to cannot disagree. The current occurrence is the one the editor's
// main selection covers exactly, which is also the one upstream paints as
// selected.
export function findSummary(state: EditorState): FindSummary | null {
	if (!searchPanelOpen(state)) return null;
	const query = getSearchQuery(state);
	if (!query.valid) return null;
	const main = state.selection.main;
	let total = 0;
	let index = -1;
	const cursor = query.getCursor(state);
	for (let next = cursor.next(); !next.done; next = cursor.next()) {
		if (next.value.from === main.from && next.value.to === main.to) {
			index = total;
		}
		total += 1;
	}
	return { total, index };
}

// Moves the selection onto the first occurrence at or after the caret,
// wrapping to the start, so typing a query lands on a match the way the grid's
// bar does. Upstream's own `findNext` searches from the end of the selection,
// which would skip an occurrence the caret is already standing on.
function revealFirstFrom(view: EditorView): void {
	const query = getSearchQuery(view.state);
	if (!query.valid) return;
	const from = view.state.selection.main.from;
	let found = query.getCursor(view.state, from).next();
	if (found.done) found = query.getCursor(view.state).next();
	if (found.done) return;
	view.dispatch({
		selection: EditorSelection.single(found.value.from, found.value.to),
		scrollIntoView: true,
		userEvent: "select.search",
	});
}

function targetFor(view: EditorView): FindTarget {
	const setQuery = (query: SearchQuery) => {
		if (!searchPanelOpen(view.state)) openSearchPanel(view);
		view.dispatch({ effects: setSearchQuery.of(query) });
	};
	const withReplacement = (replacement: string) => {
		const current = getSearchQuery(view.state);
		setQuery(queryFor(current.search, current.caseSensitive, replacement));
	};
	return {
		search: (text, caseSensitive) => {
			setQuery(queryFor(text, caseSensitive));
			revealFirstFrom(view);
			return findSummary(view.state);
		},
		step: (offset) => {
			if (!getSearchQuery(view.state).valid) return null;
			if (offset === 1) findNext(view);
			else findPrevious(view);
			return findSummary(view.state);
		},
		// A replace is an ordinary editor transaction: the update listener hands
		// the new text to synchronization like any keystroke, so the draft ends
		// up valid or invalid exactly as typing the same change would, the other
		// views follow through the normal path, and undo treats it like typing.
		replaceCurrent: (replacement) => {
			if (!getSearchQuery(view.state).valid) return false;
			withReplacement(replacement);
			const before = view.state.doc;
			// Upstream replaces only an occurrence the selection already covers,
			// and otherwise just moves to the next one. Landing on it first is
			// what makes the button replace what the count calls current.
			if (findSummary(view.state)?.index === -1) revealFirstFrom(view);
			replaceNext(view);
			return view.state.doc !== before;
		},
		replaceAll: (replacement) => {
			if (!getSearchQuery(view.state).valid) return 0;
			withReplacement(replacement);
			const count = findSummary(view.state)?.total ?? 0;
			return replaceAll(view) ? count : 0;
		},
		close: () => {
			closeSearchPanel(view);
		},
		focus: () => view.focus(),
	};
}

// Upstream's step and replace announcements, dropped for the reason at the top
// of this file. Everything else in the transaction is kept as it was.
const quietSearch = EditorState.transactionFilter.of((transaction) => {
	if (
		!transaction.isUserEvent("select.search") &&
		!transaction.isUserEvent("input.replace")
	)
		return transaction;
	const effects = transaction.effects.filter(
		(effect) => !effect.is(EditorView.announce),
	);
	if (effects.length === transaction.effects.length) return transaction;
	return {
		changes: transaction.changes,
		selection: transaction.selection,
		effects,
		scrollIntoView: transaction.scrollIntoView,
		userEvent: transaction.annotation(Transaction.userEvent),
	};
});

// The pane's find, wired into one editor: registered while the editor lives,
// the count reported whenever the text, the selection, or the query changes,
// and Mod+F taken from the browser so its own find, which would search the
// page chrome rather than this text, never opens over the pane.
export function sourceFind(paneFind: () => PaneFind): Extension {
	const reporter = ViewPlugin.fromClass(
		class {
			readonly unregister: () => void;
			last: FindSummary | null = null;

			constructor(view: EditorView) {
				this.unregister = paneFind().register(targetFor(view));
			}

			update(update: ViewUpdate) {
				if (
					!update.docChanged &&
					!update.selectionSet &&
					getSearchQuery(update.state) === getSearchQuery(update.startState) &&
					searchPanelOpen(update.state) === searchPanelOpen(update.startState)
				)
					return;
				const next = findSummary(update.state);
				if (
					next?.total === this.last?.total &&
					next?.index === this.last?.index
				)
					return;
				this.last = next;
				paneFind().report(next);
			}

			destroy() {
				this.unregister();
				paneFind().report(null);
			}
		},
	);

	return [
		hiddenPanel,
		reporter,
		quietSearch,
		Prec.high(
			keymap.of([
				{
					key: "Mod-f",
					preventDefault: true,
					run: () => {
						paneFind().open();
						return true;
					},
				},
			]),
		),
	];
}
