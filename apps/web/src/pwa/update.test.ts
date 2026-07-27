// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "@/persistence/schema";
import { flushPersistence, useTabeloStore } from "@/state/store";
import { activateUpdateAfterSave } from "./update";

const initialState = useTabeloStore.getInitialState();
const validMarkdown = "| Name |\n| --- |\n| Ana |";
const invalidMarkdown = "| Name |\n| not a divider |\n| Ana |";

beforeEach(() => {
	window.localStorage.clear();
	useTabeloStore.getState().discardDraft();
	useTabeloStore.setState(initialState, true);
});

describe("PWA update activation", () => {
	it.each([
		["valid", validMarkdown],
		["invalid", invalidMarkdown],
	])("durably saves a %s owned draft before activating", async (_, text) => {
		const store = useTabeloStore.getState();
		const pane = store.workspace.panes.find(
			(candidate) => candidate.view === "markdown",
		);
		expect(pane).toBeDefined();
		store.setDraft(pane?.id ?? "", "markdown", text);
		const activate = vi.fn(async () => undefined);

		const activated = await activateUpdateAfterSave(flushPersistence, activate);

		expect(activated).toBe(true);
		expect(activate).toHaveBeenCalledOnce();
		const persisted = JSON.parse(
			window.localStorage.getItem(STORAGE_KEY) ?? "null",
		);
		expect(persisted.draft).toEqual({
			paneId: pane?.id,
			viewId: "markdown",
			text,
		});
	});

	it("does not activate when durable storage rejects the write", async () => {
		const write = vi
			.spyOn(window.localStorage, "setItem")
			.mockImplementation(() => {
				throw new DOMException("full", "QuotaExceededError");
			});
		const activate = vi.fn(async () => undefined);

		const activated = await activateUpdateAfterSave(flushPersistence, activate);

		expect(activated).toBe(false);
		expect(activate).not.toHaveBeenCalled();
		expect(useTabeloStore.getState().storageIssue?.kind).toBe("quota");
		write.mockRestore();
	});
});
