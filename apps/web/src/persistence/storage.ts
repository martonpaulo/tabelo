import type { TableDocument } from "@/core/types";
import type { Workspace } from "@/workspace/layout";
import {
	CURRENT_VERSION,
	LIBRARY_KEY,
	LIBRARY_RECOVERY_KEY,
	type LibraryIndex,
	type PersistedDraft,
	type PersistedState,
	type PersistenceFailureReason,
	tableKey,
	tableRecoveryKey,
	validateLibraryIndex,
	validatePersistedState,
} from "./schema";

// What the app hands over to be saved. Deliberately expressed in the domain's
// own readonly types rather than the schema's inferred ones: persistence
// serves the document, not the other way round.
export interface SavePayload {
	readonly name: string;
	readonly document: TableDocument;
	readonly workspace: Workspace;
	readonly draft: PersistedDraft;
}

// localStorage is the only durable store. Reads are treated as untrusted.
// another tab, an extension, or a half-finished write can all leave something
// unexpected there.

export type StorageLoadOutcome =
	| { readonly status: "empty" }
	| { readonly status: "ok"; readonly state: PersistedState }
	| { readonly status: "unavailable" }
	| {
			readonly status: "unreadable";
			readonly reason: PersistenceFailureReason;
			readonly raw: string;
	  };

// The bytes this tab last read from or wrote to each table key, so a save can
// tell that another tab wrote the table since (#543). A key this tab never
// touched has no entry and nothing to compare against. Only a newer payload
// counts: a key another tab removed is reported by the `storage` event, which
// the browser delivers for removals as well.
const seenTables = new Map<string, string | null>();

export function tableChangedElsewhere(id: string): boolean {
	if (!seenTables.has(id)) return false;
	try {
		const raw = window.localStorage.getItem(tableKey(id));
		return raw !== null && raw !== seenTables.get(id);
	} catch {
		// Blocked storage: the write that follows reports it.
		return false;
	}
}

export function loadTable(id: string): StorageLoadOutcome {
	let raw: string | null;
	try {
		raw = window.localStorage.getItem(tableKey(id));
	} catch {
		// Private browsing and blocked storage both throw here.
		return { status: "unavailable" };
	}
	seenTables.set(id, raw);

	if (raw === null) return { status: "empty" };

	try {
		const outcome = validatePersistedState(JSON.parse(raw));
		return outcome.status === "unreadable" ? { ...outcome, raw } : outcome;
	} catch {
		return {
			status: "unreadable",
			reason: "invalid-json",
			raw,
		};
	}
}

export type SaveOutcome =
	| { readonly status: "saved" }
	| { readonly status: "quota" }
	| { readonly status: "unavailable" };

function classifyWriteFailure(error: unknown): SaveOutcome {
	const quotaExceeded =
		error instanceof DOMException &&
		(error.name === "QuotaExceededError" ||
			error.name === "NS_ERROR_DOM_QUOTA_REACHED");
	return { status: quotaExceeded ? "quota" : "unavailable" };
}

// The part of `Storage` a write needs. Each persisted payload (the table here,
// the preferences in their own store) writes through the two functions below,
// so both classify failures and replace unreadable data the same way.
export interface WritableStorage {
	readonly setItem: (key: string, value: string) => void;
}

export function writeItem(
	storage: WritableStorage,
	key: string,
	value: string,
): SaveOutcome {
	try {
		storage.setItem(key, value);
		return { status: "saved" };
	} catch (error) {
		return classifyWriteFailure(error);
	}
}

export type ReplacementOutcome = SaveOutcome & {
	readonly recoveryPreserved: boolean;
};

// A replacement also reads, to find where its recovery copy can go.
export interface RecoverableStorage extends WritableStorage {
	readonly getItem: (key: string) => string | null;
}

// The keys a payload's recovery copies live under: the plain recovery key,
// then `.2`, `.3` and so on for each later replacement of the same payload.
function numberedRecoveryKey(recoveryKey: string, index: number): string {
	return index === 1 ? recoveryKey : `${recoveryKey}.${index}`;
}

