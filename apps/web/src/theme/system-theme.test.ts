import { describe, expect, it, vi } from "vitest";
import {
	LEGACY_THEME_STORAGE_KEY,
	migrateLegacyThemePreference,
} from "./system-theme";

describe("migrateLegacyThemePreference", () => {
	it.each(["light", "dark", "system", "unexpected"])(
		"removes a legacy %s preference without interpreting it",
		(legacyValue) => {
			const values = new Map([[LEGACY_THEME_STORAGE_KEY, legacyValue]]);
			const removeItem = vi.fn((key: string) => values.delete(key));

			expect(
				migrateLegacyThemePreference({ localStorage: { removeItem } }),
			).toBe(true);
			expect(values.has(LEGACY_THEME_STORAGE_KEY)).toBe(false);
			expect(removeItem).toHaveBeenCalledOnce();
			expect(removeItem).toHaveBeenCalledWith(LEGACY_THEME_STORAGE_KEY);
		},
	);

	it("leaves CSS system theming available when storage is inaccessible", () => {
		const source = Object.defineProperty(
			{} as { readonly localStorage: Pick<Storage, "removeItem"> },
			"localStorage",
			{
				get: () => {
					throw new DOMException("Storage is unavailable.", "SecurityError");
				},
			},
		);

		expect(migrateLegacyThemePreference(source)).toBe(false);
	});

	it("does not fail startup when removing the legacy key throws", () => {
		const removeItem = vi.fn(() => {
			throw new DOMException("Storage is unavailable.", "SecurityError");
		});

		expect(migrateLegacyThemePreference({ localStorage: { removeItem } })).toBe(
			false,
		);
	});
});
