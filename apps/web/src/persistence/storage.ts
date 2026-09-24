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

export function loadTable(id: string): StorageLoadOutcome {
	let raw: string | null;
	try {
		raw = window.localStorage.getItem(tableKey(id));
	} catch {
		// Private browsing and blocked storage both throw here.
		return { status: "unavailable" };
	}

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

// The only way an unreadable payload is ever overwritten: its bytes are
// copied to the recovery key first, and nothing is written when that copy
// fails.
export function preserveRawThenWrite(
	storage: WritableStorage,
	recoveryKey: string,
	raw: string,
	write: () => SaveOutcome,
): ReplacementOutcome {
	const preserved = writeItem(storage, recoveryKey, raw);
	if (preserved.status !== "saved") {
		return { ...preserved, recoveryPreserved: false };
	}
	return { ...write(), recoveryPreserved: true };
}

// Reaching `window.localStorage` can itself throw when storage is blocked, so
// it is read inside the write rather than before it.
const browserStorage: WritableStorage = {
	setItem: (key, value) => window.localStorage.setItem(key, value),
};

export function saveTable(id: string, state: SavePayload): SaveOutcome {
	const payload = { ...state, version: CURRENT_VERSION };
	return writeItem(browserStorage, tableKey(id), JSON.stringify(payload));
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
		const saved = saveTable(index.activeId, activeTable);
		return saved.status === "saved" ? saveLibraryIndex(index) : saved;
	});
}

// A deleted table takes its recovery copy with it: keeping the bytes of a
// table the user chose to delete would be a copy they cannot see.
export function removeTable(id: string): void {
	try {
		window.localStorage.removeItem(tableKey(id));
		window.localStorage.removeItem(tableRecoveryKey(id));
	} catch {
		// Blocked storage: the entry is gone from the index either way.
	}
}
