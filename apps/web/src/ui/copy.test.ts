import { describe, expect, it } from "vitest";
import { copy } from "@/ui/copy";

describe("codec precondition copy", () => {
	it("names conflicting columns by spreadsheet-style letter", () => {
		expect(
			copy.source.blocked({ code: "test-columns", columns: [0, 26] }),
		).toContain("columns A and AA");
	});

	it("names conflicting data rows by their visible table number", () => {
		expect(copy.source.blocked({ code: "test-rows", rows: [0, 2] })).toContain(
			"rows 2 and 4",
		);
	});
});
