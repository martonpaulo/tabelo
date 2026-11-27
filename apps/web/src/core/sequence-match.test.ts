import { describe, expect, it } from "vitest";
import { matchSequences } from "./sequence-match";

describe("matchSequences", () => {
	it("pairs the elements around a deletion and an insertion by content", () => {
		expect([
			...matchSequences([
				[
					["a", "b", "c"],
					["a", "c"],
				],
			]),
		]).toEqual([0, 2]);
		expect([
			...matchSequences([
				[
					["a", "c"],
					["x", "a", "c"],
				],
			]),
		]).toEqual([-1, 0, 1]);
	});

	it("pairs an edit in place by position and leaves an uneven gap unpaired", () => {
		expect([
			...matchSequences([
				[
					["a", "b", "c"],
					["a", "B", "c"],
				],
			]),
		]).toEqual([0, 1, 2]);
		expect([
			...matchSequences([
				[
					["a", "b", "c", "d"],
					["a", "X", "d"],
				],
			]),
		]).toEqual([0, -1, 3]);
	});

	it("matches a gap by the next, weaker key", () => {
		const contents = [
			["Name|Ingrid", "Age|30", "City|Rio"],
			["Name|Paulo", "City|Madrid"],
		] as const;
		const headers = [
			["Name", "Age", "City"],
			["Name", "City"],
		] as const;
		expect([...matchSequences([contents, headers])]).toEqual([0, 2]);
	});
});
