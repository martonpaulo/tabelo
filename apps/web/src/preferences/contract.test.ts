import { describe, expect, it } from "vitest";
import {
	DEFAULT_PREFERENCES,
	PREFERENCES_VERSION,
	parseStoredPreferences,
	serializePreferences,
} from "./contract";

describe("preferences contract", () => {
	it("accepts and serializes the current complete schema", () => {
		const preferences = {
			version: PREFERENCES_VERSION,
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
				spaceIndicators,
				tabIndicators: markers,
				emptyValueIndicators: markers,
			});
		},
	);

	// Version 3 removed the theme. Every display preference the reader had set
	// survives the step; only the discarded key differs between the versions,
	// and what it said does not change the result.
	it.each(["dark", "light", "system", "sepia", 7, null])(
		"migrates a version 2 payload whose theme was %o",
		(theme) => {
			const migrated = parseStoredPreferences(
				JSON.stringify({
					version: 2,
					theme,
					spaceIndicators: "all",
					tabIndicators: false,
					emptyValueIndicators: false,
				}),
			);

			expect(migrated).toEqual({
				version: PREFERENCES_VERSION,
				spaceIndicators: "all",
				tabIndicators: false,
				emptyValueIndicators: false,
			});
		},
	);

	it.each([
		null,
		"not json",
		JSON.stringify({ version: PREFERENCES_VERSION + 1 }),
		JSON.stringify({
			version: PREFERENCES_VERSION,
			spaceIndicators: "everywhere",
			tabIndicators: true,
			emptyValueIndicators: true,
		}),
		// The theme is gone from the current schema, so a payload still carrying
		// one is not a current payload and is not silently accepted either.
		JSON.stringify({
			version: PREFERENCES_VERSION,
			theme: "dark",
			spaceIndicators: "trailing",
			tabIndicators: true,
			emptyValueIndicators: true,
		}),
		JSON.stringify({
			version: PREFERENCES_VERSION,
			spaceIndicators: "trailing",
			tabIndicators: true,
			emptyValueIndicators: true,
			unknown: true,
		}),
		// A version 1 payload that was already invalid stays invalid: the
		// migration reads the old schema, it does not repair it.
		JSON.stringify({ version: 1, theme: "light" }),
		// The same for version 2, whose display preferences must all be present.
		JSON.stringify({ version: 2, theme: "dark", spaceIndicators: "all" }),
	])("falls back to defaults for absent or unsupported storage", (raw) => {
		expect(parseStoredPreferences(raw)).toEqual(DEFAULT_PREFERENCES);
	});
});
