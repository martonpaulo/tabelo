import { beforeEach, describe, expect, it } from "vitest";
import { cellTextAt, readCell } from "@/core/cell-value";
import { documentFromMatrix } from "@/core/document";
import { samplePeopleMatrix } from "@/core/sample-data";
import { activeRange, HEADER_ROW } from "@/core/selection";
import type { CellValue, TableDocument } from "@/core/types";
import { currentMatch, useTabeloStore } from "./store";

// The find bar's transient state: what it looked for, what it found, where it
// is in that list, and what a replacement does to the document underneath it.
// The matcher itself is proved in core/find.test.ts; these are the store's own
// contracts around it.

const initialState = useTabeloStore.getInitialState();

function tableOf(matrix: readonly (readonly CellValue[])[]): TableDocument {
	return documentFromMatrix(matrix, { headerRow: true });
}

function load(document: TableDocument): void {
	useTabeloStore.getState().applyDocument(document);
}

function search(query: string, caseSensitive = false): void {
	const store = useTabeloStore.getState();
	store.openFind();
	if (caseSensitive) useTabeloStore.getState().setFindCaseSensitive(true);
	useTabeloStore.getState().setFindQuery(query);
}

function find() {
	const state = useTabeloStore.getState().find;
	if (!state) throw new Error("The find bar is not open.");
	return state;
}

function focusedCell() {
	return activeRange(useTabeloStore.getState().selection).focus;
}

function valueAt(row: number, column: number): string {
	const document = useTabeloStore.getState().document;
	const target = document.columns[column];
	if (!target) throw new Error(`No column at index ${column}`);
	if (row === HEADER_ROW) return target.header;
	const dataRow = document.rows[row];
	if (!dataRow) throw new Error(`No row at index ${row}`);
	return cellTextAt(dataRow, target.id);
}

beforeEach(() => {
	useTabeloStore.setState(initialState, true);
});

describe("the find bar's state", () => {
	it("does not exist until the command opens it, and reopening keeps the query", () => {
		expect(useTabeloStore.getState().find).toBeNull();

		load(tableOf([["city"], ["Rio"]]));
		search("Rio");
		useTabeloStore.getState().openFind();

		expect(find().query).toBe("Rio");
	});

	it("moves the selection to the first occurrence as the query is typed", () => {
		load(
			tableOf([
				["name", "city"],
				["Ingrid", "Rio"],
				["Paulo", "Madrid"],
			]),
		);
		search("Madrid");

		expect(focusedCell()).toEqual({ row: 1, column: 1 });
	});

	it("walks the list in both directions and wraps at either end", () => {
		load(tableOf([["city"], ["Rio"], ["Rio"]]));
		search("Rio");
		expect(find().index).toBe(0);

		useTabeloStore.getState().stepFindMatch(1);
		expect(find().index).toBe(1);
		expect(focusedCell()).toEqual({ row: 1, column: 0 });

		useTabeloStore.getState().stepFindMatch(1);
		expect(find().index).toBe(0);

		useTabeloStore.getState().stepFindMatch(-1);
		expect(find().index).toBe(1);
	});

	it("reaches header cells as ordinary cells", () => {
		load(tableOf([["city"], ["Rio"]]));
		search("city");

		expect(currentMatch(find())?.row).toBe(HEADER_ROW);
		expect(focusedCell().row).toBe(HEADER_ROW);
	});

	it("recomputes after a document change instead of keeping stale offsets", () => {
		load(tableOf([["city"], ["Rio de Janeiro"]]));
		search("Rio");
		expect(find().matches).toHaveLength(1);

		useTabeloStore.getState().editCell(0, 0, "Rio");
		expect(find().matches).toEqual([{ row: 0, column: 0, start: 0, end: 3 }]);

		useTabeloStore.getState().editCell(0, 0, "Madrid");
		expect(find().matches).toEqual([]);
		expect(find().index).toBe(-1);
	});

	it("follows undo back to what the document held", () => {
		load(tableOf([["city"], ["Rio"]]));
		search("Rio");
		useTabeloStore.getState().editCell(0, 0, "Madrid");
		expect(find().matches).toHaveLength(0);

		useTabeloStore.getState().undo();
		expect(find().matches).toHaveLength(1);
	});

	it("closes without disturbing the cell the last match selected", () => {
		load(tableOf([["city"], ["Rio"], ["Madrid"]]));
		search("Madrid");
		const reached = focusedCell();

		useTabeloStore.getState().closeFind();

		expect(useTabeloStore.getState().find).toBeNull();
		expect(focusedCell()).toEqual(reached);
	});

	it("turns every matching cell into one selected area each", () => {
		load(
			tableOf([
				["city", "home"],
				["Rio", "Rio"],
				["Madrid", "Rio"],
			]),
		);
		search("Rio");

		expect(useTabeloStore.getState().selectAllMatches()).toBe(3);

		const selection = useTabeloStore.getState().selection;
		expect(selection.ranges).toHaveLength(3);
		// The cell the bar was on stays the one the keyboard works from.
		expect(activeRange(selection).focus).toEqual({ row: 0, column: 0 });
	});

	it("counts a cell once however many times it matches", () => {
		load(tableOf([["count"], ["aaa"]]));
		search("a", true);
		expect(find().matches).toHaveLength(3);

		expect(useTabeloStore.getState().selectAllMatches()).toBe(1);
		expect(useTabeloStore.getState().selection.ranges).toHaveLength(1);
	});

	it("never reaches the document, history, or the copied mark", () => {
		load(tableOf([["city"], ["Rio"]]));
		const before = useTabeloStore.getState();
		const history = before.past.length;

		search("Rio");
		useTabeloStore.getState().stepFindMatch(1);

		const after = useTabeloStore.getState();
		expect(after.document).toBe(before.document);
		expect(after.past.length).toBe(history);
	});
});

