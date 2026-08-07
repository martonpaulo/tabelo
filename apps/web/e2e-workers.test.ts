import { describe, expect, it } from "vitest";
import { parseWorkers } from "./e2e-workers";

// Playwright's config validator accepts a number of any kind, but a string only
// when it ends in `%`. These cases exist because handing it a bare "1" aborted
// the whole suite before a test ran, so what matters about each result is the
// type as much as the value.
describe("parseWorkers", () => {
	it("falls back to the shared default when the variable is unset", () => {
		expect(parseWorkers(undefined)).toBe("25%");
	});

	it("treats an empty value as unset", () => {
		expect(parseWorkers("")).toBe("25%");
	});

	it("returns a number for the integer form", () => {
		expect(parseWorkers("1")).toBe(1);
		expect(parseWorkers("4")).toBe(4);
	});

	it("passes a percentage through as the string Playwright expects", () => {
		expect(parseWorkers("25%")).toBe("25%");
		expect(parseWorkers("10%")).toBe("10%");
	});

	it.each(["0", "-1", "0%"])("rejects %o as not a positive count", (raw) => {
		expect(() => parseWorkers(raw)).toThrow(/TABELO_E2E_WORKERS/);
	});

	it.each(["1.5", "abc", "50 %", "%", "25%%"])(
		"rejects %o as neither an integer nor a percentage",
		(raw) => {
			expect(() => parseWorkers(raw)).toThrow(/TABELO_E2E_WORKERS/);
		},
	);

	it("names the offending value so the caller can see what it set", () => {
		expect(() => parseWorkers("abc")).toThrow(/"abc"/);
	});
});
