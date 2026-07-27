// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { paneCount } from "@/workspace/layout";
import { useTabeloStore } from "./store";

// Adding and closing a view are the direct route to the same presets the
// layout gallery offers. What matters here is that the direct route cannot
// reach a shape the gallery cannot, and cannot lose work on the way.

const initialState = useTabeloStore.getInitialState();
const invalidMarkdown = "| Name |\n| not a divider |\n| Ana |";
const validMarkdown = "| Name |\n| --- |\n| Ana |";

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

function addedPaneId(before: readonly { id: string }[]): string {
	const added = workspace().panes.find(
		(pane) => !before.some((candidate) => candidate.id === pane.id),
	);
	return added?.id ?? "";
}

describe("adding a view", () => {
	it("appends a pane, makes it active, and offers its menu the focus", () => {
		const before = workspace();

		useTabeloStore.getState().addPane();

		const after = workspace();
		expect(after.panes).toHaveLength(before.panes.length + 1);
		const added = addedPaneId(before.panes);
		expect(added).not.toBe("");
		expect(after.activePaneId).toBe(added);
		expect(useTabeloStore.getState().paneMenuFocus).toBe(added);
	});

	it("keeps every existing pane's view untouched", () => {
		const before = workspace().panes.map((pane) => [pane.id, pane.view]);

		useTabeloStore.getState().addPane();

		const after = new Map(
			workspace().panes.map((pane) => [pane.id, pane.view]),
		);
		for (const [id, view] of before) expect(after.get(id)).toBe(view);
	});

	it("reaches four panes and then does nothing", () => {
		const store = useTabeloStore.getState();
		store.addPane();
		store.addPane();
		expect(workspace().panes).toHaveLength(4);
		expect(paneCount(workspace().layout)).toBe(4);

		const saturated = workspace();
		store.addPane();
		expect(workspace()).toBe(saturated);
	});

	it("never leaves the workspace in a layout the gallery cannot express", () => {
		const store = useTabeloStore.getState();
		for (let step = 0; step < 3; step += 1) {
			store.addPane();
			expect(workspace().panes).toHaveLength(paneCount(workspace().layout));
		}
	});

	it("does not disturb a pending draft in another pane", () => {
		const paneId = markdownPaneId();
		useTabeloStore.getState().setDraft(paneId, "markdown", "Name\nAna");

		useTabeloStore.getState().addPane();

		expect(useTabeloStore.getState().draft?.paneId).toBe(paneId);
		expect(workspace().panes.some((pane) => pane.id === paneId)).toBe(true);
	});

	it("chooses a view the workspace is not already showing", () => {
		const before = workspace();

		useTabeloStore.getState().addPane();

		const added = workspace().panes.find(
			(pane) => pane.id === addedPaneId(before.panes),
		);
		expect(added).toBeDefined();
		expect(before.panes.map((pane) => pane.view)).not.toContain(added?.view);
	});
});

describe("closing a view", () => {
	it("removes that pane and keeps the others", () => {
		const store = useTabeloStore.getState();
		store.addPane();
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

	it("does nothing at a single pane", () => {
		const store = useTabeloStore.getState();
		store.setLayout("single");
		const single = workspace();

		useTabeloStore.getState().closePane(single.panes[0].id);

		expect(workspace()).toBe(single);
	});

	it("moves the active pane when the active one is closed", () => {
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
		const counts: number[] = [workspace().panes.length];
		while (workspace().panes.length < 4) {
			store.addPane();
			counts.push(workspace().panes.length);
		}
		while (workspace().panes.length > 1) {
			store.closePane(workspace().panes.at(-1)?.id ?? "");
			counts.push(workspace().panes.length);
		}
		expect(counts).toEqual([2, 3, 4, 3, 2, 1]);
	});
});

describe("closing a view that owns a draft", () => {
	it("asks before discarding text the document has not read back", () => {
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
		const paneId = markdownPaneId();
		useTabeloStore.getState().setDraft(paneId, "markdown", invalidMarkdown);
		useTabeloStore.getState().closePane(paneId);

		useTabeloStore.getState().confirmPaneAction();

		expect(workspace().panes.some((pane) => pane.id === paneId)).toBe(false);
		expect(useTabeloStore.getState().draft).toBeNull();
		expect(useTabeloStore.getState().pendingPaneAction).toBeNull();
	});

	it("keeps the pane when the question is dismissed instead of answered", () => {
		const paneId = markdownPaneId();
		useTabeloStore.getState().setDraft(paneId, "markdown", invalidMarkdown);
		useTabeloStore.getState().closePane(paneId);

		useTabeloStore.getState().dismissNotice();

		expect(workspace().panes.some((pane) => pane.id === paneId)).toBe(true);
		expect(useTabeloStore.getState().draft?.text).toBe(invalidMarkdown);
		expect(useTabeloStore.getState().pendingPaneAction).toBeNull();
	});

	it("closes straight away when the draft is already committed", () => {
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
		const store = useTabeloStore.getState();
		store.addPane();
		const paneId = markdownPaneId();
		useTabeloStore.getState().setDraft(paneId, "markdown", invalidMarkdown);
		const other = workspace().panes.find((pane) => pane.id !== paneId);

		useTabeloStore.getState().closePane(other?.id ?? "");

		expect(useTabeloStore.getState().draft?.text).toBe(invalidMarkdown);
		expect(useTabeloStore.getState().pendingPaneAction).toBeNull();
	});
});
