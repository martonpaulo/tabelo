// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HEADER_ROW } from "@/core/selection";
import type { ViewId } from "@/views/types";
import { paneCount, splitOptions } from "@/workspace/layout";
import {
	DEFAULT_PANE_ZOOM,
	MAX_PANE_ZOOM,
	MIN_PANE_ZOOM,
} from "@/workspace/zoom";
import { conditionNoticeIds } from "./notice-queue";
import { useTabeloStore } from "./store";

// Adding a view splits a pane along one of its edges, and closing one shrinks
// back. What matters here is that neither can reach a shape no preset expresses,
// and that neither loses work on the way.

const initialState = useTabeloStore.getInitialState();
const invalidMarkdown = "| Name |\n| not a divider |\n| Ingrid |";
const validMarkdown = "| Name |\n| --- |\n| Ingrid |";

beforeEach(() => {
	useTabeloStore.getState().discardDraft();
	useTabeloStore.setState(initialState, true);
});

afterEach(() => {
	useTabeloStore.getState().discardDraft();
});

function workspace() {
	return useTabeloStore.getState().workspace;
}

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("Expected test fixture value.");
	return value;
}

// The workspace opens with the grid beside Markdown, so this is the pane a
// source draft can be typed into.
function markdownPaneId(): string {
	const pane = workspace().panes.find(
		(candidate) => candidate.view === "markdown",
	);
	return required(pane).id;
}

// The first split the current workspace offers. Which one it is does not matter
// to these tests; that it applies the preset and the chosen view in one update
// does.
function addFirstSplit(view: ViewId = "csv"): void {
	const store = useTabeloStore.getState();
	const option = splitOptions(store.workspace)[0];
	if (!option) return;
	store.addPaneBySplit(option, view);
}

// Closing is the only way down to one pane: Layout rearranges the panes that
// are open and never removes one.
function closeDownToOnePane(): void {
	while (workspace().panes.length > 1) {
		const store = useTabeloStore.getState();
		store.closePane(required(store.workspace.panes.at(-1)).id);
	}
}

function addedPaneId(before: readonly { id: string }[]): string {
	const added = workspace().panes.find(
		(pane) => !before.some((candidate) => candidate.id === pane.id),
	);
	return required(added).id;
}

describe("adding a view", () => {
	it("appends a pane showing the chosen view and makes it active", () => {
		const before = workspace();

		addFirstSplit("jira");

		const after = workspace();
		expect(after.panes).toHaveLength(before.panes.length + 1);
		const added = addedPaneId(before.panes);
		expect(added).not.toBe("");
		expect(after.activePaneId).toBe(added);
		// The view was chosen before anything moved, so it is already in place.
		expect(after.panes.find((pane) => pane.id === added)?.view).toBe("jira");
	});

	it("applies the preset the option names", () => {
		const option = required(splitOptions(workspace())[0]);
		useTabeloStore.getState().addPaneBySplit(option, "csv");
		expect(workspace().layout).toBe(option.layout);
	});

	it("splits either pane of a two-pane preset to its own preset", () => {
		const options = splitOptions(workspace());
		expect(options).toHaveLength(2);
		const first = required(options[0]);
		const second = required(options[1]);
		expect(first.layout).not.toBe(second.layout);

		useTabeloStore.getState().addPaneBySplit(second, "csv");
		expect(workspace().layout).toBe(second.layout);
	});

	it("refuses an option that no longer describes the workspace", () => {
		const stale = required(splitOptions(workspace())[0]);
		useTabeloStore.getState().addPaneBySplit(stale, "csv");

		const settled = workspace();
		// Replaying it would apply a split to a shape it never described.
		useTabeloStore.getState().addPaneBySplit(stale, "jira");
		expect(workspace()).toBe(settled);
	});

	it("keeps every existing pane's view untouched", () => {
		const before = workspace().panes.map(
			(pane) => [pane.id, pane.view] as const,
		);

		addFirstSplit();

		const after = new Map(
			workspace().panes.map((pane) => [pane.id, pane.view]),
		);
		for (const [id, view] of before) expect(after.get(id)).toBe(view);
	});

	it("reaches four panes and then offers no further split", () => {
		addFirstSplit("csv");
		addFirstSplit("jira");
		expect(workspace().panes).toHaveLength(4);
		expect(paneCount(workspace().layout)).toBe(4);

		// The floor and the ceiling are both expressed by the absence of an
		// option rather than by a guard inside the action.
		expect(splitOptions(workspace())).toEqual([]);
	});

	it("never leaves the workspace in a layout no preset expresses", () => {
		for (let step = 0; step < 3; step += 1) {
			addFirstSplit();
			expect(workspace().panes).toHaveLength(paneCount(workspace().layout));
		}
	});

	it("does not disturb a pending draft in another pane", () => {
		const paneId = markdownPaneId();
		useTabeloStore.getState().setDraft(paneId, "markdown", "Name\nIngrid");

		addFirstSplit();

		expect(useTabeloStore.getState().draft?.paneId).toBe(paneId);
		expect(workspace().panes.some((pane) => pane.id === paneId)).toBe(true);
	});
});

