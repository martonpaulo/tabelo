// The library is the set of tables this browser holds and which one is
// active. It is domain data, not presentation: the menu lists it, but nothing
// about its order or its size belongs to a component.
//
// A table's document, workspace, and draft stay with that table; the library
// holds only identity and order. One table is always active, so the list is
// never empty while the app is running.

export type TableId = string;

export interface TableEntry {
	readonly id: TableId;
	readonly name: string;
}

export interface TableLibrary {
	readonly tables: readonly TableEntry[];
	readonly activeId: TableId;
}

// Where the library stops being comfortable to read in one menu (owner,
// 2026-09-20). Nothing is refused at this point: storage allows hundreds of
// tables at the supported scale, so the cost of another one is attention, not
// space. The app says so once the list reaches this length and the menu
// scrolls from there.
export const LARGE_LIBRARY_SIZE = 10;

export function isLargeLibrary(library: TableLibrary): boolean {
	return library.tables.length >= LARGE_LIBRARY_SIZE;
}

// Two tables never carry the same name: the list is how a table is chosen,
// and two identical entries make that a guess. A library of one keeps the
// plain default; from the second table on the names are numbered, and the
// first table is numbered with them while it still carries the untouched
// default (owner, 2026-09-20).
export function nameForNewTable(
	library: TableLibrary,
	defaultName: string,
): { readonly name: string; readonly renameFirst: string | null } {
	const renameFirst =
		library.tables.length === 1 && library.tables[0]?.name === defaultName
			? `${defaultName} 1`
			: null;
	const taken = new Set(library.tables.map((table) => table.name));
	if (renameFirst) {
		taken.delete(defaultName);
		taken.add(renameFirst);
	}
	let index = 1;
	while (taken.has(`${defaultName} ${index}`)) index += 1;
	return { name: `${defaultName} ${index}`, renameFirst };
}

// Two tables that already share a name, from before the rule or from a
// payload edited by hand, are numbered apart when the library is read. The
// first keeps what it had; each later one takes the first free number.
export function withUniqueNames(library: TableLibrary): TableLibrary {
	const taken = new Set<string>();
	const tables = library.tables.map((table) => {
		if (!taken.has(table.name)) {
			taken.add(table.name);
			return table;
		}
		let index = 2;
		while (taken.has(`${table.name} ${index}`)) index += 1;
		const name = `${table.name} ${index}`;
		taken.add(name);
		return { ...table, name };
	});
	return { ...library, tables };
}

export function isNameTaken(
	library: TableLibrary,
	name: string,
	exceptId: TableId,
): boolean {
	return library.tables.some(
		(table) => table.id !== exceptId && table.name === name,
	);
}

export function addTable(
	library: TableLibrary,
	entry: TableEntry,
): TableLibrary {
	return {
		tables: [...library.tables, entry],
		activeId: entry.id,
	};
}

export function renameEntry(
	library: TableLibrary,
	id: TableId,
	name: string,
): TableLibrary {
	return {
		...library,
		tables: library.tables.map((table) =>
			table.id === id ? { ...table, name } : table,
		),
	};
}

// Removing the active table moves to its neighbour, the one after it when
// there is one, so the list does not jump to the top. The caller keeps the
// last table rather than removing it: a library with no table has no active
// document to show.
export function removeTable(
	library: TableLibrary,
	id: TableId,
): TableLibrary | null {
	if (library.tables.length < 2) return null;
	const index = library.tables.findIndex((table) => table.id === id);
	if (index === -1) return library;
	const tables = library.tables.filter((table) => table.id !== id);
	if (id !== library.activeId) return { ...library, tables };
	const next = tables[Math.min(index, tables.length - 1)];
	return { tables, activeId: next?.id ?? tables[0]?.id ?? library.activeId };
}
