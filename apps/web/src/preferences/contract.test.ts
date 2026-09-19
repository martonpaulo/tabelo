import { describe, expect, it } from "vitest";
import {
	DEFAULT_PREFERENCES,
	PREFERENCES_VERSION,
	readStoredPreferences,
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
			lineBreakIndicators: false,
			alignColumns: false,
		} as const;

		expect(readStoredPreferences(serializePreferences(preferences))).toEqual({
			status: "ok",
			preferences,
		});
	});

	// #276: a source pane draws nothing and wraps nothing until the reader asks,
	// except the line-break mark and column alignment, which ship on (owner,
	// 2026-09-19; #396).
	it("ships every source display default off but two", () => {
		expect(DEFAULT_PREFERENCES).toEqual({
			version: PREFERENCES_VERSION,
			wrap: false,
			spaceIndicators: "none",
			tabIndicators: false,
			emptyValueIndicators: false,
			lineBreakIndicators: true,
			alignColumns: true,
		});
	});

	// Version 6 adds column alignment and carries every earlier choice.
	it("carries a version 5 payload forward with alignment on", () => {
		const stored = {
			version: 5,
			wrap: true,
			spaceIndicators: "all",
			tabIndicators: false,
			emptyValueIndicators: true,
			lineBreakIndicators: false,
		};
		expect(readStoredPreferences(JSON.stringify(stored))).toEqual({
			status: "ok",
			preferences: {
				...stored,
				version: PREFERENCES_VERSION,
				alignColumns: true,
			},
		});
	});

	// Version 5 adds the line-break mark and carries every earlier choice.
	it("carries a version 4 payload forward with the line-break mark on", () => {
		const stored = {
			version: 4,
			wrap: true,
			spaceIndicators: "boundary",
			tabIndicators: true,
			emptyValueIndicators: false,
		};
		expect(readStoredPreferences(JSON.stringify(stored))).toEqual({
			status: "ok",
			preferences: {
				...stored,
				version: PREFERENCES_VERSION,
				lineBreakIndicators: true,
				alignColumns: true,
			},
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
		expect(readStoredPreferences(JSON.stringify(stored))).toEqual({
			status: "ok",
			preferences: DEFAULT_PREFERENCES,
		});
	});

	// Each failure carries the reason the table's own persistence would give,
	// so the notice can say whether the saved settings are old or damaged. The
	// payload itself is never replaced by defaults here: see the store.
	it.each([
		["text that is not JSON", "not json", "invalid-json"],
		[
			"a version this build does not know",
			JSON.stringify({
				...DEFAULT_PREFERENCES,
				version: PREFERENCES_VERSION + 1,
			}),
			"future-version",
		],
		[
			"a payload without a version",
			JSON.stringify({}),
			"current-schema-invalid",
		],
		[
			"a version that is not an integer",
			JSON.stringify({ ...DEFAULT_PREFERENCES, version: "4" }),
			"current-schema-invalid",
		],
		[
			"an unknown space mode",
			JSON.stringify({ ...DEFAULT_PREFERENCES, spaceIndicators: "everywhere" }),
			"current-schema-invalid",
		],
		// Wrapping has no schema default: a current payload without it was not
		// written by Tabelo.
		[
			"a current payload without wrapping",
			JSON.stringify({
				version: PREFERENCES_VERSION,
				spaceIndicators: "trailing",
				tabIndicators: true,
				emptyValueIndicators: true,
			}),
			"current-schema-invalid",
		],
		// The theme is gone from the current schema, so a payload still carrying
		// one is not a current payload and is not silently accepted either.
		[
			"a current payload with a theme",
			JSON.stringify({ ...DEFAULT_PREFERENCES, theme: "dark" }),
			"current-schema-invalid",
		],
		[
			"a current payload with an unknown key",
			JSON.stringify({ ...DEFAULT_PREFERENCES, unknown: true }),
			"current-schema-invalid",
		],
		// An older payload that was already invalid stays invalid: a migration
		// reads the old schema, it does not repair it.
		[
			"an invalid version 1",
			JSON.stringify({ version: 1, theme: "light" }),
			"migration-failed",
		],
		[
			"an invalid version 2",
			JSON.stringify({ version: 2, theme: "dark", spaceIndicators: "all" }),
			"migration-failed",
		],
		[
			"an invalid version 3",
			JSON.stringify({ version: 3, spaceIndicators: "all", wrap: true }),
			"migration-failed",
		],
		[
			"an invalid version 4",
			JSON.stringify({ version: 4, spaceIndicators: "all", wrap: true }),
			"migration-failed",
		],
		// The line-break mark has no schema default either.
		[
			"a current payload without the line-break mark",
			JSON.stringify({
				version: PREFERENCES_VERSION,
				wrap: false,
				spaceIndicators: "none",
				tabIndicators: false,
				emptyValueIndicators: false,
			}),
			"current-schema-invalid",
		],
		[
			"an invalid version 5",
			JSON.stringify({ version: 5, wrap: true, alignColumns: true }),
			"migration-failed",
		],
		// Nor does alignment.
		[
			"a current payload without alignment",
			JSON.stringify({
				version: PREFERENCES_VERSION,
				wrap: false,
				spaceIndicators: "none",
				tabIndicators: false,
				emptyValueIndicators: false,
				lineBreakIndicators: true,
			}),
			"current-schema-invalid",
		],
		[
			"a version that never shipped",
			JSON.stringify({ version: 0 }),
			"migration-failed",
		],
	] as const)("reports %s as unreadable", (_name, raw, reason) => {
		expect(readStoredPreferences(raw)).toEqual({
			status: "unreadable",
			reason,
		});
	});
});