describe("closing a view", () => {
	it("removes that pane and keeps the others", () => {
		addFirstSplit();
		const before = workspace();
		const target = required(before.panes[1]);

		useTabeloStore.getState().closePane(target.id);

		const after = workspace();
		expect(after.panes).toHaveLength(before.panes.length - 1);
		expect(after.panes.some((pane) => pane.id === target.id)).toBe(false);
		for (const pane of before.panes) {
			if (pane.id === target.id) continue;
			expect(
				after.panes.find((candidate) => candidate.id === pane.id)?.view,
			).toBe(pane.view);
		}
	});

	// Both two-pane presets shrink to the same one-pane preset, so neither
	// depends on which one the default workspace happens to use.
	it.each(["columns", "rows"] as const)(
		"leaves the surviving view alone at %s",
		(layout) => {
			useTabeloStore.getState().setLayout(layout);
			const twoPanes = workspace();
			expect(twoPanes.panes).toHaveLength(2);
			const first = required(twoPanes.panes[0]);
			const second = required(twoPanes.panes[1]);

			useTabeloStore.getState().closePane(first.id);

			const after = workspace();
			const survivor = required(after.panes[0]);
			expect(after.layout).toBe("single");
			expect(after.panes).toHaveLength(1);
			expect(survivor.id).toBe(second.id);
			expect(survivor.view).toBe(second.view);
			expect(after.activePaneId).toBe(survivor.id);
		},
	);

	it("does nothing at one pane, which is the floor", () => {
		closeDownToOnePane();
		const onePane = workspace();
		expect(onePane.panes).toHaveLength(1);

		useTabeloStore.getState().closePane(required(onePane.panes[0]).id);

		expect(workspace()).toBe(onePane);
	});

	it("moves the active pane when the active one is closed", () => {
		addFirstSplit();
		const before = workspace();
		const active = required(before.panes[0]);
		useTabeloStore.getState().setActivePane(active.id);

		useTabeloStore.getState().closePane(active.id);

		const after = workspace();
		expect(after.activePaneId).toBe(required(after.panes[0]).id);
		expect(after.panes.some((pane) => pane.id === active.id)).toBe(false);
	});

	it("is reversible: every pane count from one to four is reachable again", () => {
		const store = useTabeloStore.getState();
		closeDownToOnePane();
		const counts: number[] = [workspace().panes.length];
		while (workspace().panes.length < 4) {
			addFirstSplit();
			counts.push(workspace().panes.length);
		}
		while (workspace().panes.length > 1) {
			store.closePane(workspace().panes.at(-1)?.id ?? "");
			counts.push(workspace().panes.length);
		}
		expect(counts).toEqual([1, 2, 3, 4, 3, 2, 1]);
	});
});

