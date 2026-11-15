import { cn } from "@tabelo/ui/lib/utils";
import { describe, expect, it } from "vitest";

// The selection edge's width utilities are custom theme values; merging must
// keep the colour beside them rather than read them as a second colour (#560).
describe("cn with the selection edge's width utilities", () => {
	it("keeps the border colour beside the edge width", () => {
		expect(cn("border-selection-edge", "border-edge").split(" ")).toEqual([
			"border-selection-edge",
			"border-edge",
		]);
	});

	it("keeps the border colour beside one side's edge width", () => {
		expect(cn("border-selection-edge", "border-t-edge").split(" ")).toEqual([
			"border-selection-edge",
			"border-t-edge",
		]);
	});

	it("keeps the outline colour beside the edge width and offset", () => {
		expect(
			cn(
				"outline-selection-edge",
				"outline-edge",
				"-outline-offset-edge",
			).split(" "),
		).toEqual([
			"outline-selection-edge",
			"outline-edge",
			"-outline-offset-edge",
		]);
	});

	it("lets a later width replace the edge width", () => {
		expect(cn("border-edge", "border-4")).toBe("border-4");
	});
});