// Where these bytes are, or can go, without overwriting an earlier recovery
// copy (#568). The same bytes already kept are not copied a second time.
function recoveryKeyFor(
	storage: RecoverableStorage,
	recoveryKey: string,
	raw: string,
): string {
	for (let index = 1; ; index += 1) {
		const key = numberedRecoveryKey(recoveryKey, index);
		const held = storage.getItem(key);
		if (held === null || held === raw) return key;
	}
}

// The only way an unreadable payload is ever overwritten: its bytes are
// copied to a recovery key first, never over an earlier copy, and nothing is
// written when that copy fails.
export function preserveRawThenWrite(
	storage: RecoverableStorage,
	recoveryKey: string,
	raw: string,
	write: () => SaveOutcome,
): ReplacementOutcome {
	let key: string;
	try {
		key = recoveryKeyFor(storage, recoveryKey, raw);
	} catch {
		return { status: "unavailable", recoveryPreserved: false };
	}
	const preserved = writeItem(storage, key, raw);
	if (preserved.status !== "saved") {
		return { ...preserved, recoveryPreserved: false };
	}
	return { ...write(), recoveryPreserved: true };
}

// Reaching `window.localStorage` can itself throw when storage is blocked, so
// it is read inside the write rather than before it.
const browserStorage: RecoverableStorage = {
	getItem: (key) => window.localStorage.getItem(key),
	setItem: (key, value) => window.localStorage.setItem(key, value),
};

// The bytes a table is stored as: also what the storage-trouble notice hands
// the user, so the copy keeps everything a save would have (#567).
export function serializeTable(state: SavePayload): string {
	return JSON.stringify({ ...state, version: CURRENT_VERSION });
}

export function saveTable(id: string, state: SavePayload): SaveOutcome {
	const text = serializeTable(state);
	const outcome = writeItem(browserStorage, tableKey(id), text);
	if (outcome.status === "saved") seenTables.set(id, text);
	return outcome;
}

export function preserveUnreadableAndSave(
	id: string,
	raw: string,
	state: SavePayload,
): ReplacementOutcome {
	return preserveRawThenWrite(browserStorage, tableRecoveryKey(id), raw, () =>
		saveTable(id, state),
	);
}

// The index is written on its own, so creating, renaming, reordering, or
// deleting a table never rewrites a document.
export function saveLibraryIndex(index: LibraryIndex): SaveOutcome {
	return writeItem(browserStorage, LIBRARY_KEY, JSON.stringify(index));
}

export type LibraryLoadOutcome =
	| Exclude<StorageLoadOutcome, { status: "ok" }>
	| { readonly status: "ok"; readonly index: LibraryIndex };

export function loadLibraryIndex(): LibraryLoadOutcome {
	let raw: string | null;
	try {
		raw = window.localStorage.getItem(LIBRARY_KEY);
	} catch {
		return { status: "unavailable" };
	}
	if (raw === null) return { status: "empty" };
	try {
		const outcome = validateLibraryIndex(JSON.parse(raw));
		return outcome.status === "ok" ? outcome : { ...outcome, raw };
	} catch {
		return { status: "unreadable", reason: "invalid-json", raw };
	}
}

export function preserveUnreadableLibraryAndSave(
	raw: string,
	index: LibraryIndex,
	activeTable: SavePayload,
): ReplacementOutcome {
	return preserveRawThenWrite(browserStorage, LIBRARY_RECOVERY_KEY, raw, () => {
		// An empty library has no table to write, only the index (#466).
		const saved =
			index.activeId === null
				? ({ status: "saved" } as const)
				: saveTable(index.activeId, activeTable);
		return saved.status === "saved" ? saveLibraryIndex(index) : saved;
	});
}

// A deleted table takes its recovery copies with it: keeping the bytes of a
// table the user chose to delete would be a copy they cannot see.
export function removeTable(id: string): void {
	try {
		window.localStorage.removeItem(tableKey(id));
		for (let index = 1; ; index += 1) {
			const key = numberedRecoveryKey(tableRecoveryKey(id), index);
			if (window.localStorage.getItem(key) === null) break;
			window.localStorage.removeItem(key);
		}
		seenTables.set(id, null);
	} catch {
		// Blocked storage: the entry is gone from the index either way.
	}
}
