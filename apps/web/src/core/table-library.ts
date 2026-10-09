// The library is the set of tables this browser holds and which one is
// active. It is domain data, not presentation: the menu lists it, but nothing
// about its order or its size belongs to a component.
//
// A table's document, workspace, and draft stay with that table; the library
// holds identity, order, and the colour of each table's mark. The library may
// hold no table at all: deleting the last one leaves nothing active and the app
// shows the welcome surface (#466).

export type TableId = string;

// The colour of a table's mark, one of the six table mark tokens. It is
// stored with the table rather than read off its place in the list, so adding
// or deleting another table never repaints this one (#465).
export const TABLE_MARKS = [1, 2, 3, 4, 5, 6] as const;
export type TableMark = (typeof TABLE_MARKS)[number];

export interface TableEntry {
	readonly id: TableId;
	readonly name: string;
	readonly mark: TableMark;
}

export interface TableLibrary {
	readonly tables: readonly TableEntry[];
	// Null exactly when `tables` is empty.
	readonly activeId: TableId | null;
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

// The `!` is deliberate: a menu item paints every descendant with the
// highlight colour on hover and focus, and the mark must not change with the
// pointer, since it says which table the row is (owner, 2026-09-20).
const TABLE_MARK_CLASSES: Readonly<Record<TableMark, string>> = {
	1: "text-table-mark-1!",
	2: "text-table-mark-2!",
	3: "text-table-mark-3!",
	4: "text-table-mark-4!",
	5: "text-table-mark-5!",
	6: "text-table-mark-6!",
};

export function tableMarkClass(mark: TableMark): string {
	return TABLE_MARK_CLASSES[mark];
}

// The mark a table shows by its place in the list, the rule before #465. It
// survives only as the migration that lets a saved table keep the colour it
// already showed.
export function markForPosition(position: number): TableMark {
	const cycle = TABLE_MARKS.length;
	return TABLE_MARKS[((position % cycle) + cycle) % cycle] ?? TABLE_MARKS[0];
}

// A new table takes the first mark no table uses. Once all six are taken the
// colour repeats, so it identifies a table only together with its name: the
// new one takes the mark the fewest tables share, the first such in order.
export function nextTableMark(library: TableLibrary): TableMark {
	const counts = new Map<TableMark, number>(
		TABLE_MARKS.map((mark) => [mark, 0]),
	);
	for (const table of library.tables)
		counts.set(table.mark, (counts.get(table.mark) ?? 0) + 1);
	let best: TableMark = TABLE_MARKS[0];
	for (const mark of TABLE_MARKS)
		if ((counts.get(mark) ?? 0) < (counts.get(best) ?? 0)) best = mark;
	return best;
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
// there is one, so the list does not jump to the top. Removing the last table
// leaves an empty library with nothing active (#466).
export function removeTable(library: TableLibrary, id: TableId): TableLibrary {
	const index = library.tables.findIndex((table) => table.id === id);
	if (index === -1) return library;
	const tables = library.tables.filter((table) => table.id !== id);
	if (id !== library.activeId) return { ...library, tables };
	const next = tables[Math.min(index, tables.length - 1)];
	return { tables, activeId: next?.id ?? null };
}
