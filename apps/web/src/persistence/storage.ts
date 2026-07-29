import type { TableDocument } from "@/core/types";
import type { Workspace } from "@/workspace/layout";
import {
	CURRENT_VERSION,
	type PersistedDraft,
	type PersistedState,
	RECOVERY_KEY,
	STORAGE_KEY,
	validatePersistedState,
} from "./schema";

// What the app hands over to be saved. Deliberately expressed in the domain's
// own readonly types rather than the schema's inferred ones: persistence
// serves the document, not the other way round.
export interface SavePayload {
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
			readonly reason: string;
			readonly raw: string;
	  };

export function loadState(): StorageLoadOutcome {
	let raw: string | null;
	try {
		raw = window.localStorage.getItem(STORAGE_KEY);
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
			reason: "The saved table is not valid JSON.",
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

export function saveState(state: SavePayload): SaveOutcome {
	const payload = { ...state, version: CURRENT_VERSION };
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
		return { status: "saved" };
	} catch (error) {
		return classifyWriteFailure(error);
	}
}

export function preserveUnreadableAndSave(
	raw: string,
	state: SavePayload,
): SaveOutcome & { readonly recoveryPreserved: boolean } {
	try {
		window.localStorage.setItem(RECOVERY_KEY, raw);
	} catch (error) {
		return { ...classifyWriteFailure(error), recoveryPreserved: false };
	}
	return { ...saveState(state), recoveryPreserved: true };
}

export function clearState(): void {
	try {
		window.localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Nothing to recover from: the document stays in memory either way.
	}
}
