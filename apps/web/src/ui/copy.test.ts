import { describe, expect, it } from "vitest";
import { copy } from "@/ui/copy";

describe("column positional names", () => {
	// The boundaries are where a letter sequence goes wrong: 26 to 27 rolls over
	// to two letters, and 52 to 53 rolls the first letter on.
	it.each([
		[0, "A"],
		[25, "Z"],
		[26, "AA"],
		[51, "AZ"],
		[52, "BA"],
	])("names column index %i as %s", (index, expected) => {
		expect(copy.a11y.columnLetter(index)).toBe(expected);
	});

	it("no longer invents a Column N name", () => {
		expect(copy.a11y.columnLetter(0)).not.toContain("Column");
	});

	// An unnamed column has to announce something, and its letter is the only
	// identity it has. It must not become document content to get one.
	it("falls back to the letter for an empty header", () => {
		expect(copy.a11y.columnHeader("", 27)).toBe("AB");
		expect(copy.a11y.columnHeader("  ", 0)).toBe("A");
		expect(copy.a11y.columnHeader("Name", 0)).toBe("Name");
	});
});
