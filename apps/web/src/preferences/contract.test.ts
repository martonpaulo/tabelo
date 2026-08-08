import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
	createThemeBootstrapScript,
	DEFAULT_PREFERENCES,
	detectSystemTheme,
	PREFERENCES_STORAGE_KEY,
	PREFERENCES_VERSION,
	parseStoredPreferences,
	resolveEffectiveTheme,
	serializePreferences,
} from "./contract";

describe("preferences contract", () => {
	it("accepts and serializes the current complete schema", () => {
		const preferences = {
			version: PREFERENCES_VERSION,
			theme: "dark",
			showWhitespaceIndicators: false,
		} as const;

		expect(parseStoredPreferences(serializePreferences(preferences))).toEqual(
			preferences,
		);
	});

	it.each([
		null,
		"not json",
		JSON.stringify({ version: PREFERENCES_VERSION + 1, theme: "dark" }),
		JSON.stringify({
			version: PREFERENCES_VERSION,
			theme: "sepia",
			showWhitespaceIndicators: true,
		}),
		JSON.stringify({
			version: PREFERENCES_VERSION,
			theme: "light",
			showWhitespaceIndicators: true,
			unknown: true,
		}),
	])("falls back to defaults for absent or unsupported storage", (raw) => {
		expect(parseStoredPreferences(raw)).toEqual(DEFAULT_PREFERENCES);
	});

	it("resolves System independently in both directions", () => {
		expect(resolveEffectiveTheme("system", "light")).toBe("light");
		expect(resolveEffectiveTheme("system", "dark")).toBe("dark");
		expect(resolveEffectiveTheme("light", "dark")).toBe("light");
		expect(resolveEffectiveTheme("dark", "light")).toBe("dark");
	});

	it("uses Dark only when the platform exposes no usable system result", () => {
		expect(detectSystemTheme(() => ({ matches: false }))).toBe("light");
		expect(detectSystemTheme(() => ({ matches: true }))).toBe("dark");
		expect(detectSystemTheme(undefined)).toBeNull();
		expect(
			detectSystemTheme(() => {
				throw new Error("matchMedia is unavailable");
			}),
		).toBeNull();
		expect(resolveEffectiveTheme("system", null)).toBe("dark");
	});

	it("generates a bootstrap from the same storage and schema contract", () => {
		const script = createThemeBootstrapScript();

		expect(script).toContain(JSON.stringify(PREFERENCES_STORAGE_KEY));
		expect(script).toContain(String(PREFERENCES_VERSION));
		expect(script).toContain("showWhitespaceIndicators");
	});

	it.each([null, "corrupt", "inaccessible"])(
		"bootstraps %s preferences to Dark when the system result is unavailable",
		(raw) => {
			let attribute: string | null = "unread";
			let themeColor: string | null = null;
			const script = createThemeBootstrapScript();
			const localStorage = {
				getItem: () => {
					if (raw === "inaccessible") throw new Error("blocked");
					return raw;
				},
			};
			const document = {
				documentElement: {
					removeAttribute: () => {
						attribute = null;
					},
					setAttribute: (_name: string, value: string) => {
						attribute = value;
					},
				},
				querySelector: () => ({
					setAttribute: (_name: string, value: string) => {
						themeColor = value;
					},
				}),
			};

			runInNewContext(script, { window: {}, document, localStorage });

			expect(attribute).toBeNull();
			expect(themeColor).toBe("#1f1f1f");
		},
	);
});