// Layout answers how the open panes are arranged. Growing and closing are their
// own commands, so no arrangement may add or remove a pane behind the choice.
describe("rearranging at a fixed pane count", () => {
	it("swaps two panes between the arrangements of their count", () => {
		const before = workspace();
		expect(before.panes).toHaveLength(2);
		expect(before.layout).toBe("columns");

		useTabeloStore.getState().setLayout("rows");

		const after = workspace();
		expect(after.layout).toBe("rows");
		expect(after.panes).toHaveLength(2);
		expect(after.panes.map((pane) => pane.id)).toEqual(
			before.panes.map((pane) => pane.id),
		);
		expect(after.panes.map((pane) => pane.view)).toEqual(
			before.panes.map((pane) => pane.view),
		);
		expect(after.activePaneId).toBe(before.activePaneId);
	});

	it.each(["single", "left-split", "quad"] as const)(
		"refuses %s from a two-pane workspace",
		(layout) => {
			const before = workspace();
			expect(before.panes).toHaveLength(2);

			useTabeloStore.getState().setLayout(layout);

			expect(workspace()).toBe(before);
		},
	);

	it("refuses a two-pane arrangement once a third pane is open", () => {
		addFirstSplit();
		const before = workspace();
		expect(before.panes).toHaveLength(3);

		useTabeloStore.getState().setLayout("columns");

		expect(workspace()).toBe(before);
	});

	it("reaches the arrangements growing alone cannot", () => {
		// A split preserves the divider the current preset already has, so three
		// panes are only ever reached as a left or right split from two columns.
		// The other two are the picker's job, and the reason it exists.
		addFirstSplit();
		expect(workspace().layout).toBe("left-split");

		useTabeloStore.getState().setLayout("top-split");

		const after = workspace();
		expect(after.layout).toBe("top-split");
		expect(after.panes).toHaveLength(3);
	});

	it("carries every per-pane preference across a rearrangement", () => {
		addFirstSplit();
		const before = workspace();
		const target = required(before.panes[0]);
		const store = useTabeloStore.getState();
		store.setPaneZoom(target.id, 1.3);
		store.setPaneWrap(target.id, true);
		store.setActivePane(target.id);

		useTabeloStore.getState().setLayout("bottom-split");

		const after = workspace();
		expect(after.layout).toBe("bottom-split");
		expect(after.activePaneId).toBe(target.id);
		const moved = after.panes.find((pane) => pane.id === target.id);
		expect(moved?.view).toBe(target.view);
		expect(moved?.zoom).toBe(1.3);
		expect(moved?.wrap).toBe(true);
	});
});

describe("column wrapping preference", () => {
	it("uses stable ids, stays outside history, and prunes deleted columns", () => {
		const before = useTabeloStore.getState();
		const target = before.document.columns[0];
		expect(target).toBeDefined();
		if (!target) return;

		before.toggleColumnWrap(target.id);
		let current = useTabeloStore.getState();
		expect(current.workspace.wrappedColumns).toEqual([target.id]);
		expect(current.document).toBe(before.document);
		expect(current.past).toBe(before.past);

		current.applyDocument({
			...current.document,
			columns: [...current.document.columns].reverse(),
		});
		current = useTabeloStore.getState();
		expect(current.workspace.wrappedColumns).toContain(target.id);

		current.applyDocument({
			...current.document,
			columns: current.document.columns.filter(
				(column) => column.id !== target.id,
			),
		});
		expect(useTabeloStore.getState().workspace.wrappedColumns).not.toContain(
			target.id,
		);
	});
});

