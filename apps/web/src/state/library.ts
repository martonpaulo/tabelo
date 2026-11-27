import type { StoreApi } from "zustand";
import { DEFAULT_TABLE_NAME } from "@/copy/product";
import { createEmptyDocument, isDocumentBlank } from "@/core/document";
import { createTableId } from "@/core/ids";
import { createSelection } from "@/core/selection";
import {
	addTable,
	isNameTaken,
	mergeStoredEntries,
	nameApart,
	nameForDuplicate,
	nameForNewTable,
	nextTableMark,
	removeTable,
	renameEntry,
	TABLE_MARKS,
	type TableId,
	type TableLibrary,
	type TableMark,
	withUniqueNames,
} from "@/core/table-library";
import { validateTableName } from "@/core/table-name";
import type { TableDocument } from "@/core/types";
import {
	type HistoryEntry,
	reconcileColumnPreferences,
} from "@/history/timeline";
import {
	type BackupTable,
	parseBackup,
	serializeBackup,
} from "@/persistence/backup";
import { LIBRARY_VERSION, type LibraryIndex } from "@/persistence/schema";
import {
	loadLibraryIndex,
	loadTable,
	preserveUnreadableAndSave,
	preserveUnreadableLibraryAndSave,
	removeTable as removeStoredTable,
	type SavePayload,
	type StorageLoadOutcome,
	saveLibraryIndex,
	saveTable,
} from "@/persistence/storage";
import { flushStore, savePayload, storageBlocksWrites } from "@/state/autosave";
import { NO_COPIED_RANGES, NO_FINDS } from "@/state/empty-state";
import { deriveDraft } from "@/sync/draft";
import { createDefaultWorkspace } from "@/workspace/layout";
import type { StorageIssue, TabeloState } from "./store";

// The table library: reading it from storage, the transitions that add,
// copy, open, rename and delete its tables, recovery from an unreadable
// payload, and the undo history each table left this session keeps. The
// store composes these actions unchanged; this module owns the rules and the
// session state they keep outside the store (#564).

type TabeloStore = Pick<StoreApi<TabeloState>, "getState" | "setState">;

type LibrarySlice = Pick<
	TabeloState,
	| "hydrate"
	| "replaceUnreadableStorage"
	| "renameTable"
	| "createTable"
	| "duplicateTable"
	| "documentForTable"
	| "switchTable"
	| "deleteTable"
	| "ensureActiveTable"
	| "backupLibrary"
	| "restoreLibrary"
>;

// Reading the library means reading each table's own payload for its name:
// the index holds identity, order and mark only, so the name a table shows is the
// name that table stores, and the two can never disagree. An empty browser,
// or an index nothing can be read from, starts with one table.
function readLibrary(
	fallback: TableLibrary,
	index: LibraryIndex | null,
): TableLibrary {
	// No index yet: the library this session started with is the library, so
	// the table it already holds keeps the key a save would have written to.
	if (!index) return fallback;
	const tables = index.tables.map(({ id, mark }) => {
		const outcome = loadTable(id);
		return {
			id,
			mark,
			name: outcome.status === "ok" ? outcome.state.name : DEFAULT_TABLE_NAME,
			state: outcome.status === "ok" ? outcome.state : null,
		};
	});
	// Only names two readable payloads store take part in numbering. A table
	// that cannot be read shows the default as a placeholder it never stores,
	// so it cannot make a readable table give up its name (#568).
	const unique = withUniqueNames({
		tables: tables
			.filter((table) => table.state !== null)
			.map(({ id, name, mark }) => ({ id, name, mark })),
		activeId: index.activeId,
	});
	const library = {
		tables: tables.map(
			({ id, name, mark }) =>
				unique.tables.find((entry) => entry.id === id) ?? { id, name, mark },
		),
		activeId: index.activeId,
	};
	// A name this read had to change belongs to that table, so it is written
	// back rather than shown differently from what is stored.
	for (const entry of unique.tables) {
		const source = tables.find((table) => table.id === entry.id);
		if (!source?.state || source.name === entry.name) continue;
		saveTable(entry.id, { ...source.state, name: entry.name });
	}
	return library;
}

