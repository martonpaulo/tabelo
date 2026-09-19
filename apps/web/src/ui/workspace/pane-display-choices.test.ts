import { describe, expect, test } from "vitest";
import { SPACE_INDICATOR_VALUES } from "@/preferences/contract";
import {
	INHERIT_SOURCE_DISPLAY,
	type SourceDisplayKey,
} from "@/workspace/source-display";
import {
	explicitSegments,
	FOLLOW_DEFAULT,
	followsEveryDefault,
	overrideFromSegment,
	segmentOf,
} from "./pane-display-choices";

const KEYS = Object.keys(INHERIT_SOURCE_DISPLAY) as SourceDisplayKey[];

describe("pane display choices", () => {
	test("following the default is its own segment and stores no value", () => {
		for (const key of KEYS) {
			expect(segmentOf(INHERIT_SOURCE_DISPLAY[key])).toBe(FOLLOW_DEFAULT);
			expect(overrideFromSegment(key, FOLLOW_DEFAULT)).toBeNull();
		}
	});

	test("every explicit segment round-trips to the override it stores", () => {
		for (const key of KEYS) {
			const segments = explicitSegments(key);
			expect(segments).not.toContain(FOLLOW_DEFAULT);
			for (const segment of segments) {
				const override = overrideFromSegment(key, segment);
				expect(override).not.toBeNull();
				expect(override).not.toBeUndefined();
				expect(segmentOf(override ?? null)).toBe(segment);
			}
		}
	});

	test("a boolean setting offers both values, so a pane can refuse a default", () => {
		const stored = explicitSegments("tabIndicators").map((segment) =>
			overrideFromSegment("tabIndicators", segment),
		);
		expect(stored).toEqual(expect.arrayContaining([true, false]));
	});

	test("spaces offer every mode the preference has", () => {
		expect(explicitSegments("spaceIndicators")).toEqual(SPACE_INDICATOR_VALUES);
	});

	test("a segment the setting does not offer stores nothing", () => {
		expect(overrideFromSegment("wrap", "all")).toBeUndefined();
		expect(overrideFromSegment("spaceIndicators", "on")).toBeUndefined();
		expect(overrideFromSegment("tabIndicators", "")).toBeUndefined();
	});

	test("a pane follows every default only while it has chosen nothing", () => {
		expect(followsEveryDefault(INHERIT_SOURCE_DISPLAY)).toBe(true);
		expect(
			followsEveryDefault({ ...INHERIT_SOURCE_DISPLAY, wrap: false }),
		).toBe(false);
		expect(
			followsEveryDefault({
				...INHERIT_SOURCE_DISPLAY,
				spaceIndicators: "none",
			}),
		).toBe(false);
	});
});
