import { describe, expect, it } from "vitest";
import {
	DEFAULT_TABLE_NAME,
	tableDocumentTitle,
	validateTableName,
} from "./product";

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

	it("composes the runtime title without changing product metadata", () => {
		expect(tableDocumentTitle(DEFAULT_TABLE_NAME)).toBe(
			"Untitled table · Tabelo",
		);
	});
});