describe("replacing from the find bar", () => {
	it("replaces one occurrence as one history step and resumes past it", () => {
		load(tableOf([["city"], ["Rio"], ["Rio"]]));
		search("Rio");
		useTabeloStore.getState().setFindReplacement("Lisbon");
		const history = useTabeloStore.getState().past.length;

		expect(useTabeloStore.getState().replaceCurrentMatch()).toBe(true);

		expect(valueAt(0, 0)).toBe("Lisbon");
		expect(valueAt(1, 0)).toBe("Rio");
		expect(useTabeloStore.getState().past.length).toBe(history + 1);
		// The one remaining occurrence, which is where the next Replace acts.
		expect(find().matches).toHaveLength(1);
		expect(currentMatch(find())?.row).toBe(1);
	});

	it("does not press Replace back on top of what it just wrote", () => {
		load(tableOf([["count"], ["aa"]]));
		search("a", true);
		useTabeloStore.getState().setFindReplacement("aa");

		useTabeloStore.getState().replaceCurrentMatch();
		useTabeloStore.getState().replaceCurrentMatch();

		// Two occurrences, two replacements, each one consuming an original
		// character. Resuming past the text just written is what keeps the
		// second Replace off the first one's output.
		expect(valueAt(0, 0)).toBe("aaaa");

		// A third wraps to the beginning, exactly as stepping past the last
		// match does, rather than refusing.
		useTabeloStore.getState().replaceCurrentMatch();
		expect(currentMatch(find())?.start).toBe(2);
	});

	it("replaces every occurrence as exactly one undo step", () => {
		const before = tableOf([
			["city", "home"],
			["Rio", "Rio"],
			["Madrid", "Rio"],
		]);
		load(before);
		search("Rio");
		useTabeloStore.getState().setFindReplacement("Lisbon");
		const history = useTabeloStore.getState().past.length;

		expect(useTabeloStore.getState().replaceAllMatches()).toBe(3);

		expect(useTabeloStore.getState().past.length).toBe(history + 1);
		expect(valueAt(0, 0)).toBe("Lisbon");
		expect(valueAt(0, 1)).toBe("Lisbon");
		expect(valueAt(1, 1)).toBe("Lisbon");

		useTabeloStore.getState().undo();
		expect(useTabeloStore.getState().document).toBe(before);
	});

	it("replaces inside a header cell too", () => {
		load(tableOf([["city"], ["Rio"]]));
		search("city");
		useTabeloStore.getState().setFindReplacement("town");
		useTabeloStore.getState().replaceAllMatches();

		expect(useTabeloStore.getState().document.columns[0]?.header).toBe("town");
	});

	it("writes a replaced native value back as a string", () => {
		load(tableOf(samplePeopleMatrix(1)));
		search("35");
		useTabeloStore.getState().setFindReplacement("36");
		useTabeloStore.getState().replaceAllMatches();

		const document = useTabeloStore.getState().document;
		const row = document.rows[0];
		const column = document.columns[document.columns.length - 1];

		expect(row && column && readCell(row, column.id)).toBe("36");
	});

	it("replaces nothing when there is nothing to replace", () => {
		load(tableOf([["city"], ["Rio"]]));
		search("Lisbon");

		expect(useTabeloStore.getState().replaceAllMatches()).toBe(0);
		expect(useTabeloStore.getState().replaceCurrentMatch()).toBe(false);
	});
});
