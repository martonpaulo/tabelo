// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import type { CodecId } from "@/formats";
import { IMPORT_LIMITS, prepareImport } from "./prepare";

function rows(count: number): string {
	return Array.from({ length: count }, (_, index) => `row ${index}`).join("\n");
}

function matrixText(rowCount: number, columnCount: number): string {
	const row = Array.from({ length: columnCount }, () => "x").join("\t");
	return Array.from({ length: rowCount }, () => row).join("\n");
}

describe("named format validation", () => {
	it.each([
		["csv", 'Name,Note\nIngrid,"unterminated'],
		["tsv", 'Name\tNote\nIngrid\t"unterminated'],
		["markdown", "| Name | Role |\n| not-a-divider | --- |"],
		["html", "<div>not a table</div>"],
		["jira", "|Ingrid|Designer|"],
	] satisfies readonly (readonly [CodecId, string])[])(
		"treats an invalid %s parse as final",
		(format, text) => {
			const result = prepareImport({ payload: { text }, format });

			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error.code).toBe("invalid-format");
		},
	);

	it("still sniffs generic text through registry-owned format hints", () => {
		const result = prepareImport({
			payload: { text: "Name\tRole\nIngrid\tDesigner" },
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.source).toBe("tsv");
	});
});

describe("supported import limits", () => {
	it.each([
		[IMPORT_LIMITS.rows - 1, true],
		[IMPORT_LIMITS.rows, true],
		[IMPORT_LIMITS.rows + 1, false],
	] as const)("handles the %i-row boundary", (count, accepted) => {
		const result = prepareImport({ payload: { text: rows(count) } });

		expect(result.ok).toBe(accepted);
		if (!result.ok) {
			expect(result.error.code).toBe("too-many-rows");
		}
	});

	it("rejects too many columns", () => {
		const result = prepareImport({
			payload: { text: matrixText(1, IMPORT_LIMITS.columns + 1) },
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("too-many-columns");
	});

	it("accepts the total cell limit and rejects the next rectangular size", () => {
		const atLimit = prepareImport({
			payload: { text: matrixText(250, 200) },
		});
		const aboveLimit = prepareImport({
			payload: { text: matrixText(251, 200) },
		});

		expect(atLimit.ok).toBe(true);
		expect(aboveLimit.ok).toBe(false);
		if (aboveLimit.ok) return;
		expect(aboveLimit.error.code).toBe("too-many-cells");
	});

	it("rejects payloads above the byte limit before parsing", () => {
		const result = prepareImport({
			payload: { text: "x".repeat(IMPORT_LIMITS.payloadBytes + 1) },
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("payload-too-large");
	});

	it("rejects 50,000 rows without constructing a document", () => {
		const result = prepareImport({ payload: { text: rows(50_000) } });

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("too-many-rows");
		expect(result).not.toHaveProperty("document");
	});
});

describe("header decision metadata", () => {
	it("records when row one is a header", () => {
		const result = prepareImport({
			payload: { text: "Name\tRole\nIngrid\tDesigner" },
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.headerRow).toBe(true);
	});

	it("records when row one is data", () => {
		const result = prepareImport({ payload: { text: "1\t2\n3\t4" } });

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.headerRow).toBe(false);
	});
});
