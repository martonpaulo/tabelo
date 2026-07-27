export const LEGACY_THEME_STORAGE_KEY = "tabelo.theme";

interface StorageWindow {
	readonly localStorage: Pick<Storage, "removeItem">;
}

// Theme selection is CSS-only. This migration removes the retired override,
// but inaccessible storage can never prevent the system theme from applying.
export function migrateLegacyThemePreference(source: StorageWindow): boolean {
	try {
		source.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
		return true;
	} catch {
		return false;
	}
}
