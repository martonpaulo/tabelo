import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import {
	equalSelectionText,
	occurrenceSelectionApplies,
	occurrenceSummary,
} from "./occurrence-selection";

// The header's two numbers have to agree with what the key press actually
// selects, so these cases pin the counting to the same matching rules
// `selectNextOccurrence` uses: literal, case-sensitive, and narrowed to whole
// words when the selection is exactly one word.

function stateWith(
	doc: string,
	ranges: readonly [number, number][],
	editable = true,
) {
	return EditorState.create({
		doc,
		selection: EditorSelection.create(
			ranges.map(([from, to]) => EditorSelection.range(from, to)),
		),
		extensions: [
			EditorState.allowMultipleSelections.of(true),
			EditorView.editable.of(editable),
		],
	});
}

describe("equalSelectionText", () => {
	it("reports the text every range holds", () => {
		const state = stateWith("Ingrid and Ingrid", [
			[0, 6],
			[11, 17],
		]);
		expect(equalSelectionText(state)).toBe("Ingrid");
	});

	it("reports nothing for a caret", () => {
		expect(equalSelectionText(stateWith("Ingrid", [[3, 3]]))).toBeNull();
	});

	it("reports nothing when one range is empty", () => {
		const state = stateWith("Ingrid and Ingrid", [
			[0, 6],
			[9, 9],
		]);
		expect(equalSelectionText(state)).toBeNull();
	});

	it("reports nothing when the ranges hold different text", () => {
		const state = stateWith("Ingrid and Madrid", [
			[0, 6],
			[11, 17],
		]);
		expect(equalSelectionText(state)).toBeNull();
	});

	it("distinguishes case, as the command does", () => {
		const state = stateWith("Ingrid ingrid", [
			[0, 6],
			[7, 13],
		]);
		expect(equalSelectionText(state)).toBeNull();
	});
});

describe("occurrenceSummary", () => {
	it("says nothing about a single selected range", () => {
		expect(occurrenceSummary(stateWith("Rio Rio Rio", [[0, 3]]))).toBeNull();
	});

	it("counts every occurrence in the source", () => {
		const state = stateWith("Rio Rio Rio", [
			[0, 3],
			[4, 7],
		]);
		expect(occurrenceSummary(state)).toEqual({ selected: 2, total: 3 });
	});

	it("counts only whole words when the selection is exactly a word", () => {
		// "Rio" appears three times as a substring and twice as a word.
		const state = stateWith("Rio Rio Riobamba", [
			[0, 3],
			[4, 7],
		]);
		expect(occurrenceSummary(state)).toEqual({ selected: 2, total: 2 });
	});

	it("counts substrings when the selection is not a whole word", () => {
		const state = stateWith("Riobamba Riobamba Rio", [
			[0, 3],
			[9, 12],
		]);
		expect(occurrenceSummary(state)).toEqual({ selected: 2, total: 3 });
	});

	it("is case-sensitive", () => {
		const state = stateWith("Rio Rio rio", [
			[0, 3],
			[4, 7],
		]);
		expect(occurrenceSummary(state)).toEqual({ selected: 2, total: 2 });
	});

	it("says nothing once the ranges stop agreeing", () => {
		const state = stateWith("Ingrid and Madrid", [
			[0, 6],
			[11, 17],
		]);
		expect(occurrenceSummary(state)).toBeNull();
	});

	// Promoting the newest range to primary can make the main range a whole word
	// while an earlier one sits inside a longer one. Reading whole-wordness from
	// the main range alone would count one match and claim two are selected.
	it("never reports fewer matches than are selected", () => {
		const state = stateWith("Rio Riobamba", [
			[0, 3],
			[4, 7],
		]);
		expect(occurrenceSummary(state)).toEqual({ selected: 2, total: 2 });
	});
});

describe("occurrenceSelectionApplies", () => {
	it("applies to a non-empty selection in an editable view", () => {
		expect(occurrenceSelectionApplies(stateWith("Rio Rio", [[0, 3]]))).toBe(
			true,
		);
	});

	it("does not apply to a caret, so the key reaches the browser", () => {
		expect(occurrenceSelectionApplies(stateWith("Rio Rio", [[3, 3]]))).toBe(
			false,
		);
	});

	it("does not apply in a read-only view", () => {
		expect(
			occurrenceSelectionApplies(stateWith("Rio Rio", [[0, 3]], false)),
		).toBe(false);
	});
});
