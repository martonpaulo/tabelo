// @vitest-environment happy-dom

import {
	afterEach,
	assert,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { CURRENT_VERSION, STORAGE_KEY } from "@/persistence/schema";
import { flushPersistence, startAutosave, useTabeloStore } from "./store";

const initialState = useTabeloStore.getInitialState();
const invalidMarkdown = "| Name |\n| not a divider |\n| Ingrid |";
const validMarkdown = "| Name |\n| --- |\n| Ingrid |";
let stopAutosave: (() => void) | null = null;

beforeEach(() => {
	vi.useFakeTimers();
	window.localStorage.clear();
	useTabeloStore.getState().discardDraft();
	useTabeloStore.setState(initialState, true);
});

afterEach(() => {
	stopAutosave?.();
	stopAutosave = null;
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function markdownPaneId(): string {
	const pane = useTabeloStore
		.getState()
		.workspace.panes.find((candidate) => candidate.view === "markdown");
	expect(pane).toBeDefined();
	return pane?.id ?? "";
}

describe("autosave lifecycle", () => {
	it("rehydrates the last valid document with its invalid owned draft", () => {
		const paneId = markdownPaneId();
		const store = useTabeloStore.getState();
		store.setDraft(paneId, "markdown", validMarkdown);
		store.setDraft(paneId, "markdown", invalidMarkdown);
		expect(flushPersistence()).toEqual({ status: "saved" });

		useTabeloStore.getState().discardDraft();
		useTabeloStore.setState(initialState, true);
		useTabeloStore.getState().hydrate();

		const restored = useTabeloStore.getState();
		const firstColumn = restored.document.columns[0];
		assert(firstColumn);
		expect(firstColumn.header).toBe("Name");
		expect(restored.document.rows[0]?.cells[firstColumn.id]).toBe("Ingrid");
		expect(restored.draft).toMatchObject({
			paneId,
			viewId: "markdown",
			text: invalidMarkdown,
			status: "invalid",
		});
		expect(restored.draft?.issues.length).toBeGreaterThan(0);
		expect(restored.hasHeldContent).toBe(true);
	});

	it("keeps every identifier distinct after hydrating and then mutating", () => {
		expect(flushPersistence()).toEqual({ status: "saved" });

		useTabeloStore.getState().discardDraft();
		useTabeloStore.setState(initialState, true);
		useTabeloStore.getState().hydrate();

		useTabeloStore.getState().addRowAbove();
		useTabeloStore.getState().addColumnLeft();

		const document = useTabeloStore.getState().document;
		const rowIds = document.rows.map((row) => row.id);
		const columnIds = document.columns.map((column) => column.id);
		expect(new Set(rowIds).size).toBe(rowIds.length);
		expect(new Set(columnIds).size).toBe(columnIds.length);
	});

	it("hydrates surviving widths and removes orphaned column ids", () => {
		const store = useTabeloStore.getState();
		const columnId = store.document.columns[0]?.id ?? "";
		store.resizeColumn(0, 18);
		expect(flushPersistence()).toEqual({ status: "saved" });

		const saved = JSON.parse(
			window.localStorage.getItem(STORAGE_KEY) ?? "null",
		);
		saved.workspace.columnWidths.orphan = 24;
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));

		useTabeloStore.setState(initialState, true);
		useTabeloStore.getState().hydrate();

		expect(useTabeloStore.getState().workspace.columnWidths).toEqual({
			[columnId]: 18,
		});
	});

	it("flushes the latest invalid draft on pagehide before debounce", () => {
		stopAutosave = startAutosave();
		const paneId = markdownPaneId();
		useTabeloStore.getState().setDraft(paneId, "markdown", invalidMarkdown);
		expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

		window.dispatchEvent(new PageTransitionEvent("pagehide"));

		const saved = JSON.parse(
			window.localStorage.getItem(STORAGE_KEY) ?? "null",
		);
		expect(saved).toMatchObject({
			version: CURRENT_VERSION,
			draft: { paneId, viewId: "markdown", text: invalidMarkdown },
		});
	});

	// A copy is not an edit, and the range it marked describes a moment rather
	// than a document. Reopening the tab to a dashed outline around cells whose
	// content is no longer on the system clipboard would be a lie.
	it("never writes the copied range to storage", () => {
		useTabeloStore.getState().markCopiedRanges();
		expect(useTabeloStore.getState().copiedRanges).not.toHaveLength(0);

		expect(flushPersistence()).toEqual({ status: "saved" });

		const raw = window.localStorage.getItem(STORAGE_KEY) ?? "";
		expect(raw).not.toContain("copiedRanges");

		useTabeloStore.setState(initialState, true);
		useTabeloStore.getState().hydrate();
		expect(useTabeloStore.getState().copiedRanges).toHaveLength(0);
	});

	it("clears stale write errors after a verified successful write", () => {
		useTabeloStore.setState({ storageIssue: { kind: "unavailable" } });

		expect(flushPersistence()).toEqual({ status: "saved" });
		expect(useTabeloStore.getState().storageIssue).toBeNull();
	});

	it("does not overwrite unreadable browser data during autosave", () => {
		const raw = "{keep me unchanged";
		window.localStorage.setItem(STORAGE_KEY, raw);
		useTabeloStore.setState({
			storageIssue: { kind: "unreadable", raw },
		});
		stopAutosave = startAutosave();

		useTabeloStore.getState().editCell(0, 0, "Changed");
		vi.advanceTimersByTime(500);

		expect(window.localStorage.getItem(STORAGE_KEY)).toBe(raw);
		expect(useTabeloStore.getState().storageIssue?.kind).toBe("unreadable");
	});
});