describe("pinned axis preferences", () => {
	it("starts unpinned on both axes", () => {
		expect(workspace().pinFirstDataRow).toBe(false);
		expect(workspace().pinFirstDataColumn).toBe(false);
	});

	it.each(["row", "column"] as const)(
		"pins the first data %s without touching the document or history",
		(axis) => {
			const before = useTabeloStore.getState();
			const key = axis === "row" ? "pinFirstDataRow" : "pinFirstDataColumn";
			const other = axis === "row" ? "pinFirstDataColumn" : "pinFirstDataRow";

			before.setPinnedAxis(axis, true);

			let current = useTabeloStore.getState();
			expect(current.workspace[key]).toBe(true);
			// The axes are independent: pinning one says nothing about the other.
			expect(current.workspace[other]).toBe(false);
			expect(current.document).toBe(before.document);
			expect(current.past).toBe(before.past);
			expect(current.future).toBe(before.future);

			current.setPinnedAxis(axis, false);
			current = useTabeloStore.getState();
			expect(current.workspace[key]).toBe(false);
			expect(current.past).toBe(before.past);
		},
	);

	it("keeps the preference through a document that is too small to pin", () => {
		const store = useTabeloStore.getState();
		store.setPinnedAxis("row", true);
		store.setPinnedAxis("column", true);

		const current = useTabeloStore.getState();
		current.applyDocument({
			columns: [required(current.document.columns[0])],
			rows: [required(current.document.rows[0])],
		});

		const after = workspace();
		expect(after.pinFirstDataRow).toBe(true);
		expect(after.pinFirstDataColumn).toBe(true);
	});

	it("does not replace the workspace when the value is unchanged", () => {
		const before = workspace();

		useTabeloStore.getState().setPinnedAxis("row", false);

		expect(workspace()).toBe(before);
	});
});

describe("column width preference", () => {
	it("uses stable ids, stays outside history, and prunes deleted columns", () => {
		const before = useTabeloStore.getState();
		const target = before.document.columns[0];
		expect(target).toBeDefined();
		if (!target) return;

		before.resizeColumn(0, 18);
		let current = useTabeloStore.getState();
		expect(current.workspace.columnWidths).toEqual({ [target.id]: 18 });
		expect(current.document).toBe(before.document);
		expect(current.past).toBe(before.past);

		current.applyDocument({
			...current.document,
			columns: [...current.document.columns].reverse(),
		});
		current = useTabeloStore.getState();
		expect(current.workspace.columnWidths[target.id]).toBe(18);

		current.applyDocument({
			...current.document,
			columns: current.document.columns.filter(
				(column) => column.id !== target.id,
			),
		});
		expect(useTabeloStore.getState().workspace.columnWidths[target.id]).toBe(
			undefined,
		);
	});

	it("copies a source width to each newly duplicated column id", () => {
		const before = useTabeloStore.getState();
		const source = before.document.columns[0];
		expect(source).toBeDefined();
		if (!source) return;

		before.resizeColumn(0, 18);
		before.selectCell({ row: HEADER_ROW, column: 0 }, "column");
		before.duplicateSelectedColumns();

		const current = useTabeloStore.getState();
		const duplicate = current.document.columns[1];
		expect(duplicate?.id).not.toBe(source.id);
		expect(current.workspace.columnWidths[source.id]).toBe(18);
		expect(current.workspace.columnWidths[duplicate?.id ?? ""]).toBe(18);
	});

	it("drops obsolete ids when import and New table replace the document", () => {
		const store = useTabeloStore.getState();
		const originalId = store.document.columns[0]?.id ?? "";
		store.resizeColumn(0, 18);

		store.importText(
			"| Name | Role |\n| --- | --- |\n| Ingrid | Designer |",
			"markdown",
		);
		let current = useTabeloStore.getState();
		expect(current.workspace.columnWidths[originalId]).toBeUndefined();
		const importedId = current.document.columns[0]?.id ?? "";
		current.resizeColumn(0, 15);

		current.resetDocument();
		current = useTabeloStore.getState();
		expect(current.workspace.columnWidths[importedId]).toBeUndefined();
	});
});

