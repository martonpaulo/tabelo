import { useSyncExternalStore } from "react";
import type { Preferences } from "./contract";
import { preferencesStore } from "./store";

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
