import type { PersistenceFailureReason } from "@/persistence/schema";
import { preserveRawThenWrite, writeItem } from "@/persistence/storage";
import {
	DEFAULT_PREFERENCES,
	PREFERENCES_RECOVERY_KEY,
	PREFERENCES_STORAGE_KEY,
	type Preferences,
	readStoredPreferences,
	serializePreferences,
	validatePreferences,
} from "./contract";

export interface PreferenceStorage {
	readonly getItem: (key: string) => string | null;
	readonly setItem: (key: string, value: string) => void;
}

// A stored payload this build could not read, held exactly as it was found.
// The shape and the treatment are the table's own (`StorageIssue` in the
// document store): the bytes stay in storage untouched, the app runs on the
// defaults meanwhile, and only the user's explicit replacement overwrites them,
// after copying them to the recovery key.
export interface PreferencesIssue {
	readonly kind: "unreadable";
	readonly reason: PersistenceFailureReason;
	readonly raw: string;
	readonly replacementFailure?: "unavailable" | "quota";
}

export type PreferencesCommitOutcome =
	| { readonly status: "saved" }
	| { readonly status: "invalid" }
	| { readonly status: "unavailable" }
	// Applied for this session only: the stored payload is unreadable, and a
	// change is never what overwrites it. See `PreferencesIssue`.
	| { readonly status: "blocked" };

export type PreferencesReplaceOutcome =
	| { readonly status: "saved" }
	// The recovery copy was written but the preferences were not: the original
	// is safe, so the issue is resolved, but the change did not persist.
	| { readonly status: "not-saved" }
	| { readonly status: "failed" };

export interface PreferencesStore {
	readonly getSnapshot: () => Preferences;
	readonly getIssue: () => PreferencesIssue | null;
	readonly subscribe: (listener: () => void) => () => void;
	readonly commit: (preferences: unknown) => PreferencesCommitOutcome;
	readonly replaceUnreadable: () => PreferencesReplaceOutcome;
}

interface LoadedPreferences {
	readonly preferences: Preferences;
	readonly issue: PreferencesIssue | null;
}

function loadPreferences(storage: PreferenceStorage | null): LoadedPreferences {
	const defaults = { preferences: DEFAULT_PREFERENCES, issue: null };
	if (storage === null) return defaults;
	let raw: string | null;
	try {
		raw = storage.getItem(PREFERENCES_STORAGE_KEY);
	} catch {
		// Nothing was read, so nothing is at risk: a later write reports the
		// same unavailable storage when the user changes a setting.
		return defaults;
	}
	if (raw === null) return defaults;
	const outcome = readStoredPreferences(raw);
	if (outcome.status === "ok") {
		return { preferences: outcome.preferences, issue: null };
	}
	return {
		preferences: DEFAULT_PREFERENCES,
		issue: { kind: "unreadable", reason: outcome.reason, raw },
	};
}

export function createPreferencesStore(
	storage: PreferenceStorage | null,
): PreferencesStore {
	const loaded = loadPreferences(storage);
	let committed = loaded.preferences;
	let issue = loaded.issue;
	const listeners = new Set<() => void>();
	const notify = () => {
		for (const listener of listeners) listener();
	};
	const write = (preferences: Preferences) =>
		storage === null
			? ({ status: "unavailable" } as const)
			: writeItem(
					storage,
					PREFERENCES_STORAGE_KEY,
					serializePreferences(preferences),
				);

	return {
		getSnapshot: () => committed,
		getIssue: () => issue,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		commit: (candidate) => {
			const preferences = validatePreferences(candidate);
			if (preferences === null) return { status: "invalid" };
			if (issue !== null) {
				committed = preferences;
				notify();
				return { status: "blocked" };
			}
			if (write(preferences).status !== "saved") {
				return { status: "unavailable" };
			}
			committed = preferences;
			notify();
			return { status: "saved" };
		},
		replaceUnreadable: () => {
			if (issue === null || storage === null) return { status: "failed" };
			const outcome = preserveRawThenWrite(
				storage,
				PREFERENCES_RECOVERY_KEY,
				issue.raw,
				() => write(committed),
			);
			if (outcome.recoveryPreserved) {
				issue = null;
				notify();
				return { status: outcome.status === "saved" ? "saved" : "not-saved" };
			}
			issue = {
				...issue,
				replacementFailure:
					outcome.status === "quota" ? "quota" : "unavailable",
			};
			notify();
			return { status: "failed" };
		},
	};
}

function browserStorage(): PreferenceStorage | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

export const preferencesStore = createPreferencesStore(browserStorage());
