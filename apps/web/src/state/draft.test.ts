import { beforeEach, describe, expect, it } from "vitest";
import { layoutPresets } from "@/workspace/layout";
import { useTabeloStore } from "./store";

const initialState = useTabeloStore.getInitialState();
const invalidMarkdown = "| Name |\n| not a divider |\n| Ana |";
const validMarkdown = "| Name |\n| --- |\n| Ana |";

beforeEach(() => {
	useTabeloStore.getState().discardDraft();
	useTabeloStore.setState(initialState, true);
});

function markdownPaneId(): string {
	const pane = useTabeloStore
		.getState()
		.workspace.panes.find((candidate) => candidate.view === "markdown");
	expect(pane).toBeDefined();
	return pane?.id ?? "";
}

describe("draft ownership", () => {
	it.each(layoutPresets.map((preset) => preset.id))(
		"preserves the owning pane when changing to %s",
		(layout) => {
			const store = useTabeloStore.getState();
			store.setLayout("quad");
			const paneId = useTabeloStore.getState().workspace.panes.at(-1)?.id ?? "";
			store.setPaneView(paneId, "markdown");
			store.setDraft(paneId, "markdown", invalidMarkdown);

			store.setLayout(layout);

			const state = useTabeloStore.getState();
			expect(state.workspace.panes.some((pane) => pane.id === paneId)).toBe(
				true,
			);
			expect(state.draft?.paneId).toBe(paneId);
		},
	);

	it("does not let another duplicate pane claim the owner's draft", () => {
		const store = useTabeloStore.getState();
		store.setLayout("quad");
		const panes = useTabeloStore.getState().workspace.panes;
		const first = panes[1];
		const second = panes[2];
		store.setPaneView(second.id, "markdown");
		store.setDraft(second.id, "markdown", invalidMarkdown);

		store.setPaneView(first.id, "csv");

		expect(useTabeloStore.getState().draft).toMatchObject({
			paneId: second.id,
			viewId: "markdown",
			text: invalidMarkdown,
		});
	});

	it("requires an explicit discard before retiring an invalid owner", () => {
		const store = useTabeloStore.getState();
		const paneId = markdownPaneId();
		store.setDraft(paneId, "markdown", invalidMarkdown);
		store.commitDraft();

		store.setPaneView(paneId, "csv");

		let state = useTabeloStore.getState();
		expect(state.workspace.panes.find((pane) => pane.id === paneId)?.view).toBe(
			"markdown",
		);
		expect(state.pendingPaneView).toEqual({ paneId, view: "csv" });
		expect(state.draft?.text).toBe(invalidMarkdown);

		state.confirmPaneView();

		state = useTabeloStore.getState();
		expect(state.workspace.panes.find((pane) => pane.id === paneId)?.view).toBe(
			"csv",
		);
		expect(state.pendingPaneView).toBeNull();
		expect(state.draft).toBeNull();
	});

	it("retires a valid owner without asking to discard committed data", () => {
		const store = useTabeloStore.getState();
		const paneId = markdownPaneId();
		store.setDraft(paneId, "markdown", validMarkdown);

		store.setPaneView(paneId, "csv");

		const state = useTabeloStore.getState();
		expect(state.workspace.panes.find((pane) => pane.id === paneId)?.view).toBe(
			"csv",
		);
		expect(state.pendingPaneView).toBeNull();
		expect(state.draft).toBeNull();
		expect(state.document.columns[0]?.header).toBe("Name");
	});

	it("restores a displaced invalid draft to its owner through undo", () => {
		const store = useTabeloStore.getState();
		const paneId = markdownPaneId();
		store.setDraft(paneId, "markdown", invalidMarkdown);
		store.commitDraft();

		store.editCell(0, 0, "Grid wins");
		expect(useTabeloStore.getState().draft).toBeNull();

		useTabeloStore.getState().undo();

		expect(useTabeloStore.getState().draft).toMatchObject({
			paneId,
			viewId: "markdown",
			text: invalidMarkdown,
		});
	});
});
