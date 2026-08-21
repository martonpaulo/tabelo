import { describe, expect, it } from "vitest";
import { copy } from "@/copy/copy";

// The letter sequence itself is covered where it lives, in
// core/column-letter.test.ts. What matters here is the announcement built on
// top of it.
describe("column positional names", () => {
	// An unnamed column has to announce something, and its letter is the only
	// identity it has. It must not become document content to get one.
	it("falls back to the letter for an empty header", () => {
		expect(copy.a11y.columnHeader("", 27)).toBe("AB");
		expect(copy.a11y.columnHeader("  ", 0)).toBe("A");
		expect(copy.a11y.columnHeader("Name", 0)).toBe("Name");
	});
});
