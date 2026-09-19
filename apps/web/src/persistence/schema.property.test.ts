import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { readCell } from "@/core/cell-value";
import type { TableDocument } from "@/core/types";
import {
	inlineContentArbitrary,
	PROPERTY_RUNS,
	typedTableDocumentArbitrary,
} from "@/testing/property-arbitraries";
import { createDefaultWorkspace } from "@/workspace/layout";
import { CURRENT_VERSION, validatePersistedState } from "./schema";

// #306. Whatever a document holds, formatted headers and cells beside native
// scalars, comes back from storage exactly as it went in. Negative zero is left
// out: `JSON.stringify` writes it as `0`, a distinction Tabelo carries nowhere.
const storedDocumentArbitrary: fc.Arbitrary<TableDocument> =
	typedTableDocumentArbitrary
		.filter((document) =>
			document.rows.every((row) =>
				document.columns.every(
					(column) => !Object.is(readCell(row, column.id), -0),
				),
			),
		)
		.chain((document) =>
			fc
				.array(fc.option(inlineContentArbitrary, { nil: undefined }), {
					minLength: document.columns.length,
					maxLength: document.columns.length,
				})
				.map((headers) => ({
					...document,
					columns: document.columns.map((column, index) => ({
						id: column.id,
						header: headers[index] ?? column.header,
						align: column.align,
						expectedType: column.expectedType,
					})),
				})),
		);

describe("persisted document properties", () => {
	test.prop({ document: storedDocumentArbitrary }, { numRuns: PROPERTY_RUNS })(
		"a stored document loads back unchanged, formatting included",
		({ document }) => {
			const stored = JSON.stringify({
				version: CURRENT_VERSION,
				name: "Formatted roster",
				document,
				workspace: createDefaultWorkspace(),
				draft: null,
			});

			const outcome = validatePersistedState(JSON.parse(stored));

			expect(outcome.status).toBe("ok");
			if (outcome.status !== "ok") return;
			expect(outcome.state.document).toEqual(document);
		},
	);
});
