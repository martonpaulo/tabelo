import { describe, expect, it } from "vitest";
import { validateTableName } from "./product";

describe("table identity", () => {
	it("trims a valid authored name", () => {
		expect(validateTableName("  Project roles  ")).toEqual({
			ok: true,
			name: "Project roles",
		});
	});

	it("refuses blank and over-length names by Unicode code point", () => {
		expect(validateTableName(" \n ")).toEqual({ ok: false, reason: "empty" });
		expect(validateTableName("😀".repeat(120))).toMatchObject({ ok: true });
		expect(validateTableName("😀".repeat(121))).toEqual({
			ok: false,
			reason: "too-long",
		});
	});
});