describe("closing a view that owns a draft", () => {
	it("asks before discarding text the document has not read back", () => {
		addFirstSplit();
		const paneId = markdownPaneId();
		useTabeloStore.getState().setDraft(paneId, "markdown", invalidMarkdown);
		const before = workspace();

		useTabeloStore.getState().closePane(paneId);

		expect(workspace()).toBe(before);
		expect(useTabeloStore.getState().pendingPaneAction).toEqual({
			kind: "close",
			paneId,
		});
		expect(useTabeloStore.getState().draft?.text).toBe(invalidMarkdown);
	});

	it("closes the pane once the discard is confirmed", () => {
		addFirstSplit();
		const paneId = markdownPaneId();
		useTabeloStore.getState().setDraft(paneId, "markdown", invalidMarkdown);
		useTabeloStore.getState().closePane(paneId);

		useTabeloStore.getState().confirmPaneAction();

		expect(workspace().panes.some((pane) => pane.id === paneId)).toBe(false);
		expect(useTabeloStore.getState().draft).toBeNull();
		expect(useTabeloStore.getState().pendingPaneAction).toBeNull();
	});

	it("keeps the pane when the question is dismissed instead of answered", () => {
		addFirstSplit();
		const paneId = markdownPaneId();
		useTabeloStore.getState().setDraft(paneId, "markdown", invalidMarkdown);
		useTabeloStore.getState().closePane(paneId);

		useTabeloStore
			.getState()
			.dismissNotice(conditionNoticeIds.pendingPaneAction);

		expect(workspace().panes.some((pane) => pane.id === paneId)).toBe(true);
		expect(useTabeloStore.getState().draft?.text).toBe(invalidMarkdown);
		expect(useTabeloStore.getState().pendingPaneAction).toBeNull();
	});

	it("closes straight away when the draft is already committed", () => {
		addFirstSplit();
		const paneId = markdownPaneId();
		useTabeloStore.getState().setDraft(paneId, "markdown", validMarkdown);

		useTabeloStore.getState().closePane(paneId);

		expect(useTabeloStore.getState().pendingPaneAction).toBeNull();
		expect(workspace().panes.some((pane) => pane.id === paneId)).toBe(false);
		expect(useTabeloStore.getState().draft).toBeNull();
		// The committed content survives, because it was never only in the draft.
		expect(useTabeloStore.getState().document.columns[0]?.header).toBe("Name");
	});

	it("keeps a draft owned by a different pane", () => {
		addFirstSplit();
		const paneId = markdownPaneId();
		useTabeloStore.getState().setDraft(paneId, "markdown", invalidMarkdown);
		const other = workspace().panes.find((pane) => pane.id !== paneId);

		useTabeloStore.getState().closePane(other?.id ?? "");

		expect(useTabeloStore.getState().draft?.text).toBe(invalidMarkdown);
		expect(useTabeloStore.getState().pendingPaneAction).toBeNull();
	});
});

describe("per-pane zoom", () => {
	it("starts every pane at the default", () => {
		expect(
			workspace().panes.every((pane) => pane.zoom === DEFAULT_PANE_ZOOM),
		).toBe(true);
	});

	it("scales only the pane it was set on", () => {
		const [first, second] = workspace().panes;
		const firstPane = required(first);
		const secondPane = required(second);

		useTabeloStore.getState().setPaneZoom(firstPane.id, 1.2);

		const panes = workspace().panes;
		expect(panes.find((pane) => pane.id === firstPane.id)?.zoom).toBe(1.2);
		expect(panes.find((pane) => pane.id === secondPane.id)?.zoom).toBe(
			DEFAULT_PANE_ZOOM,
		);
	});

	it("clamps a value outside the ladder", () => {
		const paneId = required(workspace().panes[0]).id;

		useTabeloStore.getState().setPaneZoom(paneId, 40);
		expect(required(workspace().panes[0]).zoom).toBe(MAX_PANE_ZOOM);

		useTabeloStore.getState().setPaneZoom(paneId, 0);
		expect(required(workspace().panes[0]).zoom).toBe(MIN_PANE_ZOOM);
	});

	it("belongs to the pane, so it survives a view change", () => {
		const paneId = markdownPaneId();
		useTabeloStore.getState().setPaneZoom(paneId, 1.3);

		useTabeloStore.getState().setPaneView(paneId, "jira");

		expect(workspace().panes.find((pane) => pane.id === paneId)?.zoom).toBe(
			1.3,
		);
	});

	it("follows its pane across a layout change", () => {
		const paneId = markdownPaneId();
		useTabeloStore.getState().setPaneZoom(paneId, 0.5);

		useTabeloStore.getState().setLayout("rows");

		expect(workspace().panes.find((pane) => pane.id === paneId)?.zoom).toBe(
			0.5,
		);
	});

	it("does not leak into a pane added afterwards", () => {
		const paneId = required(workspace().panes[0]).id;
		useTabeloStore.getState().setPaneZoom(paneId, 2);

		addFirstSplit();

		const added = workspace().panes.at(-1);
		expect(added?.zoom).toBe(DEFAULT_PANE_ZOOM);
	});

	it("goes away with the pane rather than transferring to a survivor", () => {
		addFirstSplit();
		const target = workspace().panes.at(-1);
		useTabeloStore.getState().setPaneZoom(target?.id ?? "", 1.4);

		useTabeloStore.getState().closePane(target?.id ?? "");

		expect(
			workspace().panes.every((pane) => pane.zoom === DEFAULT_PANE_ZOOM),
		).toBe(true);
	});

	it("is presentation, so it never becomes an undo step", () => {
		const before = useTabeloStore.getState();
		const paneId = required(before.workspace.panes[0]).id;

		useTabeloStore.getState().setPaneZoom(paneId, 1.2);

		const after = useTabeloStore.getState();
		expect(after.past).toBe(before.past);
		expect(after.document).toBe(before.document);
	});
});

