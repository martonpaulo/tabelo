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
			lineBreakTags: true,
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
			lineBreakTags: false,
		});
	});
});
