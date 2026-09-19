import { useSyncExternalStore } from "react";
import type { Preferences } from "./contract";
import { type PreferencesIssue, preferencesStore } from "./store";

// The committed preferences, for anything that has to render from them. The
// store is the single owner: nothing copies a preference into component or
// pane state, so one Apply reaches every open pane at once.
export function usePreferences(): Preferences {
	return useSyncExternalStore(
		preferencesStore.subscribe,
		preferencesStore.getSnapshot,
		preferencesStore.getSnapshot,
	);
}

// The stored payload this build could not read, if any, for the notice that
// reports it. Null once it is replaced, or when nothing went wrong.
export function usePreferencesIssue(): PreferencesIssue | null {
	return useSyncExternalStore(
		preferencesStore.subscribe,
		preferencesStore.getIssue,
		preferencesStore.getIssue,
	);
}
