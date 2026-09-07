// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { selectionClipboardPayload } from "@/clipboard/serialize";
import { readCell } from "@/core/cell-value";
import type { CodecId } from "@/formats";
import {
	createImportedDocument,
	IMPORT_LIMITS,
	prepareImport,
	tableShapeLimitError,
} from "./prepare";

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

	it("carries typed JSON cells through preparation and document construction", () => {
		const result = prepareImport({
			payload: { text: '[{"qty":1,"ok":true,"note":null,"code":"007"}]' },
			format: "json",
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.matrix).toEqual([
			["qty", "ok", "note", "code"],
			[1, true, null, "007"],
		]);
		const document = createImportedDocument(result.value, true);
		const row = document.rows[0];
		expect(row).toBeDefined();
		if (!row) return;
		expect(document.columns.map((column) => readCell(row, column.id))).toEqual([
			1,
			true,
			null,
			"007",
		]);
	});
});

describe("a Tabelo clipboard selection", () => {
	const selection = {
		matrix: [
			["Ingrid", 35, true, null],
			["Paulo", 35, false, ""],
		],
		expectedTypes: ["text", "number", "boolean", "text"],
	} as const;

	it("builds a document holding the values and the expectations it carried", () => {
		const result = prepareImport({
			payload: selectionClipboardPayload(selection),
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.source).toBe("tabelo");

		const document = createImportedDocument(result.value, false);
		expect(document.columns.map((column) => column.expectedType)).toEqual([
			"text",
			"number",
			"boolean",
			"text",
		]);
		expect(
			document.rows.map((row) =>
				document.columns.map((column) => readCell(row, column.id)),
			),
		).toEqual([
			["Ingrid", 35, true, null],
			["Paulo", 35, false, ""],
		]);
	});

	// The private payload is metadata rather than content being imported, so a
	// selection that fits the budget on its way out still fits on its way back
	// in. Charging both would shrink what a Tabelo copy can be pasted into.
	it("is not charged to the import byte budget", () => {
		const long = "x".repeat(400_000);
		const payload = selectionClipboardPayload({
			matrix: [[long]],
			expectedTypes: ["text"],
		});

		const rawBytes = new TextEncoder().encode(
			payload.text + payload.html,
		).byteLength;
		expect(payload.html).toContain("tabelo:");
		expect(rawBytes).toBeGreaterThan(IMPORT_LIMITS.payloadBytes);

		expect(prepareImport({ payload }).ok).toBe(true);
	});
});

describe("supported import limits", () => {
	it.each([
		[{ rows: IMPORT_LIMITS.rows, columns: 1 }, null],
		[{ rows: IMPORT_LIMITS.rows + 1, columns: 1 }, "too-many-rows"],
		[{ rows: 1, columns: IMPORT_LIMITS.columns }, null],
		[{ rows: 1, columns: IMPORT_LIMITS.columns + 1 }, "too-many-columns"],
		[{ rows: 250, columns: 200 }, null],
		[{ rows: 251, columns: 200 }, "too-many-cells"],
	] as const)("validates resulting table shape %#", (shape, code) => {
		expect(tableShapeLimitError(shape)?.code ?? null).toBe(code);
	});

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

	it("applies shape limits to a typed JSON result", () => {
		const text = JSON.stringify(
			Array.from({ length: IMPORT_LIMITS.rows + 1 }, (_, index) => ({
				value: index,
			})),
		);
		const result = prepareImport({ payload: { text }, format: "json" });

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("too-many-rows");
	});
});

describe("header decision metadata", () => {
	it("preserves a format-declared header", () => {
		const result = prepareImport({
			payload: {
				text: "| Name | Role |\n| --- | --- |\n| Ingrid | Designer |",
			},
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.headerRow).toBe(true);
	});

	it("preserves an absent header fact for delimited text", () => {
		const result = prepareImport({
			payload: { text: "Name\tRole\nIngrid\tDesigner" },
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.headerRow).toBeUndefined();
	});
});
