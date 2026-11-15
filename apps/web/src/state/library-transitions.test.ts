// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TABLE_NAME } from "@/copy/product";
import {
	createEmptyDocument,
	documentFromMatrix,
	isDocumentBlank,
} from "@/core/document";
import {
	CURRENT_VERSION,
	LIBRARY_KEY,
	LIBRARY_VERSION,
	tableKey,
} from "@/persistence/schema";
import { createDefaultWorkspace } from "@/workspace/layout";
import { flushPersistence, useTabeloStore } from "./store";

const initial = useTabeloStore.getInitialState();
beforeEach(() => {
	localStorage.clear();
	useTabeloStore.setState(initial, true);
});
afterEach(() => vi.restoreAllMocks());

// The active table's id, for a test that has one open.
function activeId(): string {
	const id = useTabeloStore.getState().library.activeId;
	if (id === null) throw new Error("no active table");
	return id;
}

function twoTables() {
	const first = activeId();
	useTabeloStore
		.getState()
		.applyDocument(
			documentFromMatrix([["Name"], ["Ingrid"]], { headerRow: true }),
		);
	useTabeloStore.getState().createTable();
	const second = activeId();
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
			expect(activeId()).toBe(second);
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

	// Deleting while the library index is unreadable or newer must leave the
	// preserved index and every stored table as they were (#544).
	it("deletes nothing while the library index is unreadable", () => {
		const raw = JSON.stringify({
			version: 99,
			tables: ["original"],
			activeId: "original",
		});
		localStorage.setItem(LIBRARY_KEY, raw);
		localStorage.setItem(tableKey("original"), "original table bytes");
		useTabeloStore.getState().hydrate();
		useTabeloStore.setState({
			library: {
				tables: [{ id: "blank", name: "Untitled table", mark: 1 }],
				activeId: "blank",
			},
		});
		useTabeloStore.getState().deleteTable("blank");
		expect(localStorage.getItem(LIBRARY_KEY)).toBe(raw);
		expect(localStorage.getItem(tableKey("original"))).toBe(
			"original table bytes",
		);
		expect(useTabeloStore.getState().storageIssue).toMatchObject({
			kind: "unreadable",
		});
	});

	// A refused index write leaves the table where it was, not half deleted.
	it("keeps a table whose deletion could not be written", () => {
		const { first } = twoTables();
		const before = useTabeloStore.getState().library;
		const kept = localStorage.getItem(tableKey(first));
		const write = localStorage.setItem.bind(localStorage);
		const writes = vi
			.spyOn(window.localStorage, "setItem")
			.mockImplementation((key, value) => {
				if (key === LIBRARY_KEY)
					throw new DOMException("Full", "QuotaExceededError");
				write(key, value);
			});
		useTabeloStore.getState().deleteTable(first);
		expect(useTabeloStore.getState().library).toBe(before);
		expect(localStorage.getItem(tableKey(first))).toBe(kept);
		expect(useTabeloStore.getState().storageIssue).toMatchObject({
			kind: "quota",
		});
		// Retained sessions are module state the store reset does not clear,
		// so the table is deleted for real before the next test.
		writes.mockRestore();
		useTabeloStore.setState({ storageIssue: null });
		useTabeloStore.getState().deleteTable(first);
		expect(localStorage.getItem(tableKey(first))).toBeNull();
	});

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
			localStorage.getItem(tableKey(recovered.library.activeId ?? "")) ?? "{}",
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
		const first = activeId();
		useTabeloStore.getState().applyDocument(base);
		useTabeloStore.getState().applyDocument(edited);
		useTabeloStore.getState().createTable();
		const second = activeId();
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
		const first = activeId();
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
		const first = activeId();
		useTabeloStore.getState().applyDocument(base);
		useTabeloStore.getState().createTable();
		const second = activeId();
		useTabeloStore.getState().applyDocument(edited);
		useTabeloStore.getState().createTable();
		const third = activeId();
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
		expect(activeId()).toBe(first);
		expect(activeId()).not.toBe(second);
		expect(cellText()).toBe("Ingrid");
	});
});

