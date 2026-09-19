import { describe, expect, test } from "vitest";
import { SPACE_INDICATOR_VALUES } from "@/preferences/contract";
import { listViews } from "@/views/registry";
import {
	INHERIT_SOURCE_DISPLAY,
	type SourceDisplayKey,
} from "@/workspace/source-display";
import {
	explicitSegments,
	FOLLOW_DEFAULT,
	followsEveryDefault,
	offersSetting,
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

	// #396: the formats that map their rows and do not pad their own text.
	test("offers column alignment only where a pane can draw it", () => {
		const offering = listViews()
			.filter((view) => view.kind === "source")
			.filter((view) => offersSetting("alignColumns", view))
			.map((view) => view.id);
		expect(offering.toSorted()).toEqual(["csv", "jira", "tsv"]);
		// #397: the line-break spelling is Markdown's alone.
		expect(
			listViews()
				.filter((view) => view.kind === "source")
				.filter((view) => offersSetting("lineBreakTags", view))
				.map((view) => view.id),
		).toEqual(["markdown"]);
		for (const view of listViews()) {
			expect(offersSetting("wrap", view)).toBe(true);
		}
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
