import { describe, expect, it } from "vitest";
import {
	DEFAULT_PREFERENCES,
	PREFERENCES_VERSION,
	readStoredPreferences,
	serializePreferences,
} from "./contract";
import preferencesV1 from "./fixtures/preferences-v1.json";
import preferencesV2 from "./fixtures/preferences-v2.json";

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
			booleanMarks: true,
			booleanCheckboxes: false,
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
			booleanMarks: false,
			booleanCheckboxes: true,
		});
	});

	// #483: a stored version 1 payload keeps every choice it made and gains the
	// checkbox the Visual Table now draws by default, then (#484) the text
	// spelling of booleans every output wrote until then.
	it("migrates a version 1 payload forward", () => {
		expect(readStoredPreferences(JSON.stringify(preferencesV1))).toEqual({
			status: "ok",
			preferences: {
				...preferencesV1,
				version: PREFERENCES_VERSION,
				booleanCheckboxes: true,
				booleanMarks: false,
			},
		});
	});

	// #484: a stored version 2 payload keeps every choice it made, and its
	// booleans keep the text spelling they were written in.
	it("migrates a version 2 payload forward", () => {
		expect(readStoredPreferences(JSON.stringify(preferencesV2))).toEqual({
			status: "ok",
			preferences: {
				...preferencesV2,
				version: PREFERENCES_VERSION,
				booleanMarks: false,
			},
		});
	});

	it("keeps an invalid version 2 payload unreadable rather than coerced", () => {
		expect(
			readStoredPreferences(
				JSON.stringify({ ...preferencesV2, booleanCheckboxes: "yes" }),
			),
		).toEqual({ status: "unreadable", reason: "current-schema-invalid" });
		expect(
			readStoredPreferences(
				JSON.stringify({ ...preferencesV2, booleanMarks: true }),
			),
		).toEqual({ status: "unreadable", reason: "current-schema-invalid" });
	});

	it("keeps an invalid version 1 payload unreadable rather than coerced", () => {
		expect(
			readStoredPreferences(JSON.stringify({ ...preferencesV1, wrap: "yes" })),
		).toEqual({ status: "unreadable", reason: "current-schema-invalid" });
		expect(
			readStoredPreferences(
				JSON.stringify({ ...preferencesV1, booleanCheckboxes: false }),
			),
		).toEqual({ status: "unreadable", reason: "current-schema-invalid" });
	});

	it("leaves a version newer than this build alone", () => {
		expect(
			readStoredPreferences(
				JSON.stringify({
					...DEFAULT_PREFERENCES,
					version: PREFERENCES_VERSION + 1,
				}),
			),
		).toEqual({ status: "unreadable", reason: "future-version" });
	});
});