export function newLibrary(): TableLibrary {
	const id = createTableId();
	return {
		tables: [{ id, name: DEFAULT_TABLE_NAME, mark: TABLE_MARKS[0] }],
		activeId: id,
	};
}

function entryName(library: TableLibrary, id: TableId | null): string {
	return (
		library.tables.find((table) => table.id === id)?.name ?? DEFAULT_TABLE_NAME
	);
}

// The tables the stored index held when this tab last read or wrote it, so
// an index write can tell another tab's additions and removals from its own
// (#543). Empty before anything was read, which makes a merge keep every
// stored table rather than guess that one was removed.
let indexBase: ReadonlySet<TableId> = new Set();

function rememberIndex(library: TableLibrary): void {
	indexBase = new Set(library.tables.map((table) => table.id));
}

type IndexWrite =
	| { readonly status: "saved"; readonly library: TableLibrary }
	| { readonly status: "quota" | "unavailable" | "blocked" };

// Every index write reads the stored index first and keeps what another tab
// added there, so two tabs creating tables in turn both keep theirs (#543).
// The library it returns is the one written, which the caller adopts. A
// stored index this build cannot read, from a newer or older tab, is never
// written over: it is reported the way hydration reports it, and kept.
function writeLibraryIndex(
	store: TabeloStore,
	library: TableLibrary,
): IndexWrite {
	const stored = loadLibraryIndex();
	if (stored.status === "unreadable") {
		store.setState({
			storageIssue: {
				kind: "unreadable",
				scope: "library",
				reason: stored.reason,
				raw: stored.raw,
			},
		});
		return { status: "blocked" };
	}
	const merged =
		stored.status === "ok"
			? mergeStoredEntries(library, stored.index.tables, indexBase, (id) => {
					const outcome = loadTable(id);
					return outcome.status === "ok"
						? outcome.state.name
						: DEFAULT_TABLE_NAME;
				})
			: library;
	const saved = saveLibraryIndex({
		version: LIBRARY_VERSION,
		tables: merged.tables.map(({ id, mark }) => ({ id, mark })),
		activeId: merged.activeId,
	});
	if (saved.status !== "saved") return saved;
	rememberIndex(merged);
	return { status: "saved", library: merged };
}

// What a failed index write leaves to report. A refusal has already said why.
function indexFailure(
	store: TabeloStore,
	outcome: Exclude<IndexWrite, { status: "saved" }>,
): StorageIssue | null {
	return outcome.status === "blocked"
		? store.getState().storageIssue
		: { kind: outcome.status };
}

// The state a table starts from, and the state switching to an unreadable or
// missing table falls back to. History belongs to the table being left, so it
// never follows the user into another one.
function blankTableState(name: string) {
	return {
		name,
		document: createEmptyDocument(),
		workspace: createDefaultWorkspace(),
		draft: null,
		hasHeldContent: false,
		past: [],
		future: [],
		selection: createSelection({ row: 0, column: 0 }),
		editing: null,
		editingSeed: null,
		editingHeader: null,
		copiedRanges: NO_COPIED_RANGES,
		insertedAxis: null,
		fillSeriesOffer: null,
		finds: NO_FINDS,
		pendingImport: null,
		pendingPaneAction: null,
		inputError: null,
	};
}

// The undo timeline of every table left during this browser session, so
// returning to one restores its history. It stays in memory, like the active
// table's own history, and is kept beside the document it was recorded
// against: a table whose stored document no longer matches that one returns
// without history rather than with steps that would rewrite other content.
type RetainedSession = {
	readonly document: TableDocument;
	readonly past: readonly HistoryEntry[];
	readonly future: readonly HistoryEntry[];
	readonly hasHeldContent: boolean;
};
const retainedSessions = new Map<TableId, RetainedSession>();

// Forgets everything this module keeps outside the store: every retained
// session and the index this tab last read. Hydration starts from it, and a
// test calls it, since replacing the store's state reaches neither (#564).
export function resetLibrarySession(): void {
	retainedSessions.clear();
	indexBase = new Set();
}

// Called while the store still shows the table being left, after it was
// written, so the retained document is the one storage now holds.
function retainActiveSession(state: TabeloState): void {
	if (state.library.activeId === null) return;
	retainedSessions.set(state.library.activeId, {
		document: state.document,
		past: state.past,
		future: state.future,
		hasHeldContent: state.hasHeldContent,
	});
}