// The library may hold no table (#466).
describe("deleting the last table", () => {
	function deleteOnlyTable() {
		useTabeloStore
			.getState()
			.applyDocument(
				documentFromMatrix([["Name"], ["Ingrid"]], { headerRow: true }),
			);
		flushPersistence();
		const only = activeId();
		useTabeloStore.getState().deleteTable(only);
		return only;
	}

	it("removes its payload and leaves an empty library with nothing active", () => {
		const only = deleteOnlyTable();
		const state = useTabeloStore.getState();
		expect(state.library).toEqual({ tables: [], activeId: null });
		expect(isDocumentBlank(state.document)).toBe(true);
		expect(state.past).toHaveLength(0);
		expect(localStorage.getItem(tableKey(only))).toBeNull();
		expect(JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? "{}")).toMatchObject(
			{ tables: [], activeId: null },
		);
	});

	it("writes nothing while the library is empty and blank", () => {
		deleteOnlyTable();
		const keys = localStorage.length;
		expect(flushPersistence().status).toBe("saved");
		expect(localStorage.length).toBe(keys);
		expect(useTabeloStore.getState().library.tables).toHaveLength(0);
	});

	it("reloads into the empty library", () => {
		deleteOnlyTable();
		useTabeloStore.setState(initial, true);
		useTabeloStore.getState().hydrate();
		expect(useTabeloStore.getState().library).toEqual({
			tables: [],
			activeId: null,
		});
		expect(useTabeloStore.getState().storageIssue).toBeNull();
		expect(localStorage.length).toBe(1);
	});

	it("gives arriving content a new table and keeps it", () => {
		deleteOnlyTable();
		useTabeloStore
			.getState()
			.applyDocument(
				documentFromMatrix([["Name"], ["Paulo"]], { headerRow: true }),
			);
		expect(flushPersistence().status).toBe("saved");
		const created = activeId();
		expect(useTabeloStore.getState().library.tables).toHaveLength(1);
		useTabeloStore.setState(initial, true);
		useTabeloStore.getState().hydrate();
		expect(activeId()).toBe(created);
		const { document } = useTabeloStore.getState();
		expect(document.rows[0]?.cells[document.columns[0]?.id ?? ""]).toBe(
			"Paulo",
		);
	});

	it("starts an empty table on request", () => {
		deleteOnlyTable();
		const started = useTabeloStore.getState().ensureActiveTable();
		expect(started.status).toBe("saved");
		expect(useTabeloStore.getState().library.tables).toHaveLength(1);
		expect(useTabeloStore.getState().ensureActiveTable().status).toBe(
			"unchanged",
		);
	});
});

