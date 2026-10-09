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
		useTabeloStore
			.getState()
			.applyDocument(
				documentFromMatrix([["Name"], ["Ingrid"]], { headerRow: true }),
			);
		expect(useTabeloStore.getState().replaceUnreadableStorage()).toBe(true);
		const recovered = useTabeloStore.getState();
		const saved = JSON.parse(
			localStorage.getItem(tableKey(recovered.library.activeId)) ?? "{}",
		);
		expect(saved.document).toEqual(recovered.document);
		expect(localStorage.getItem(`${LIBRARY_KEY}.recovery`)).toBe(raw);
		expect(localStorage.getItem(tableKey("original"))).toBe(
			"original table bytes",
		);
	});
});

describe("a table keeps its session history while another is open", () => {
	const base = documentFromMatrix([["Name"], ["Ingrid"]], { headerRow: true });
	const edited = documentFromMatrix([["Name"], ["Paulo"]], { headerRow: true });

	function cellText() {
		const { document } = useTabeloStore.getState();
		const row = document.rows[0];
		return row?.cells[document.columns[0]?.id ?? ""];
	}

	it("returns to a table with its undo and redo steps", () => {
		const first = useTabeloStore.getState().library.activeId;
		useTabeloStore.getState().applyDocument(base);
		useTabeloStore.getState().applyDocument(edited);
		useTabeloStore.getState().createTable();
		const second = useTabeloStore.getState().library.activeId;
		expect(useTabeloStore.getState().past).toHaveLength(0);
		useTabeloStore.getState().switchTable(first);
		expect(cellText()).toBe("Paulo");
		useTabeloStore.getState().undo();
		expect(cellText()).toBe("Ingrid");
		useTabeloStore.getState().switchTable(second);
		useTabeloStore.getState().switchTable(first);
		expect(cellText()).toBe("Ingrid");
		useTabeloStore.getState().redo();
		expect(cellText()).toBe("Paulo");
	});

	it("keeps a superseded invalid draft recoverable through undo", () => {
		const first = useTabeloStore.getState().library.activeId;
		useTabeloStore.getState().applyDocument(base);
		const pane = useTabeloStore
			.getState()
			.workspace.panes.find((p) => p.view === "markdown");
		if (!pane) throw new Error("Missing source pane");
		const invalid = "| Name |\n| not a divider |\n| Ingrid |";
		useTabeloStore.getState().setDraft(pane.id, "markdown", invalid);
		useTabeloStore.getState().applyDocument(edited);
		expect(useTabeloStore.getState().draft).toBeNull();
		useTabeloStore.getState().createTable();
		useTabeloStore.getState().switchTable(first);
		useTabeloStore.getState().undo();
		expect(useTabeloStore.getState().draft?.text).toBe(invalid);
	});

	it("drops only the deleted table's history", () => {
		const first = useTabeloStore.getState().library.activeId;
		useTabeloStore.getState().applyDocument(base);
		useTabeloStore.getState().createTable();
		const second = useTabeloStore.getState().library.activeId;
		useTabeloStore.getState().applyDocument(edited);
		useTabeloStore.getState().createTable();
		const third = useTabeloStore.getState().library.activeId;
		useTabeloStore.getState().deleteTable(first);
		useTabeloStore.getState().switchTable(second);
		expect(useTabeloStore.getState().past.length).toBeGreaterThan(0);
		useTabeloStore.getState().switchTable(third);
		expect(useTabeloStore.getState().library.tables).toHaveLength(2);
	});

	it("records the table switched to as the one a reload opens", () => {
		const { first, second } = twoTables();
		expect(JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? "{}").activeId).toBe(
			first,
		);
		useTabeloStore.setState(initial, true);
		useTabeloStore.getState().hydrate();
		expect(useTabeloStore.getState().library.activeId).toBe(first);
		expect(useTabeloStore.getState().library.activeId).not.toBe(second);
		expect(cellText()).toBe("Ingrid");
	});
});
