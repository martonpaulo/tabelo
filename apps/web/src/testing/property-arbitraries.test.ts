import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { nativeCellValueArbitrary } from "@/testing/property-arbitraries";

// A property asserting `Object.is` on a written number failed in CI when the
// generator produced `-0` over a cell holding `0`: the product rightly kept
// the cell, because the two are one cell number (docs/adr/0008). The fixed
// seed keeps this check deterministic, and fast-check's bias toward edge
// cases produces `-0` within this many draws when the generator allows it.
describe("the native cell value generator", () => {
	it("never produces negative zero", () => {
		const draws = fc.sample(nativeCellValueArbitrary, {
			seed: 1,
			numRuns: 2000,
		});

		expect(draws.some((value) => Object.is(value, -0))).toBe(false);
	});
});
