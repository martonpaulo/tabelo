import { createContext, useContext } from "react";

// How a pane's find bar reaches the surface that searches what the pane shows
// (#280).
//
// The query is state and the results are not. What the user typed lives in the
// store, per pane. A source editor and the rendered preview search their own
// text, and they are the only owners of where its matches are, so the count
// travels up from them the way `use-pane-occurrences` carries the Mod+D summary
// and is never copied into the store, where it could disagree with what the
// surface marks. Commands travel down through a target the surface registers,
// so "the user pressed next" is a call rather than a counter something has to
// watch and reset. The grid needs neither: it searches the document, which the
// store already owns, so its bar reads the store.

// Where a surface's search stands. `index` is the occurrence the surface marks
// as current, or `-1` when the caret is somewhere else in the text.
export interface FindSummary {
	readonly total: number;
	readonly index: number;
}

// What a searching surface does when its pane's bar asks. Every method returns
// the summary it arrived at, so the bar can speak the result of the press that
// caused it without waiting for the report to come round.
export interface FindTarget {
	// Look for this, from where the caret is. An empty query clears the marks.
	readonly search: (
		query: string,
		caseSensitive: boolean,
	) => FindSummary | null;
	readonly step: (offset: 1 | -1) => FindSummary | null;
	// Replacing is offered only where the view is editable, so a read-only
	// surface leaves these out.
	readonly replaceCurrent?: (replacement: string) => boolean;
	readonly replaceAll?: (replacement: string) => number;
	// The bar closed: drop the marks and the reported count.
	readonly close: () => void;
	// Put the keyboard back on the surface, where closing the bar returns it.
	readonly focus: () => void;
}

export interface PaneFind {
	// Open this pane's bar, or bring the caret back to it when it is open.
	readonly open: () => void;
	readonly report: (summary: FindSummary | null) => void;
	// Returns the matching unregister, for the surface's own teardown.
	readonly register: (target: FindTarget) => () => void;
}

export const PaneFindContext = createContext<PaneFind>({
	open: () => {},
	report: () => {},
	register: () => () => {},
});

export function usePaneFind(): PaneFind {
	return useContext(PaneFindContext);
}
