// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
const invalidMarkdown = "| Name |\n| not a divider |\n| Inez |";
const validMarkdown = "| Name |\n| --- |\n| Inez |";

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

// The workspace opens with the grid beside Markdown, so this is the pane a
// source draft can be typed into.
function markdownPaneId(): string {
	const pane = workspace().panes.find(
		(candidate) => candidate.view === "markdown",
	);
	return pane?.id ?? "";
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

function addedPaneId(before: readonly { id: string }[]): string {
	const added = workspace().panes.find(
		(pane) => !before.some((candidate) => candidate.id === pane.id),
	);
	return added?.id ?? "";
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
		const option = splitOptions(workspace())[0];
		useTabeloStore.getState().addPaneBySplit(option, "csv");
		expect(workspace().layout).toBe(option.layout);
	});

	it("splits either pane of a two-pane preset to its own preset", () => {
		const options = splitOptions(workspace());
		expect(options).toHaveLength(2);
		expect(options[0].layout).not.toBe(options[1].layout);

		useTabeloStore.getState().addPaneBySplit(options[1], "csv");
		expect(workspace().layout).toBe(options[1].layout);
	});

	it("refuses an option that no longer describes the workspace", () => {
		const stale = splitOptions(workspace())[0];
		useTabeloStore.getState().addPaneBySplit(stale, "csv");

		const settled = workspace();
		// Replaying it would apply a split to a shape it never described.
		useTabeloStore.getState().addPaneBySplit(stale, "jira");
		expect(workspace()).toBe(settled);
	});

	it("keeps every existing pane's view untouched", () => {
		const before = workspace().panes.map((pane) => [pane.id, pane.view]);

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
		useTabeloStore.getState().setDraft(paneId, "markdown", "Name\nInez");

		addFirstSplit();

		expect(useTabeloStore.getState().draft?.paneId).toBe(paneId);
		expect(workspace().panes.some((pane) => pane.id === paneId)).toBe(true);
	});

	it("shows exactly the view that was chosen for it", () => {
		const before = workspace();

		addFirstSplit("html-preview");

		const added = workspace().panes.find(
			(pane) => pane.id === addedPaneId(before.panes),
		);
		expect(added?.view).toBe("html-preview");
		expect(before.panes.map((pane) => pane.view)).not.toContain(added?.view);
	});
});

describe("closing a view", () => {
	it("removes that pane and keeps the others", () => {
		addFirstSplit();
		const before = workspace();
		const target = before.panes[1];

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

			useTabeloStore.getState().closePane(twoPanes.panes[0].id);

			const after = workspace();
			expect(after.layout).toBe("single");
			expect(after.panes).toHaveLength(1);
			expect(after.panes[0].id).toBe(twoPanes.panes[1].id);
			expect(after.panes[0].view).toBe(twoPanes.panes[1].view);
			expect(after.activePaneId).toBe(after.panes[0].id);
		},
	);

	it("does nothing at one pane, which is the floor", () => {
		useTabeloStore.getState().setLayout("single");
		const onePane = workspace();
		expect(onePane.panes).toHaveLength(1);

		useTabeloStore.getState().closePane(onePane.panes[0].id);

		expect(workspace()).toBe(onePane);
	});

	it("moves the active pane when the active one is closed", () => {
		addFirstSplit();
		const before = workspace();
		useTabeloStore.getState().setActivePane(before.panes[0].id);

		useTabeloStore.getState().closePane(before.panes[0].id);

		const after = workspace();
		expect(after.activePaneId).toBe(after.panes[0].id);
		expect(after.panes.some((pane) => pane.id === before.panes[0].id)).toBe(
			false,
		);
	});

	it("is reversible: every pane count from one to four is reachable again", () => {
		const store = useTabeloStore.getState();
		store.setLayout("single");
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

		useTabeloStore.getState().setPaneZoom(first.id, 1.2);

		const panes = workspace().panes;
		expect(panes.find((pane) => pane.id === first.id)?.zoom).toBe(1.2);
		expect(panes.find((pane) => pane.id === second.id)?.zoom).toBe(
			DEFAULT_PANE_ZOOM,
		);
	});

	it("clamps a value outside the ladder", () => {
		const paneId = workspace().panes[0].id;

		useTabeloStore.getState().setPaneZoom(paneId, 40);
		expect(workspace().panes[0].zoom).toBe(MAX_PANE_ZOOM);

		useTabeloStore.getState().setPaneZoom(paneId, 0);
		expect(workspace().panes[0].zoom).toBe(MIN_PANE_ZOOM);
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

		useTabeloStore.getState().setLayout("quad");

		expect(workspace().panes.find((pane) => pane.id === paneId)?.zoom).toBe(
			0.5,
		);
	});

	it("does not leak into a pane added afterwards", () => {
		const paneId = workspace().panes[0].id;
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
		const paneId = before.workspace.panes[0].id;

		useTabeloStore.getState().setPaneZoom(paneId, 1.2);

		const after = useTabeloStore.getState();
		expect(after.past).toBe(before.past);
		expect(after.document).toBe(before.document);
	});
});
