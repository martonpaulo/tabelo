import { describe, expect, it } from "vitest";
import {
	DEFAULT_PREFERENCES,
	type SourceDisplay,
} from "@/preferences/contract";
import {
	INHERIT_SOURCE_DISPLAY,
	resolveSourceDisplay,
	type SourceDisplayOverrides,
} from "./source-display";

const everythingOn: SourceDisplay = {
	wrap: true,
	spaceIndicators: "all",
	tabIndicators: true,
	emptyValueIndicators: true,
};

describe("resolving a pane's source display", () => {
	it("follows every default while the pane has chosen nothing", () => {
		expect(
			resolveSourceDisplay(DEFAULT_PREFERENCES, INHERIT_SOURCE_DISPLAY),
		).toEqual({
			wrap: false,
			spaceIndicators: "none",
			tabIndicators: false,
			emptyValueIndicators: false,
		});
		expect(resolveSourceDisplay(everythingOn, INHERIT_SOURCE_DISPLAY)).toEqual(
			everythingOn,
		);
	});

	it("lets each override win on its own setting only", () => {
		const overrides: SourceDisplayOverrides = {
			...INHERIT_SOURCE_DISPLAY,
			wrap: false,
			spaceIndicators: "trailing",
		};

		expect(resolveSourceDisplay(everythingOn, overrides)).toEqual({
			wrap: false,
			spaceIndicators: "trailing",
			tabIndicators: true,
			emptyValueIndicators: true,
		});
	});

	// What separates this model from storing the resolved value: a pane that
	// chose the default's own value has still chosen, so it stays where it is
	// when the default moves, while an inheriting pane moves with it.
	it("keeps a pane overridden to the default's value when the default moves", () => {
		const chosen: SourceDisplayOverrides = {
			...INHERIT_SOURCE_DISPLAY,
			tabIndicators: false,
			emptyValueIndicators: false,
		};
		const before = { ...DEFAULT_PREFERENCES };
		const after = {
			...DEFAULT_PREFERENCES,
			tabIndicators: true,
			emptyValueIndicators: true,
		};

		expect(resolveSourceDisplay(before, chosen).tabIndicators).toBe(false);
		expect(resolveSourceDisplay(after, chosen)).toMatchObject({
			tabIndicators: false,
			emptyValueIndicators: false,
		});
		expect(resolveSourceDisplay(after, INHERIT_SOURCE_DISPLAY)).toMatchObject({
			tabIndicators: true,
			emptyValueIndicators: true,
		});
	});
});