describe("duplicating a table", () => {
	const roster = documentFromMatrix(
		[
			["Name", "City"],
			["Ingrid", "Rio"],
			["Paulo", "Madrid"],
		],
		{ headerRow: true },
	);

	function storedName(id: string): string | undefined {
		return JSON.parse(localStorage.getItem(tableKey(id)) ?? "{}").name;
	}

	it("opens an exact copy of the open table under a new id and name, without its history", () => {
		const source = activeId();
		useTabeloStore.getState().renameTable("Roster");
		useTabeloStore.getState().applyDocument(roster);
		const column = useTabeloStore.getState().document.columns[0]?.id ?? "";
		useTabeloStore.getState().toggleColumnWrap(column);
		const before = useTabeloStore.getState();
		expect(before.past.length).toBeGreaterThan(0);

		const outcome = before.duplicateTable(source);
		if (outcome.status !== "saved") throw new Error(outcome.status);
		const after = useTabeloStore.getState();
		expect(outcome.tableId).not.toBe(source);
		expect(after.library.activeId).toBe(outcome.tableId);
		expect(after.library.tables.map((table) => table.name)).toEqual([
			"Roster",
			"Roster (copy)",
		]);
		expect(after.name).toBe("Roster (copy)");
		expect(after.document).toEqual(before.document);
		expect(after.workspace).toEqual(before.workspace);
		expect(after.past).toHaveLength(0);
		expect(after.future).toHaveLength(0);
		expect(storedName(outcome.tableId)).toBe("Roster (copy)");
		expect(storedName(source)).toBe("Roster");
		const index = JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? "{}");
		expect(index.activeId).toBe(outcome.tableId);
		expect(index.tables).toHaveLength(2);
	});

	it("keeps the copy independent of its source", () => {
		const source = activeId();
		useTabeloStore.getState().applyDocument(roster);
		useTabeloStore.getState().duplicateTable(source);
		useTabeloStore
			.getState()
			.applyDocument(
				documentFromMatrix([["Name"], ["Mabel"]], { headerRow: true }),
			);
		useTabeloStore.getState().switchTable(source);
		expect(useTabeloStore.getState().document).toEqual(roster);
		expect(useTabeloStore.getState().past.length).toBeGreaterThan(0);
	});

	it("copies a table that is not open from storage and numbers later copies", () => {
		const { first, second } = twoTables();
		useTabeloStore.getState().renameTable("Roster", first);
		useTabeloStore.getState().switchTable(second);
		const outcome = useTabeloStore.getState().duplicateTable(first);
		if (outcome.status !== "saved") throw new Error(outcome.status);
		expect(useTabeloStore.getState().name).toBe("Roster (copy)");
		expect(isDocumentBlank(useTabeloStore.getState().document)).toBe(false);
		const again = useTabeloStore.getState().duplicateTable(first);
		if (again.status !== "saved") throw new Error(again.status);
		expect(useTabeloStore.getState().name).toBe("Roster (copy 2)");
		expect(useTabeloStore.getState().library.tables).toHaveLength(4);
	});

	it("refuses a table the library does not hold", () => {
		expect(useTabeloStore.getState().duplicateTable("missing").status).toBe(
			"missing",
		);
	});

	it("leaves the library and open table untouched when the copy cannot be written", () => {
		const source = activeId();
		useTabeloStore.getState().applyDocument(roster);
		flushPersistence();
		const before = useTabeloStore.getState();
		const raw = localStorage.getItem(LIBRARY_KEY);
		const keys = Object.keys(localStorage);
		const write = localStorage.setItem.bind(localStorage);
		const writes = vi
			.spyOn(window.localStorage, "setItem")
			.mockImplementation((key, value) => {
				if (key !== tableKey(source))
					throw new DOMException("Full", "QuotaExceededError");
				write(key, value);
			});
		expect(before.duplicateTable(source).status).toBe("quota");
		expect(useTabeloStore.getState().library).toBe(before.library);
		expect(useTabeloStore.getState().document).toBe(before.document);
		expect(localStorage.getItem(LIBRARY_KEY)).toBe(raw);
		expect(Object.keys(localStorage).sort()).toEqual(keys.sort());
		writes.mockRestore();
	});

	it("removes the copy's payload when only the index write fails", () => {
		const source = activeId();
		useTabeloStore.getState().applyDocument(roster);
		flushPersistence();
		const before = useTabeloStore.getState();
		const keys = Object.keys(localStorage);
		const write = localStorage.setItem.bind(localStorage);
		const writes = vi
			.spyOn(window.localStorage, "setItem")
			.mockImplementation((key, value) => {
				if (key === LIBRARY_KEY)
					throw new DOMException("Full", "QuotaExceededError");
				write(key, value);
			});
		expect(before.duplicateTable(source).status).toBe("quota");
		expect(useTabeloStore.getState().library).toBe(before.library);
		expect(Object.keys(localStorage).sort()).toEqual(keys.sort());
		writes.mockRestore();
	});
});

describe("reading the library", () => {
	// A damaged table cannot take part in naming, so it never makes a readable
	// table give up its name (#568).
	it("keeps a readable table's stored name beside an unreadable one", () => {
		const readable = JSON.stringify({
			version: CURRENT_VERSION,
			name: DEFAULT_TABLE_NAME,
			document: createEmptyDocument(),
			workspace: createDefaultWorkspace(),
			draft: null,
		});
		localStorage.setItem(tableKey("t_damaged"), "{damaged");
		localStorage.setItem(tableKey("t_readable"), readable);
		localStorage.setItem(
			LIBRARY_KEY,
			JSON.stringify({
				version: LIBRARY_VERSION,
				tables: [
					{ id: "t_damaged", mark: 1 },
					{ id: "t_readable", mark: 2 },
				],
				activeId: "t_readable",
			}),
		);

		useTabeloStore.getState().hydrate();

		expect(useTabeloStore.getState().name).toBe(DEFAULT_TABLE_NAME);
		expect(localStorage.getItem(tableKey("t_readable"))).toBe(readable);
		expect(localStorage.getItem(tableKey("t_damaged"))).toBe("{damaged");
	});
});
