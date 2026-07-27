// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import { createSelection } from "@/core/selection";
import { listViews } from "@/views/registry";
import { canParse } from "@/views/types";
import { layoutPresets } from "@/workspace/layout";
import { textForView, useTabeloStore } from "./store";

const initialState = useTabeloStore.getInitialState();
const invalidMarkdown = "| Name |\n| not a divider |\n| Ana |";
const validMarkdown = "| Name |\n| --- |\n| Ana |";

beforeEach(() => {
	useTabeloStore.getState().discardDraft();
	useTabeloStore.setState(initialState, true);
});

afterEach(() => {
	useTabeloStore.getState().discardDraft();
	vi.useRealTimers();
});

function markdownPaneId(): string {
	const pane = useTabeloStore
		.getState()
		.workspace.panes.find((candidate) => candidate.view === "markdown");
	expect(pane).toBeDefined();
	return pane?.id ?? "";
}

describe("draft ownership", () => {
	const layoutTransitions = layoutPresets.flatMap((from) =>
		layoutPresets.flatMap((to) =>
			[
				["clean", validMarkdown],
				["invalid", invalidMarkdown],
			].map(([status, text]) => [from.id, to.id, status, text] as const),
		),
	);

	it.each(layoutTransitions)(
		"%s to %s preserves its %s draft owner",
		(from, to, _status, text) => {
			const store = useTabeloStore.getState();
			store.setLayout(from);
			const paneId = useTabeloStore.getState().workspace.panes.at(-1)?.id ?? "";
			store.setPaneView(paneId, "markdown");
			store.setDraft(paneId, "markdown", text);

			store.setLayout(to);

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

		store.editCell(0, 0, "Grid wins");
		expect(useTabeloStore.getState().draft).toBeNull();

		useTabeloStore.getState().undo();

		expect(useTabeloStore.getState().draft).toMatchObject({
			paneId,
			viewId: "markdown",
			text: invalidMarkdown,
		});
	});

	it("restores an invalid draft after reset through undo", () => {
		const store = useTabeloStore.getState();
		const paneId = markdownPaneId();
		store.setDraft(paneId, "markdown", invalidMarkdown);

		store.resetDocument();
		expect(useTabeloStore.getState().draft).toBeNull();

		useTabeloStore.getState().undo();

		expect(useTabeloStore.getState().draft).toMatchObject({
			paneId,
			viewId: "markdown",
			text: invalidMarkdown,
			status: "invalid",
		});
	});

	it("reparses a restored draft instead of trusting stale issues", () => {
		const store = useTabeloStore.getState();
		const paneId = markdownPaneId();
		store.setDraft(paneId, "markdown", invalidMarkdown);
		store.editCell(0, 0, "Grid wins");
		const entry = useTabeloStore.getState().past.at(-1);
		expect(entry?.draft).not.toBeNull();
		if (!entry) throw new Error("Expected a draft history entry.");
		useTabeloStore.setState({
			past: [
				{
					...entry,
					draft: entry.draft
						? {
								...entry.draft,
								issues: [{ message: "stale issue", line: 99 }],
							}
						: null,
				},
			],
		});

		useTabeloStore.getState().undo();

		const restored = useTabeloStore.getState().draft;
		expect(restored?.status).toBe("invalid");
		expect(restored?.issues).not.toContainEqual({
			message: "stale issue",
			line: 99,
		});
		expect(restored?.issues.length).toBeGreaterThan(0);
	});
});

describe("source synchronization", () => {
	const parsedDocument = documentFromMatrix(
		[
			["Name", "Role"],
			["Ana", "Designer"],
		],
		{ headerRow: true },
	);
	const editableViews = listViews().filter(canParse);

	it.each(
		editableViews.map((view) => [
			view.id,
			view.codec?.serialize(parsedDocument) ?? "",
		]),
	)("parses a valid %s transaction immediately", (viewId, text) => {
		const paneId = markdownPaneId();
		const store = useTabeloStore.getState();
		store.setPaneView(paneId, viewId);

		store.setDraft(paneId, viewId, text);

		const state = useTabeloStore.getState();
		expect(documentToMatrix(state.document)).toEqual([
			["Name", "Role"],
			["Ana", "Designer"],
		]);
		expect(state.draft).toMatchObject({
			paneId,
			viewId,
			status: "clean",
			issues: [],
		});
	});

	it("shows a persistent parse error only after the grace period", () => {
		vi.useFakeTimers();
		const paneId = markdownPaneId();

		useTabeloStore.getState().setDraft(paneId, "markdown", invalidMarkdown);

		expect(useTabeloStore.getState().draft?.status).toBe("invalid-grace");
		vi.advanceTimersByTime(299);
		expect(useTabeloStore.getState().draft?.status).toBe("invalid-grace");
		vi.advanceTimersByTime(1);
		expect(useTabeloStore.getState().draft?.status).toBe("invalid");
	});

	it("returns to clean immediately when transient syntax becomes valid", () => {
		vi.useFakeTimers();
		const paneId = markdownPaneId();
		const store = useTabeloStore.getState();
		const before = store.document;

		store.setDraft(paneId, "markdown", invalidMarkdown);
		expect(useTabeloStore.getState().document).toBe(before);

		store.setDraft(paneId, "markdown", validMarkdown);

		expect(useTabeloStore.getState().draft?.status).toBe("clean");
		expect(useTabeloStore.getState().document.columns[0]?.header).toBe("Name");
		vi.advanceTimersByTime(300);
		expect(useTabeloStore.getState().draft?.status).toBe("clean");
	});

	it("records one document step for one valid source transaction", () => {
		const paneId = markdownPaneId();
		const before = useTabeloStore.getState().document;

		useTabeloStore.getState().setDraft(paneId, "markdown", validMarkdown);

		expect(useTabeloStore.getState().past).toHaveLength(1);
		useTabeloStore.getState().undo();
		expect(useTabeloStore.getState().document).toBe(before);
	});

	it("preserves identifiers while synchronizing a 200-row source", () => {
		const parsed = documentFromMatrix(
			[
				["Name"],
				...Array.from({ length: 200 }, (_, index) => [`Value ${index}`]),
			],
			{ headerRow: true },
		);
		const document = {
			...parsed,
			columns: [{ ...parsed.columns[0], width: 240 }],
		};
		const selection = createSelection({ row: 199, column: 0 });
		useTabeloStore.setState({
			document,
			selection,
			past: [],
			future: [],
			draft: null,
		});
		const paneId = markdownPaneId();
		const rowIds = document.rows.map((row) => row.id);
		const columnIds = document.columns.map((column) => column.id);
		const changed = textForView(document, "markdown").replace(
			"Value 199",
			"Changed",
		);

		useTabeloStore.getState().setDraft(paneId, "markdown", changed);

		const state = useTabeloStore.getState();
		expect(state.document.rows).toHaveLength(200);
		expect(state.document.rows.map((row) => row.id)).toEqual(rowIds);
		expect(state.document.columns.map((column) => column.id)).toEqual(
			columnIds,
		);
		expect(state.document.columns[0]?.width).toBe(240);
		expect(state.selection).toEqual(selection);
		expect(state.document.rows[199]?.cells[columnIds[0] ?? ""]).toBe("Changed");
		expect(state.past).toHaveLength(1);
	});
});
