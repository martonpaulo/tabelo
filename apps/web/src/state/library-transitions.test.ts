// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { documentFromMatrix } from "@/core/document";
import { CURRENT_VERSION, LIBRARY_KEY, tableKey } from "@/persistence/schema";
import { flushPersistence, useTabeloStore } from "./store";

const initial = useTabeloStore.getInitialState();
beforeEach(() => {
	localStorage.clear();
	useTabeloStore.setState(initial, true);
});
afterEach(() => vi.restoreAllMocks());

function twoTables() {
	const first = useTabeloStore.getState().library.activeId;
	useTabeloStore
		.getState()
		.applyDocument(
			documentFromMatrix([["Name"], ["Ingrid"]], { headerRow: true }),
		);
	useTabeloStore.getState().createTable();
	const second = useTabeloStore.getState().library.activeId;
	useTabeloStore.getState().switchTable(first);
	return { first, second };
}

describe("library transitions preserve recoverable work", () => {
	it("keeps the current table and index when only index writes fail", () => {
		const { second } = twoTables();
		const before = useTabeloStore.getState();
		const raw = localStorage.getItem(LIBRARY_KEY);
		const write = localStorage.setItem.bind(localStorage);
		const writes = vi
			.spyOn(window.localStorage, "setItem")
			.mockImplementation((key, value) => {
				if (key === LIBRARY_KEY)
					throw new DOMException("Full", "QuotaExceededError");
				write(key, value);
			});
		expect(before.switchTable(second).status).toBe("quota");
		expect(before.createTable("Research").status).toBe("quota");
		expect(useTabeloStore.getState().library).toBe(before.library);
		expect(useTabeloStore.getState().document).toBe(before.document);
		expect(localStorage.getItem(LIBRARY_KEY)).toBe(raw);
		writes.mockRestore();
	});

	it("refuses opening inaccessible storage without replacing the active document", () => {
		const { second } = twoTables();
		const before = useTabeloStore.getState();
		const get = localStorage.getItem.bind(localStorage);
		const reads = vi
			.spyOn(window.localStorage, "getItem")
			.mockImplementation((key) => {
				if (key === tableKey(second))
					throw new DOMException("Blocked", "SecurityError");
				return get(key);
			});
		expect(before.switchTable(second).status).toBe("unavailable");
		expect(useTabeloStore.getState().document).toBe(before.document);
		expect(useTabeloStore.getState().library).toBe(before.library);
		reads.mockRestore();
	});
	it("does not write through an unavailable index read and can hydrate after access returns", () => {
		const reads = vi
			.spyOn(window.localStorage, "getItem")
			.mockImplementation(() => {
				throw new DOMException("Blocked", "SecurityError");
			});
		const writes = vi.spyOn(window.localStorage, "setItem");
		useTabeloStore.getState().hydrate();
		expect(flushPersistence().status).toBe("blocked");
		expect(writes).not.toHaveBeenCalled();
		reads.mockRestore();
		useTabeloStore.getState().hydrate();
		expect(useTabeloStore.getState().storageIssue).toBeNull();
		expect(localStorage.getItem(LIBRARY_KEY)).not.toBeNull();
	});
	it.each(["QuotaExceededError", "SecurityError"])(
		"refuses switching and creation after %s, then recovers",
		(error) => {
			const { first, second } = twoTables();
			const pane = useTabeloStore
				.getState()
				.workspace.panes.find((p) => p.view === "markdown");
			if (!pane) throw new Error("Missing source pane");
			useTabeloStore
				.getState()
				.setDraft(pane.id, "markdown", "unfinished source");
			const before = useTabeloStore.getState();
			const writes = vi
				.spyOn(window.localStorage, "setItem")
				.mockImplementation(() => {
					throw new DOMException("Blocked", error);
				});
			before.switchTable(second);
			before.createTable();
			const refused = useTabeloStore.getState();
			expect(refused.library).toBe(before.library);
			expect(refused.document).toBe(before.document);
			expect(refused.draft).toBe(before.draft);
			expect(refused.storageIssue?.kind).toBe(
				error === "QuotaExceededError" ? "quota" : "unavailable",
			);
			writes.mockRestore();
			refused.switchTable(second);
			expect(useTabeloStore.getState().library.activeId).toBe(second);
			useTabeloStore.getState().switchTable(first);
			expect(useTabeloStore.getState().draft?.text).toBe("unfinished source");
			expect(useTabeloStore.getState().storageIssue).toBeNull();
		},
	);

	it.each([
		"{retain original bytes",
		JSON.stringify({ version: CURRENT_VERSION + 1 }),
	])(
		"protects unreadable tables on switching and neighbor opening: %s",
		(raw) => {
			const { first, second } = twoTables();
			localStorage.setItem(tableKey(second), raw);
			useTabeloStore.getState().switchTable(second);
			expect(useTabeloStore.getState().storageIssue).toMatchObject({
				kind: "unreadable",
				raw,
			});
			expect(flushPersistence().status).toBe("blocked");
			expect(localStorage.getItem(tableKey(second))).toBe(raw);
			useTabeloStore.setState({
				library: { ...useTabeloStore.getState().library, activeId: first },
				storageIssue: null,
			});
			useTabeloStore.getState().deleteTable(first);
			expect(useTabeloStore.getState().storageIssue).toMatchObject({
				kind: "unreadable",
				raw,
			});
			expect(flushPersistence().status).toBe("blocked");
			expect(localStorage.getItem(tableKey(second))).toBe(raw);
		},
	);

	it.each([
		"{original index",
		JSON.stringify({ version: 99, tables: ["original"], activeId: "original" }),
		JSON.stringify({ version: 1, tables: [], activeId: "missing" }),
	])("preserves an unreadable library index and table keys: %s", (raw) => {
		localStorage.setItem(LIBRARY_KEY, raw);
		localStorage.setItem(tableKey("original"), "original table bytes");
		useTabeloStore.getState().hydrate();
		expect(useTabeloStore.getState().storageIssue).toMatchObject({
			kind: "unreadable",
			scope: "library",
			raw,
		});
		expect(flushPersistence().status).toBe("blocked");
		useTabeloStore.getState().createTable();
		expect(localStorage.getItem(LIBRARY_KEY)).toBe(raw);
		expect(useTabeloStore.getState().replaceUnreadableStorage()).toBe(true);
		expect(localStorage.getItem(`${LIBRARY_KEY}.recovery`)).toBe(raw);
		expect(localStorage.getItem(tableKey("original"))).toBe(
			"original table bytes",
		);
	});
});