function takeRetainedSession(
	id: TableId,
	document: TableDocument,
): RetainedSession | null {
	const retained = retainedSessions.get(id);
	retainedSessions.delete(id);
	if (!retained) return null;
	return sameValue(retained.document, document) ? retained : null;
}

// Structural equality over the plain data a stored document parses into.
function sameValue(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	const aKeys = Object.keys(a);
	const bRecord = b as Record<string, unknown>;
	if (aKeys.length !== Object.keys(b).length) return false;
	const aRecord = a as Record<string, unknown>;
	return aKeys.every(
		(key) => key in bRecord && sameValue(aRecord[key], bRecord[key]),
	);
}

// Reads the library's active table into the store, or starts that table
// blank when its payload is missing or unreadable. The index is the caller's
// to write: switching and deleting both change it, and both land here.
function openTable(
	store: TabeloStore,
	library: TableLibrary,
	outcome: StorageLoadOutcome = library.activeId === null
		? { status: "empty" }
		: loadTable(library.activeId),
): void {
	const id = library.activeId;
	if (id === null || outcome.status !== "ok") {
		store.setState({
			library,
			...blankTableState(entryName(library, id)),
			storageIssue:
				outcome.status === "unreadable"
					? { kind: "unreadable", reason: outcome.reason, raw: outcome.raw }
					: outcome.status === "unavailable"
						? { kind: "unavailable", readBlocked: true }
						: null,
		});
		return;
	}
	const workspace = reconcileColumnPreferences(
		outcome.state.workspace,
		outcome.state.document,
	);
	const retained = takeRetainedSession(id, outcome.state.document);
	store.setState({
		library: renameEntry(library, id, outcome.state.name),
		...blankTableState(outcome.state.name),
		document: outcome.state.document,
		workspace,
		draft: outcome.state.draft
			? deriveDraft(outcome.state.draft, workspace)
			: null,
		hasHeldContent:
			(retained?.hasHeldContent ?? false) ||
			!isDocumentBlank(outcome.state.document),
		past: retained?.past ?? [],
		future: retained?.future ?? [],
		storageIssue: null,
	});
}

// What a stored table already holds, for a change that touches one field of a
// table the store is not showing. Null when nothing readable is there.
function storedPayload(id: TableId): SavePayload | null {
	const outcome = loadTable(id);
	return outcome.status === "ok" ? outcome.state : null;
}