describe("per-pane source wrapping", () => {
	it("stays with its pane, outside history, and defaults off for new panes", () => {
		const before = useTabeloStore.getState();
		const paneId = markdownPaneId();
		const otherPaneId = before.workspace.panes.find(
			(pane) => pane.id !== paneId,
		)?.id;

		before.setPaneWrap(paneId, true);
		let current = useTabeloStore.getState();
		expect(
			current.workspace.panes.find((pane) => pane.id === paneId)?.wrap,
		).toBe(true);
		expect(
			current.workspace.panes.find((pane) => pane.id === otherPaneId)?.wrap,
		).toBe(false);
		expect(current.document).toBe(before.document);
		expect(current.past).toBe(before.past);

		current.setPaneView(paneId, "jira");
		current.setLayout("rows");
		current = useTabeloStore.getState();
		expect(
			current.workspace.panes.find((pane) => pane.id === paneId)?.wrap,
		).toBe(true);

		addFirstSplit();
		current = useTabeloStore.getState();
		expect(
			current.workspace.panes.find(
				(pane) => pane.id !== paneId && pane.id !== otherPaneId,
			)?.wrap,
		).toBe(false);
	});
});

describe("moving panes", () => {
	it("moves pane-owned state without touching the document timeline", () => {
		const initial = useTabeloStore.getState();
		const paneId = markdownPaneId();
		const destinationId = initial.workspace.panes.find(
			(pane) => pane.id !== paneId,
		)?.id;
		expect(destinationId).toBeDefined();

		initial.setPaneZoom(paneId, 1.4);
		initial.setPaneWrap(paneId, true);
		initial.setDraft(paneId, "markdown", invalidMarkdown);
		const before = useTabeloStore.getState();
		const sourceSlots = before.workspace.panes.find(
			(pane) => pane.id === paneId,
		)?.slots;
		const destinationSlots = before.workspace.panes.find(
			(pane) => pane.id === destinationId,
		)?.slots;

		expect(before.movePane(paneId, destinationId ?? "")).toBe(true);

		const after = useTabeloStore.getState();
		const moved = after.workspace.panes.find((pane) => pane.id === paneId);
		expect(moved).toMatchObject({
			id: paneId,
			view: "markdown",
			zoom: 1.4,
			wrap: true,
			slots: destinationSlots,
		});
		expect(
			after.workspace.panes.find((pane) => pane.id === destinationId)?.slots,
		).toBe(sourceSlots);
		expect(after.workspace.activePaneId).toBe(paneId);
		expect(after.draft).toBe(before.draft);
		expect(after.document).toBe(before.document);
		expect(after.past).toBe(before.past);
		expect(after.future).toBe(before.future);
	});

	it("refuses a stale destination without changing state", () => {
		const before = useTabeloStore.getState();
		const paneId = required(before.workspace.panes[0]).id;

		expect(before.movePane(paneId, "missing-pane")).toBe(false);
		expect(useTabeloStore.getState()).toBe(before);
	});
});
