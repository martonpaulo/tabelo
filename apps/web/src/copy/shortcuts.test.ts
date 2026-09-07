import { shortcutRawKeys } from "@tabelo/ui/lib/shortcut";
import { describe, expect, it } from "vitest";
import { copy } from "./copy";

// The three-key limit is a product rule, so it is checked over the product's
// own shortcut metadata rather than inside the renderer. A renderer that
// silently dropped a key would still draw a legal-looking legend for an
// illegal chord: see docs/design-system.md section 9.
const MAXIMUM_KEYS = 3;

describe("shortcut tokenization", () => {
	it("counts the keys a legend names", () => {
		expect(shortcutRawKeys("Mod+Shift+Z")).toEqual(["Mod", "Shift", "Z"]);
		expect(shortcutRawKeys("Enter")).toEqual(["Enter"]);
		expect(shortcutRawKeys("Alt+ArrowUp")).toEqual(["Alt", "ArrowUp"]);
	});

	it("reads the plus key as one key rather than a separator", () => {
		expect(shortcutRawKeys("+")).toEqual(["+"]);
		expect(shortcutRawKeys("Mod++")).toEqual(["Mod", "+"]);
		expect(shortcutRawKeys("Mod+Alt++")).toEqual(["Mod", "Alt", "+"]);
	});

	it("counts a four-key chord as four, which is what the guard rejects", () => {
		expect(shortcutRawKeys("Mod+Alt+Shift+Enter")).toHaveLength(4);
		expect(shortcutRawKeys("Mod+Alt+Shift++")).toHaveLength(4);
	});
});

describe("the product's shortcut metadata", () => {
	it("declares at least one shortcut, so an empty list cannot pass", () => {
		expect(Object.keys(copy.shortcuts).length).toBeGreaterThan(0);
	});

	// Enumerated from the metadata itself rather than from a copy of the list,
	// so a shortcut added later is covered without editing this test.
	it.each(Object.entries(copy.shortcuts))(
		"presses %s with at most three simultaneous keys",
		(_name, shortcut) => {
			expect(shortcutRawKeys(shortcut).length).toBeLessThanOrEqual(
				MAXIMUM_KEYS,
			);
		},
	);
});
