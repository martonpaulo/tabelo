import { SearchQuery, search, setSearchQuery } from "@codemirror/search";
import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { allMatchesSelection } from "./source-find";

// Select every match (#429) has to select exactly what the bar counts, with the
// same literal query and Match case, so these cases pin it to the cursor the
// count uses rather than to a second matcher.

function stateWith(
	doc: string,
	query: string,
	options: { caseSensitive?: boolean; caret?: [number, number] } = {},
): EditorState {
	const [anchor, head] = options.caret ?? [0, 0];
	const state = EditorState.create({
		doc,
		selection: EditorSelection.single(anchor, head),
		extensions: [
			EditorState.allowMultipleSelections.of(true),
			search({ literal: true }),
		],
	});
	return state.update({
		effects: setSearchQuery.of(
			new SearchQuery({
				search: query,
				literal: true,
				caseSensitive: options.caseSensitive ?? false,
			}),
		),
	}).state;
}

function texts(state: EditorState, selection: EditorSelection): string[] {
	return selection.ranges.map((range) => state.sliceDoc(range.from, range.to));
}

describe("allMatchesSelection", () => {
	it("selects every occurrence the query matches, ignoring case unless asked", () => {
		const state = stateWith("Ingrid,Rio\nPaulo,rio\n", "rio");
		const selection = allMatchesSelection(state);
		expect(selection && texts(state, selection)).toEqual(["Rio", "rio"]);

		const exact = stateWith("Ingrid,Rio\nPaulo,rio\n", "rio", {
			caseSensitive: true,
		});
		const only = allMatchesSelection(exact);
		expect(only && texts(exact, only)).toEqual(["rio"]);
	});

	it("keeps the occurrence the bar calls current as the primary range", () => {
		const state = stateWith("Rio Rio Rio", "Rio", { caret: [4, 7] });
		const selection = allMatchesSelection(state);
		expect(selection?.ranges).toHaveLength(3);
		expect(selection?.main.from).toBe(4);
	});

	it("matches a query that spans lines, literally", () => {
		const state = stateWith("Rio\nMadrid\nRio\nMadrid", "Rio\nMadrid");
		const selection = allMatchesSelection(state);
		expect(selection?.ranges).toHaveLength(2);
	});

	it("selects nothing when nothing matches or there is no query", () => {
		expect(allMatchesSelection(stateWith("Ingrid,Rio", "Madrid"))).toBeNull();
		expect(allMatchesSelection(stateWith("Ingrid,Rio", ""))).toBeNull();
	});

	// Upstream's selectMatches stops at 1000 matches and then selects nothing at
	// all; a Markdown pipe at the target scale passes that.
	it("selects every match past a thousand, as many as the count reports", () => {
		const state = stateWith("|".repeat(1500), "|");
		expect(allMatchesSelection(state)?.ranges).toHaveLength(1500);
	});
});
