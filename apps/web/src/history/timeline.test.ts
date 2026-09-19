import { describe, expect, it } from "vitest";
import { documentFromMatrix } from "@/core/document";
import { deleteColumns, setCell } from "@/core/operations";
import { samplePeopleMatrix } from "@/core/sample-data";
import { createSelection } from "@/core/selection";
import type { TableDocument } from "@/core/types";
import type { Draft } from "@/state/store";
import { createDefaultWorkspace } from "@/workspace/layout";
import {
	findTimelineStep,
	HISTORY_LIMIT,
	type HistoryEntry,
	pushHistory,
	recordStep,
	snapshotOf,
	stepTimeline,
	type TimelineState,
	walkTimeline,
	workspaceForEntry,
} from "./timeline";

const workspace = createDefaultWorkspace();
const base = documentFromMatrix(samplePeopleMatrix(2), { headerRow: true });

function edited(document: TableDocument, value: string): TableDocument {
	return setCell(document, 0, 0, value);
}

function draft(paneId: string, status: Draft["status"] = "clean"): Draft {
	return {
		paneId,
		viewId: "markdown",
		text: "",
		status,
		issues: [],
		warnings: [],
		rows: [],
	};
}

function entry(document: TableDocument, owner: Draft | null): HistoryEntry {
	return snapshotOf({ document, draft: owner, workspace });
}

function state(
	document: TableDocument,
	past: readonly HistoryEntry[] = [],
	future: readonly HistoryEntry[] = [],
): TimelineState {
	return { document, draft: null, workspace, past, future };
}

describe("document timeline", () => {
	it("records a draft still in its grace period as visibly invalid", () => {
		const snapshot = snapshotOf({
			document: base,
			draft: draft("pane", "invalid-grace"),
			workspace,
		});
		expect(snapshot.draft?.status).toBe("invalid");
	});

	it("keeps only the most recent steps once the limit is reached", () => {
		let past: readonly HistoryEntry[] = [];
		const documents = Array.from({ length: HISTORY_LIMIT + 5 }, (_, index) =>
			edited(base, `Step ${index}`),
		);
		for (const document of documents) {
			past = pushHistory(past, entry(document, null));
		}
		expect(past).toHaveLength(HISTORY_LIMIT);
		expect(past[0]?.document).toBe(documents[5]);
		expect(past.at(-1)?.document).toBe(documents.at(-1));
	});

	it("clears redo when a step is recorded", () => {
		const next = recordStep(state(base, [], [entry(edited(base, "x"), null)]));
		expect(next.future).toEqual([]);
		expect(next.past.at(-1)?.document).toBe(base);
	});

	it("moves the selection pair with the transition in both directions", () => {
		const restore = {
			before: createSelection({ row: 0, column: 0 }),
			after: createSelection({ row: 1, column: 0 }),
		};
		const sorted = edited(base, "sorted");
		const past = recordStep(state(base), restore).past;
		const undone = stepTimeline(state(sorted, past), "undo");
		expect(undone?.target.selectionRestore).toBe(restore);
		expect(undone?.timeline.document).toBe(base);
		expect(undone?.timeline.future[0]?.selectionRestore).toBe(restore);

		const redone = stepTimeline(
			state(base, undone?.timeline.past, undone?.timeline.future),
			"redo",
		);
		expect(redone?.timeline.document).toBe(sorted);
		expect(redone?.timeline.past.at(-1)?.selectionRestore).toBe(restore);
		expect(stepTimeline(state(base), "undo")).toBeNull();
	});

	it("finds a matching state across this pane's own steps only", () => {
		const first = edited(base, "a");
		const second = edited(base, "ab");
		const own = draft("markdown-pane");
		const nearestFirst = [entry(second, own), entry(first, own)];
		const owner = { paneId: "markdown-pane", viewId: "markdown" } as const;
		const reconciliation = {
			cellValues: "text",
			columnAlignment: "carried",
			inlineContent: "carried",
		} as const;

		expect(findTimelineStep(nearestFirst, first, reconciliation, owner)).toBe(
			1,
		);
		const foreign = [entry(second, null), entry(first, own)];
		expect(findTimelineStep(foreign, first, reconciliation, owner)).toBeNull();
	});

	it("walks across several steps and keeps every one of them", () => {
		const one = edited(base, "1");
		const two = edited(base, "2");
		const three = edited(base, "3");
		const walked = walkTimeline(
			state(three, [entry(one, null), entry(two, null)]),
			"undo",
			1,
		);
		expect(walked?.timeline.document).toBe(one);
		expect(walked?.timeline.past).toEqual([]);
		expect(walked?.timeline.future.map((step) => step.document)).toEqual([
			two,
			three,
		]);

		const back = walkTimeline(
			state(one, walked?.timeline.past, walked?.timeline.future),
			"redo",
			1,
		);
		expect(back?.timeline.document).toBe(three);
		expect(back?.timeline.past.map((step) => step.document)).toEqual([
			one,
			two,
		]);
	});

	it("brings a returning column back with the preferences it left with", () => {
		const column = base.columns[1];
		if (!column) throw new Error("fixture has no second column");
		const withPreferences = {
			...workspace,
			columnWidths: { [column.id]: 20 },
			wrappedColumns: [column.id],
		};
		const saved = snapshotOf({
			document: base,
			draft: null,
			workspace: withPreferences,
		});
		const removed = deleteColumns(base, [1]);
		const restored = workspaceForEntry(workspace, removed, saved);
		expect(restored.columnWidths[column.id]).toBe(20);
		expect(restored.wrappedColumns).toContain(column.id);
	});
});
