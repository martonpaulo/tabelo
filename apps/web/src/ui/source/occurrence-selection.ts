import { SearchCursor, selectNextOccurrence } from "@codemirror/search";
import { EditorSelection, type EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

// Incremental occurrence selection, the code-editor Mod+D. CodeMirror owns the
// matching and the multiple ranges; everything here is the product guard around
// its command plus the derived summary the pane header reads.
//
// Matching semantics are deliberately not reimplemented: `selectNextOccurrence`
// is case-sensitive literal text, wraps, and narrows to whole words when the
// selection is exactly one word. The counting below drives the same
// `SearchCursor` under the same whole-word condition, so the two numbers in the
// summary can never disagree with what the key press actually does.
// https://codemirror.net/docs/ref/#search.selectNextOccurrence

export interface OccurrenceSummary {
	// How many equal ranges are selected right now.
	readonly selected: number;
	// How many occurrences the current source text holds in total.
	readonly total: number;
}

// The text every selected range holds, or null when the selection is empty,
// holds an empty range, or holds ranges whose text differs. That last case is
// what a plain multiple selection made some other way looks like, and it is not
// this feature: the key press has to fall through to the browser.
export function equalSelectionText(state: EditorState): string | null {
	const ranges = state.selection.ranges;
	const first = ranges[0];
	if (!first || first.from === first.to) return null;
	const text = state.sliceDoc(first.from, first.to);
	for (const range of ranges) {
		if (range.from === range.to) return null;
		if (state.sliceDoc(range.from, range.to) !== text) return null;
	}
	return text;
}

// Upstream narrows to whole words when the selection is exactly a word, which
// it decides from the main range alone. The count asks it of every selected
// range instead, and the difference is load-bearing: promoting the newest range
// to primary can hand upstream a main range that is a whole word while an
// earlier one is not, and reading only that range would count fewer matches
// than are already selected. "2 of 1" is not a state the header may ever show.
// Requiring every range keeps `total` at or above `selected` by construction.
function isWholeWordSelection(state: EditorState): boolean {
	return state.selection.ranges.every((range) => {
		const word = state.wordAt(range.head);
		return Boolean(word && word.from === range.from && word.to === range.to);
	});
}

function countOccurrences(
	state: EditorState,
	query: string,
	wholeWord: boolean,
): number {
	let total = 0;
	const cursor = new SearchCursor(state.doc, query);
	while (!cursor.next().done) {
		if (wholeWord) {
			const word = state.wordAt(cursor.value.from);
			if (
				!word ||
				word.from !== cursor.value.from ||
				word.to !== cursor.value.to
			) {
				continue;
			}
		}
		total += 1;
	}
	return total;
}

// What the pane header shows, or null when there is nothing to report. Derived
// from the editor state on every update rather than stored: a count that could
// disagree with the real selection would be worse than no count at all.
//
// Two ranges is the floor. One selected occurrence is an ordinary selection and
// says nothing the user does not already see.
export function occurrenceSummary(
	state: EditorState,
): OccurrenceSummary | null {
	const selected = state.selection.ranges.length;
	if (selected < 2) return null;
	const text = equalSelectionText(state);
	if (text === null) return null;
	return {
		selected,
		total: countOccurrences(state, text, isWholeWordSelection(state)),
	};
}

// Whether Mod+D applies at all. A read-only view and a caret with nothing
// selected both fall through, so an otherwise available browser command is not
// suppressed. CodeMirror's own command would expand an empty caret to the
// surrounding word; this product deliberately does not expose that.
// Editability is the registry's `editable` capability arriving as a facet, so
// this is the capability gate rather than a list of view ids: see
// docs/adr/0005. Every source view is editable today, which makes the
// read-only branch unreachable through the product and reachable only here.
export function occurrenceSelectionApplies(state: EditorState): boolean {
	if (!state.facet(EditorView.editable)) return false;
	return equalSelectionText(state) !== null;
}

// Runs the upstream command, then makes the range it added the primary one.
//
// Upstream passes `false` to `addRange`, so the occurrence it just found is
// visible but not primary. Forking the command to change that would mean
// reproducing its matching rules, which is exactly the parallel implementation
// this feature exists not to write, so the range is promoted afterwards instead.
// https://github.com/codemirror/search/blob/main/src/selection-match.ts
export function selectNextOccurrenceAsPrimary(view: EditorView): boolean {
	if (!occurrenceSelectionApplies(view.state)) return false;

	const before = new Set(
		view.state.selection.ranges.map((range) => `${range.from}:${range.to}`),
	);
	if (!selectNextOccurrence(view)) return false;

	const selection = view.state.selection;
	const added = selection.ranges.findIndex(
		(range) => !before.has(`${range.from}:${range.to}`),
	);
	if (added >= 0 && added !== selection.mainIndex) {
		view.dispatch({
			selection: EditorSelection.create(selection.ranges, added),
			scrollIntoView: true,
		});
	}
	return true;
}
