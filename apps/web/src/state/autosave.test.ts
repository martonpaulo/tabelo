// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
		expect(restored.document.columns[0]?.header).toBe("Name");
		expect(
			restored.document.rows[0]?.cells[restored.document.columns[0].id],
		).toBe("Ingrid");
		expect(restored.draft).toMatchObject({
			paneId,
			viewId: "markdown",
			text: invalidMarkdown,
			status: "invalid",
		});
		expect(restored.draft?.issues.length).toBeGreaterThan(0);
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
