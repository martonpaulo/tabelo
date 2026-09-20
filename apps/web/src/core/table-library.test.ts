import { describe, expect, it } from "vitest";
import {
	addTable,
	isLargeLibrary,
	isNameTaken,
	LARGE_LIBRARY_SIZE,
	nameForNewTable,
	removeTable,
	renameEntry,
	type TableLibrary,
} from "./table-library";

const DEFAULT_NAME = "Untitled table";

function libraryOf(...names: readonly string[]): TableLibrary {
	const tables = names.map((name, index) => ({ id: `t${index}`, name }));
	return { tables, activeId: tables[0]?.id ?? "" };
}

describe("naming a new table", () => {
	it("numbers the first table when the second one arrives", () => {
		expect(nameForNewTable(libraryOf(DEFAULT_NAME), DEFAULT_NAME)).toEqual({
			name: "Untitled table 2",
			renameFirst: "Untitled table 1",
		});
	});

	it("leaves a named first table alone and numbers from one", () => {
		expect(nameForNewTable(libraryOf("Roster"), DEFAULT_NAME)).toEqual({
			name: "Untitled table 1",
			renameFirst: null,
		});
	});

	it("skips the numbers already in use", () => {
		expect(
			nameForNewTable(
				libraryOf("Untitled table 1", "Roster", "Untitled table 2"),
				DEFAULT_NAME,
			),
		).toEqual({ name: "Untitled table 3", renameFirst: null });
	});
});

describe("the library", () => {
	it("reports a name another table already carries", () => {
		const library = libraryOf("Roster", "Budget");
		expect(isNameTaken(library, "Budget", "t0")).toBe(true);
		expect(isNameTaken(library, "Budget", "t1")).toBe(false);
	});

	it("makes a table it adds the active one", () => {
		const library = addTable(libraryOf("Roster"), { id: "t9", name: "Budget" });
		expect(library.activeId).toBe("t9");
		expect(library.tables.map((table) => table.name)).toEqual([
			"Roster",
			"Budget",
		]);
	});

	it("renames one entry and leaves the rest as they were", () => {
		const library = renameEntry(libraryOf("Roster", "Budget"), "t1", "Costs");
		expect(library.tables.map((table) => table.name)).toEqual([
			"Roster",
			"Costs",
		]);
	});

	it("moves to the next table when the active one is removed", () => {
		const library = removeTable(libraryOf("A", "B", "C"), "t0");
		expect(library?.activeId).toBe("t1");
		expect(library?.tables.map((table) => table.name)).toEqual(["B", "C"]);
	});

	it("keeps the active table when another one is removed", () => {
		const library = removeTable(libraryOf("A", "B"), "t1");
		expect(library?.activeId).toBe("t0");
	});

	// The app always shows a table, so the caller empties the last one instead.
	it("refuses to remove the only table", () => {
		expect(removeTable(libraryOf("A"), "t0")).toBeNull();
	});

	it("calls the library large at the size the menu starts scrolling", () => {
		const names = Array.from({ length: LARGE_LIBRARY_SIZE }, (_, i) => `T${i}`);
		expect(isLargeLibrary(libraryOf(...names.slice(0, -1)))).toBe(false);
		expect(isLargeLibrary(libraryOf(...names))).toBe(true);
	});
});
