import { describe, expect, it } from "vitest";
import { columnLetter } from "@/core/column-letter";

describe("column positional names", () => {
	// The boundaries are where a letter sequence goes wrong: 26 to 27 rolls over
	// to two letters, and 52 to 53 rolls the first letter on.
	it.each([
		[0, "A"],
		[3, "D"],
		[25, "Z"],
		[26, "AA"],
		[27, "AB"],
		[51, "AZ"],
		[52, "BA"],
		[701, "ZZ"],
		[702, "AAA"],
	])("names column index %i as %s", (index, expected) => {
		expect(columnLetter(index)).toBe(expected);
	});
});
