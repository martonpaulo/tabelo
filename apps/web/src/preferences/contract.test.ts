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
			wrap: true,
			spaceIndicators: "boundary",
			tabIndicators: false,
			emptyValueIndicators: true,
		} as const;

		expect(parseStoredPreferences(serializePreferences(preferences))).toEqual(
			preferences,
		);
	});

	// #276: a source pane draws nothing and wraps nothing until the reader asks.
	it("ships every source display default off", () => {
		expect(DEFAULT_PREFERENCES).toEqual({
			version: PREFERENCES_VERSION,
			wrap: false,
			spaceIndicators: "none",
			tabIndicators: false,
			emptyValueIndicators: false,
		});
	});

	// Version 4 made the three indicators the global default and shipped them
	// off. What an older payload held was written under the superseded
	// defaults, so every shipped version, whatever it said, reloads without
	// error at the new defaults rather than carrying the old values forward.
	it.each([
		[
			"version 1, markers on",
			{ version: 1, theme: "light", showWhitespaceIndicators: true },
		],
		[
			"version 1, markers off",
			{ version: 1, theme: "dark", showWhitespaceIndicators: false },
		],
		[
			"version 2 with a stale theme",
			{
				version: 2,
				theme: "sepia",
				spaceIndicators: "all",
				tabIndicators: true,
				emptyValueIndicators: true,
			},
		],
		[
			"version 3 at its own defaults",
			{
				version: 3,
				spaceIndicators: "trailing",
				tabIndicators: true,
				emptyValueIndicators: true,
			},
		],
		[
			"version 3 with every marker chosen",
			{
				version: 3,
				spaceIndicators: "all",
				tabIndicators: true,
				emptyValueIndicators: true,
			},
		],
	])("migrates a %s payload to the new defaults", (_name, stored) => {
		expect(parseStoredPreferences(JSON.stringify(stored))).toEqual(
			DEFAULT_PREFERENCES,
		);
	});

	it.each([
		null,
		"not json",
		JSON.stringify({ version: PREFERENCES_VERSION + 1 }),
		JSON.stringify({
			version: PREFERENCES_VERSION,
			wrap: false,
			spaceIndicators: "everywhere",
			tabIndicators: true,
			emptyValueIndicators: true,
		}),
		// Wrapping has no schema default: a current payload without it was not
		// written by Tabelo.
		JSON.stringify({
			version: PREFERENCES_VERSION,
			spaceIndicators: "trailing",
			tabIndicators: true,
			emptyValueIndicators: true,
		}),
		// The theme is gone from the current schema, so a payload still carrying
		// one is not a current payload and is not silently accepted either.
		JSON.stringify({
			version: PREFERENCES_VERSION,
			theme: "dark",
			wrap: false,
			spaceIndicators: "trailing",
			tabIndicators: true,
			emptyValueIndicators: true,
		}),
		JSON.stringify({
			version: PREFERENCES_VERSION,
			wrap: false,
			spaceIndicators: "trailing",
			tabIndicators: true,
			emptyValueIndicators: true,
			unknown: true,
		}),
		// An older payload that was already invalid stays invalid: a migration
		// reads the old schema, it does not repair it.
		JSON.stringify({ version: 1, theme: "light" }),
		JSON.stringify({ version: 2, theme: "dark", spaceIndicators: "all" }),
		JSON.stringify({ version: 3, spaceIndicators: "all", wrap: true }),
	])("falls back to defaults for absent or unsupported storage", (raw) => {
		expect(parseStoredPreferences(raw)).toEqual(DEFAULT_PREFERENCES);
	});
});
