import {
	DEFAULT_PREFERENCES,
	PREFERENCES_STORAGE_KEY,
	type Preferences,
	parseStoredPreferences,
	serializePreferences,
	validatePreferences,
} from "./contract";

export interface PreferenceStorage {
	readonly getItem: (key: string) => string | null;
	readonly setItem: (key: string, value: string) => void;
}

export type PreferencesCommitOutcome =
	| { readonly status: "saved" }
	| { readonly status: "invalid" }
	| { readonly status: "unavailable" };

export interface PreferencesStore {
	readonly getSnapshot: () => Preferences;
	readonly subscribe: (listener: () => void) => () => void;
	readonly commit: (preferences: unknown) => PreferencesCommitOutcome;
}

function loadPreferences(storage: PreferenceStorage | null): Preferences {
	if (storage === null) return DEFAULT_PREFERENCES;
	try {
		return parseStoredPreferences(storage.getItem(PREFERENCES_STORAGE_KEY));
	} catch {
		return DEFAULT_PREFERENCES;
	}
}

export function createPreferencesStore(
	storage: PreferenceStorage | null,
): PreferencesStore {
	let committed = loadPreferences(storage);
	const listeners = new Set<() => void>();

	return {
		getSnapshot: () => committed,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		commit: (candidate) => {
			const preferences = validatePreferences(candidate);
			if (preferences === null) return { status: "invalid" };
			if (storage === null) return { status: "unavailable" };
			try {
				storage.setItem(
					PREFERENCES_STORAGE_KEY,
					serializePreferences(preferences),
				);
			} catch {
				return { status: "unavailable" };
			}
			committed = preferences;
			for (const listener of listeners) listener();
			return { status: "saved" };
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