export function createLibrarySlice(store: TabeloStore): LibrarySlice {
	const set = store.setState;
	const get = store.getState;
	return {
		hydrate: () => {
			resetLibrarySession();
			const session = get().library;
			const loadedIndex = loadLibraryIndex();
			if (loadedIndex.status === "unreadable") {
				set({
					storageIssue: {
						kind: "unreadable",
						scope: "library",
						reason: loadedIndex.reason,
						raw: loadedIndex.raw,
					},
				});
				return;
			}
			if (loadedIndex.status === "unavailable") {
				set({ storageIssue: { kind: "unavailable", readBlocked: true } });
				return;
			}
			let library = readLibrary(
				session,
				loadedIndex.status === "ok" ? loadedIndex.index : null,
			);
			if (loadedIndex.status === "ok") rememberIndex(library);
			// A browser with no index gets one now, so the table this session is
			// about to write is in the library rather than becoming an orphan key.
			if (loadedIndex.status === "empty") {
				const saved = writeLibraryIndex(store, library);
				if (saved.status !== "saved") {
					set({ storageIssue: indexFailure(store, saved) });
					return;
				}
				library = saved.library;
			}
			// The table this session minted before reading storage belongs to no
			// library once the stored one arrives. A save between the first render
			// and this point would have left its key behind, unreachable from any
			// list, so it goes with the state it belonged to.
			if (
				session.activeId !== null &&
				!library.tables.some((table) => table.id === session.activeId)
			) {
				removeStoredTable(session.activeId);
			}
			set({ library, name: entryName(library, library.activeId) });
			// A library with no table opens on the welcome surface (#466).
			if (library.activeId === null) {
				set({ ...blankTableState(DEFAULT_TABLE_NAME), storageIssue: null });
				return;
			}
			const outcome = loadTable(library.activeId);
			if (outcome.status === "ok") {
				const workspace = reconcileColumnPreferences(
					outcome.state.workspace,
					outcome.state.document,
				);
				set({
					name: outcome.state.name,
					document: outcome.state.document,
					workspace,
					draft: outcome.state.draft
						? deriveDraft(outcome.state.draft, workspace)
						: null,
					hasHeldContent: !isDocumentBlank(outcome.state.document),
					past: [],
					future: [],
					storageIssue: null,
					pendingImport: null,
					inputError: null,
					pendingPaneAction: null,
					finds: NO_FINDS,
					selection: createSelection({ row: 0, column: 0 }),
				});
				return;
			}
			if (outcome.status === "unavailable") {
				set({ storageIssue: { kind: "unavailable", readBlocked: true } });
				return;
			}
			if (outcome.status === "unreadable") {
				// The stored payload stays untouched so it can be recovered by hand.
				set({
					storageIssue: {
						kind: "unreadable",
						reason: outcome.reason,
						raw: outcome.raw,
					},
				});
			} else {
				set({ storageIssue: null });
			}
		},

		replaceUnreadableStorage: () => {
			const state = get();
			if (state.storageIssue?.kind !== "unreadable") return false;
			const activeId = state.library.activeId;
			const writesIndex =
				state.storageIssue.scope === "library" || activeId === null;
			const outcome = writesIndex
				? preserveUnreadableLibraryAndSave(
						state.storageIssue.raw,
						{
							version: LIBRARY_VERSION,
							tables: state.library.tables.map(({ id, mark }) => ({
								id,
								mark,
							})),
							activeId: state.library.activeId,
						},
						savePayload(state),
					)
				: preserveUnreadableAndSave(
						activeId,
						state.storageIssue.raw,
						savePayload(state),
					);
			if (outcome.status === "saved") {
				if (writesIndex) rememberIndex(state.library);
				set({ storageIssue: null });
				return true;
			}
			if (outcome.recoveryPreserved && state.storageIssue.scope !== "library") {
				set({ storageIssue: { kind: outcome.status } });
				return false;
			}
			set({
				storageIssue: {
					...state.storageIssue,
					replacementFailure: outcome.status,
				},
			});
			return false;
		},

		renameTable: (name, id) => {
			const validated = validateTableName(name);
			if (!validated.ok) return { status: "invalid" };
			const state = get();
			const targetId = id ?? state.library.activeId;
			if (targetId === null) return { status: "blocked" };
			const entry = state.library.tables.find((table) => table.id === targetId);
			if (!entry) return { status: "blocked" };
			const active = targetId === state.library.activeId;
			if (storageBlocksWrites(state.storageIssue)) {
				return { status: "blocked" };
			}
			if (validated.name === entry.name) return { status: "saved" };
			if (isNameTaken(state.library, validated.name, targetId)) {
				return { status: "duplicate" };
			}
			// A table's name lives in that table's own payload, so renaming one the
			// workspace is not showing reads its payload and writes it back. A
			// payload that is missing or unreadable is left alone: overwriting it
			// here would lose the table to rename it.
			const payload = active ? savePayload(state) : storedPayload(targetId);
			if (!payload) return { status: "blocked" };
			const outcome = saveTable(targetId, { ...payload, name: validated.name });
			if (outcome.status === "saved") {
				set({
					...(active ? { name: validated.name } : {}),
					library: renameEntry(state.library, targetId, validated.name),
					storageIssue: null,
				});
			} else {
				set({ storageIssue: { kind: outcome.status } });
			}
			return outcome;
		},

		createTable: (requestedName) => {
			const state = get();
			if (storageBlocksWrites(state.storageIssue)) return { status: "blocked" };
			const named =
				requestedName === undefined ? null : validateTableName(requestedName);
			if (named && !named.ok) return { status: "invalid" };
			if (
				named?.ok &&
				state.library.tables.some((table) => table.name === named.name)
			)
				return { status: "duplicate" };
			const flushed = flushStore(store);
			if (flushed.status !== "saved") return flushed;
			const { name, renameFirst } = named?.ok
				? { name: named.name, renameFirst: null }
				: nameForNewTable(state.library, DEFAULT_TABLE_NAME);
			const entry = {
				id: createTableId(),
				name,
				mark: nextTableMark(state.library),
			};
			// Numbering the first table is a change to that table's own payload, so
			// it is written before the library moves on to the new one.
			const activeId = state.library.activeId;
			if (renameFirst && activeId !== null) {
				const renamed = saveTable(activeId, {
					...savePayload(state),
					name: renameFirst,
				});
				if (renamed.status !== "saved") {
					set({ storageIssue: { kind: renamed.status } });
					return renamed;
				}
				set({
					name: renameFirst,
					library: renameEntry(state.library, activeId, renameFirst),
				});
			}
			const library = addTable(
				renameFirst && activeId !== null
					? renameEntry(state.library, activeId, renameFirst)
					: state.library,
				entry,
			);
			const blank = blankTableState(entry.name);
			const saved = saveTable(entry.id, blank);
			if (saved.status !== "saved") {
				set({ storageIssue: { kind: saved.status } });
				return saved;
			}
			const indexed = writeLibraryIndex(store, library);
			if (indexed.status !== "saved") {
				// This key was allocated for this failed creation and contains no user edits.
				removeStoredTable(entry.id);
				set({ storageIssue: indexFailure(store, indexed) });
				return indexed;
			}
			retainActiveSession(get());
			set({ library: indexed.library, ...blank, storageIssue: null });
			return { status: "saved", tableId: entry.id };
		},

		duplicateTable: (id) => {
			const state = get();
			const source = state.library.tables.find((table) => table.id === id);
			if (!source) return { status: "missing" };
			if (storageBlocksWrites(state.storageIssue)) return { status: "blocked" };
			// The open table is written first, so the copy of it is the content on
			// screen and leaving it for the copy cannot lose an edit.
			const flushed = flushStore(store);
			if (flushed.status !== "saved") return flushed;
			// A payload that is missing or unreadable has nothing to copy, and a
			// blank table under the copy's name would claim otherwise.
			const payload =
				id === state.library.activeId ? savePayload(get()) : storedPayload(id);
			if (!payload) return { status: "blocked" };
			const entry = {
				id: createTableId(),
				name: nameForDuplicate(state.library, source.name),
				mark: nextTableMark(state.library),
			};
			const copied = { ...payload, name: entry.name };
			const library = addTable(state.library, entry);
			const saved = saveTable(entry.id, copied);
			if (saved.status !== "saved") {
				set({ storageIssue: { kind: saved.status } });
				return saved;
			}
			const indexed = writeLibraryIndex(store, library);
			if (indexed.status !== "saved") {
				// This key was allocated for this failed copy and holds nothing else.
				removeStoredTable(entry.id);
				set({ storageIssue: indexFailure(store, indexed) });
				return indexed;
			}
			retainActiveSession(get());
			// Opened from what was just stored, the way switching opens a table, so
			// the copy on screen is the copy a reload reads.
			openTable(store, indexed.library);
			return { status: "saved", tableId: entry.id };
		},

		documentForTable: (id) => {
			const state = get();
			if (id === state.library.activeId) return state.document;
			const outcome = loadTable(id);
			return outcome.status === "ok" ? outcome.state.document : null;
		},

		switchTable: (id) => {
			const state = get();
			if (id === state.library.activeId) return { status: "unchanged" };
			if (!state.library.tables.some((table) => table.id === id))
				return { status: "missing" };
			if (storageBlocksWrites(state.storageIssue)) return { status: "blocked" };
			// The table being left is written before the other one is read, so a
			// switch can never be the step that loses an edit.
			const flushed = flushStore(store);
			if (flushed.status !== "saved") return flushed;
			const loaded = loadTable(id);
			if (loaded.status === "unavailable") {
				set({ storageIssue: { kind: "unavailable" } });
				return { status: "unavailable" };
			}
			const library = { ...state.library, activeId: id };
			const indexed = writeLibraryIndex(store, library);
			if (indexed.status !== "saved") {
				set({ storageIssue: indexFailure(store, indexed) });
				return indexed;
			}
			retainActiveSession(get());
			openTable(store, indexed.library, loaded);
			return { status: "saved", tableId: id };
		},

		deleteTable: (id) => {
			const state = get();
			if (!state.library.tables.some((table) => table.id === id)) return;
			// An unreadable or newer library is preserved raw until the user
			// replaces it; deleting would overwrite it with an index that names
			// none of the stored tables (#544).
			if (storageBlocksWrites(state.storageIssue)) return;
			const library = removeTable(state.library, id);
			// The index is written first, so a refused write leaves the table and
			// the library exactly as they were rather than half deleted.
			const indexed = writeLibraryIndex(store, library);
			if (indexed.status !== "saved") {
				set({ storageIssue: indexFailure(store, indexed) });
				return;
			}
			// Nothing is flushed here: the table being deleted must not be written
			// back on its way out. Deleting the last table leaves the library empty
			// and the store on a blank table no key holds (#466).
			removeStoredTable(id);
			retainedSessions.delete(id);
			if (id === state.library.activeId) openTable(store, indexed.library);
			else set({ library: indexed.library });
		},

		ensureActiveTable: () => {
			const state = get();
			if (state.library.activeId !== null) return { status: "unchanged" };
			if (storageBlocksWrites(state.storageIssue)) return { status: "blocked" };
			const entry = {
				id: createTableId(),
				name: DEFAULT_TABLE_NAME,
				mark: nextTableMark(state.library),
			};
			const library = addTable(state.library, entry);
			const saved = saveTable(entry.id, {
				...savePayload(state),
				name: entry.name,
			});
			if (saved.status !== "saved") {
				set({ storageIssue: { kind: saved.status } });
				return saved;
			}
			const indexed = writeLibraryIndex(store, library);
			if (indexed.status !== "saved") {
				removeStoredTable(entry.id);
				set({ storageIssue: indexFailure(store, indexed) });
				return indexed;
			}
			set({ library: indexed.library, name: entry.name, storageIssue: null });
			return { status: "saved", tableId: entry.id };
		},

		// Nothing is flushed first: a backup is most needed when storage refuses
		// writes, so the open table comes from memory and the others from their
		// keys.
		backupLibrary: () => {
			const state = get();
			const tables: BackupTable[] = [];
			let skipped = 0;
			for (const entry of state.library.tables) {
				const payload =
					entry.id === state.library.activeId
						? savePayload(state)
						: storedPayload(entry.id);
				if (payload) tables.push({ mark: entry.mark, state: payload });
				else skipped += 1;
			}
			if (tables.length === 0) return { status: "empty" };
			return {
				status: "saved",
				text: serializeBackup(tables),
				tables: tables.length,
				skipped,
			};
		},

		// Every table is validated before the first write, each is written
		// before the index that names it, and a refused write removes the keys
		// this restore wrote, so a failure leaves the library as it was.
		restoreLibrary: (text) => {
			const state = get();
			if (storageBlocksWrites(state.storageIssue)) return { status: "blocked" };
			const parsed = parseBackup(text);
			if (parsed.status === "invalid") return parsed;
			const taken = new Set(state.library.tables.map((table) => table.name));
			const written: TableId[] = [];
			const undo = () => {
				for (const id of written) removeStoredTable(id);
			};
			const added: { id: TableId; name: string; mark: TableMark }[] = [];
			for (const table of parsed.tables) {
				const entry = {
					id: createTableId(),
					name: nameApart(taken, table.state.name),
					mark: table.mark,
				};
				taken.add(entry.name);
				const saved = saveTable(entry.id, { ...table.state, name: entry.name });
				if (saved.status !== "saved") {
					undo();
					return saved;
				}
				written.push(entry.id);
				added.push(entry);
			}
			// The open table stays open. An empty library opens the first restored
			// table, the way content arriving there gets a table of its own (#466).
			const opensFirst = state.library.activeId === null;
			const library = {
				tables: [...state.library.tables, ...added],
				activeId: opensFirst ? (written[0] ?? null) : state.library.activeId,
			};
			const indexed = writeLibraryIndex(store, library);
			if (indexed.status !== "saved") {
				undo();
				return indexed;
			}
			if (opensFirst) openTable(store, indexed.library);
			else set({ library: indexed.library });
			return { status: "saved", tables: written.length };
		},
	};
}
