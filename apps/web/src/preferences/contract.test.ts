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
			spaceIndicators: "boundary",
			tabIndicators: false,
			emptyValueIndicators: true,
		} as const;

		expect(parseStoredPreferences(serializePreferences(preferences))).toEqual(
			preferences,
		);
	});

	// Version 1 held one boolean for every marker at once. A reader who had
	// turned them off has said something, and the migration has to keep saying
	// it rather than resetting them to the shipped defaults.
	it.each([
		[true, DEFAULT_PREFERENCES.spaceIndicators, true],
		[false, "none", false],
	])(
		"migrates a version 1 payload with showWhitespaceIndicators %s",
		(shown, spaceIndicators, markers) => {
			const migrated = parseStoredPreferences(
				JSON.stringify({
					version: 1,
					theme: "light",
					showWhitespaceIndicators: shown,
				}),
			);

			expect(migrated).toEqual({
				version: PREFERENCES_VERSION,
				theme: "light",
				spaceIndicators,
				tabIndicators: markers,
				emptyValueIndicators: markers,
			});
		},
	);

	it.each([
		null,
		"not json",
		JSON.stringify({ version: PREFERENCES_VERSION + 1, theme: "dark" }),
		JSON.stringify({
			version: PREFERENCES_VERSION,
			theme: "sepia",
			spaceIndicators: "trailing",
			tabIndicators: true,
			emptyValueIndicators: true,
		}),
		JSON.stringify({
			version: PREFERENCES_VERSION,
			theme: "light",
			spaceIndicators: "everywhere",
			tabIndicators: true,
			emptyValueIndicators: true,
		}),
		JSON.stringify({
			version: PREFERENCES_VERSION,
			theme: "light",
			spaceIndicators: "trailing",
			tabIndicators: true,
			emptyValueIndicators: true,
			unknown: true,
		}),
		// A version 1 payload that was already invalid stays invalid: the
		// migration reads the old schema, it does not repair it.
		JSON.stringify({ version: 1, theme: "light" }),
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
		// Every key of the current schema, so a field added without touching the
		// bootstrap cannot silently start rejecting valid storage.
		for (const key of Object.keys(DEFAULT_PREFERENCES)) {
			expect(script).toContain(key);
		}
	});

	// The script places the theme before the first paint, and every shipped
	// version spells `theme` the same way. Refusing an older payload here would
	// flash the wrong palette at the reader the migration is about to honour.
	it.each([PREFERENCES_VERSION, 1])(
		"bootstraps an explicit theme from a version %s payload",
		(version) => {
			const stored =
				version === 1
					? { version: 1, theme: "light", showWhitespaceIndicators: true }
					: { ...DEFAULT_PREFERENCES, theme: "light" };

			expect(bootstrapTheme(JSON.stringify(stored))).toBe("light");
		},
	);

	it.each([null, "corrupt", "inaccessible"])(
		"bootstraps %s preferences to Dark when the system result is unavailable",
		(raw) => {
			const applied = runBootstrap(raw);

			expect(applied.attribute).toBeNull();
			expect(applied.themeColor).toBe("#1f1f1f");
		},
	);
});

interface BootstrapResult {
	readonly attribute: string | null;
	readonly themeColor: string | null;
}

// Runs the generated script against the smallest environment it touches, so
// what is asserted is the shipped string rather than a reimplementation of it.
function runBootstrap(raw: string | null): BootstrapResult {
	let attribute: string | null = "unread";
	let themeColor: string | null = null;
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

	runInNewContext(createThemeBootstrapScript(), {
		window: {},
		document,
		localStorage,
	});

	return { attribute, themeColor };
}

function bootstrapTheme(raw: string): string | null {
	return runBootstrap(raw).attribute;
}
