// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { documentFromMatrix } from "@/core/document";
import { LIBRARY_KEY, tableKey } from "@/persistence/schema";
import { flushPersistence, startAutosave, useTabeloStore } from "./store";

// Two tabs of the app share one localStorage and nothing else (#543). A
// second tab is a second, freshly imported copy of the store module, so its
// memory starts from what storage holds, the way a real tab's does.
async function openSecondTab() {
	vi.resetModules();
	return import("./store");
}

const initial = useTabeloStore.getInitialState();
let stopAutosave: (() => void) | null = null;
beforeEach(() => {
	localStorage.clear();
	useTabeloStore.setState(initial, true);
});
afterEach(() => {
	stopAutosave?.();
	stopAutosave = null;
});

function storedIndexIds(): string[] {
	const index = JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? "{}");
	return index.tables.map((entry: { id: string }) => entry.id);
}

function activeId(): string {
	const id = useTabeloStore.getState().library.activeId;
	if (id === null) throw new Error("no active table");
	return id;
}

describe("two tabs share one library", () => {
	it("keeps both tabs' new tables in the stored index", async () => {
		useTabeloStore.getState().hydrate();
		const first = activeId();
		flushPersistence();
		const other = await openSecondTab();
		other.useTabeloStore.getState().hydrate();

		const mine = useTabeloStore.getState().createTable("Cities");
		const theirs = other.useTabeloStore.getState().createTable("Roles");
		if (mine.status !== "saved" || theirs.status !== "saved")
			throw new Error("a table was not created");

		expect(storedIndexIds().sort()).toEqual(
			[first, mine.tableId, theirs.tableId].sort(),
		);
		// The tab that wrote last also lists the table the other one added.
		expect(
			other.useTabeloStore
				.getState()
				.library.tables.map((table) => table.id)
				.sort(),
		).toEqual([first, mine.tableId, theirs.tableId].sort());
		// A later write from the first tab keeps the second tab's table too.
		useTabeloStore.getState().switchTable(first);
		expect(storedIndexIds()).toContain(theirs.tableId);
	});

	it("does not bring back a table the other tab deleted", async () => {
		useTabeloStore.getState().hydrate();
		const first = activeId();
		const created = useTabeloStore.getState().createTable();
		if (created.status !== "saved") throw new Error("not created");
		const other = await openSecondTab();
		other.useTabeloStore.getState().hydrate();

		other.useTabeloStore.getState().deleteTable(first);
		useTabeloStore.getState().createTable();

		expect(storedIndexIds()).not.toContain(first);
		expect(storedIndexIds()).toContain(created.tableId);
	});

	it("never writes a table over a newer copy another tab saved", async () => {
		useTabeloStore.getState().hydrate();
		const id = activeId();
		flushPersistence();
		const other = await openSecondTab();
		other.useTabeloStore.getState().hydrate();
		other.useTabeloStore
			.getState()
			.applyDocument(
				documentFromMatrix([["Name"], ["Ingrid"]], { headerRow: true }),
			);
		expect(other.flushPersistence().status).toBe("saved");
		const theirs = localStorage.getItem(tableKey(id));

		useTabeloStore
			.getState()
			.applyDocument(
				documentFromMatrix([["Name"], ["Paulo"]], { headerRow: true }),
			);
		expect(flushPersistence().status).toBe("blocked");
		expect(localStorage.getItem(tableKey(id))).toBe(theirs);
		expect(useTabeloStore.getState().storageIssue?.kind).toBe(
			"changed-elsewhere",
		);
	});

	it("stops writing once another tab changes the library or the open table", () => {
		useTabeloStore.getState().hydrate();
		const id = activeId();
		for (const key of [LIBRARY_KEY, tableKey(id), null]) {
			useTabeloStore.setState({ storageIssue: null });
			stopAutosave = startAutosave();
			window.dispatchEvent(new StorageEvent("storage", { key }));
			expect(useTabeloStore.getState().storageIssue?.kind).toBe(
				"changed-elsewhere",
			);
			expect(flushPersistence().status).toBe("blocked");
			expect(useTabeloStore.getState().createTable().status).toBe("blocked");
			stopAutosave();
			stopAutosave = null;
		}
	});

	it("keeps writing when another tab changes something this tab does not hold", () => {
		useTabeloStore.getState().hydrate();
		stopAutosave = startAutosave();
		for (const key of ["tabelo.preferences", tableKey("t_elsewhere")])
			window.dispatchEvent(new StorageEvent("storage", { key }));
		expect(useTabeloStore.getState().storageIssue).toBeNull();
		expect(flushPersistence().status).toBe("saved");
	});
});
