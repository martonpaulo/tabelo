import type { TableDocument } from "@/core/types";
import type { Workspace } from "@/workspace/layout";
import {
	CURRENT_VERSION,
	type LoadOutcome,
	migrateAndValidate,
	STORAGE_KEY,
} from "./schema";

// What the app hands over to be saved. Deliberately expressed in the domain's
// own readonly types rather than the schema's inferred ones — persistence
// serves the document, not the other way round.
export interface SavePayload {
	readonly document: TableDocument;
	readonly workspace: Workspace;
}

// localStorage is the only durable store. Reads are treated as untrusted —
// another tab, an extension, or a half-finished write can all leave something
// unexpected there.

export function loadState(): LoadOutcome {
	let raw: string | null;
	try {
		raw = window.localStorage.getItem(STORAGE_KEY);
	} catch {
		// Private browsing and blocked storage both throw here.
		return {
			status: "unreadable",
			reason: "Browser storage is not available.",
		};
	}

	if (raw === null) return { status: "empty" };

	try {
		return migrateAndValidate(JSON.parse(raw));
	} catch {
		return {
			status: "unreadable",
			reason: "The saved table is not valid JSON.",
		};
	}
}

export type SaveOutcome =
	| { readonly status: "saved" }
	| { readonly status: "failed"; readonly reason: string };

export function saveState(state: SavePayload): SaveOutcome {
	const payload = { ...state, version: CURRENT_VERSION };
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
		return { status: "saved" };
	} catch (error) {
		const quotaExceeded =
			error instanceof DOMException &&
			(error.name === "QuotaExceededError" ||
				error.name === "NS_ERROR_DOM_QUOTA_REACHED");
		return {
			status: "failed",
			reason: quotaExceeded
				? "This table is too large for browser storage."
				: "Browser storage is not available.",
		};
	}
}

export function clearState(): void {
	try {
		window.localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Nothing to recover from — the document stays in memory either way.
	}
}
