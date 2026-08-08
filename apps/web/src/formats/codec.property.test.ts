// @vitest-environment happy-dom

import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { documentToMatrix } from "@/core/document";
import { canSerialize, csvCodec, listCodecs } from "@/formats";
import { escapeJiraCell, unescapeJiraCell } from "@/formats/jira";
import { escapeCell, unescapeCell } from "@/formats/markdown";
import {
	expectedDocumentForCodec,
	observeDocumentForCodec,
} from "@/testing/codec-projections";
import {
	cellStringArbitrary,
	codecDocumentArbitrary,
	PROPERTY_RUNS,
	universallySerializableDocumentArbitrary,
} from "@/testing/property-arbitraries";

function normalizedLineEndings(value: string): string {
	return value.replace(/\r\n?/g, "\n");
}

function expectSuccessfulParse(
	codecId: string,
	result: ReturnType<(typeof csvCodec)["parse"]>,
) {
	expect(result.ok, `${codecId} failed to parse its own output`).toBe(true);
	if (!result.ok) throw new Error(`${codecId} failed to parse its own output`);
	return result.document;
}

describe("codec escape properties", () => {
	test.prop({ value: cellStringArbitrary }, { numRuns: PROPERTY_RUNS })(
		"Markdown unescapes every escaped cell",
		({ value }) => {
			expect(unescapeCell(escapeCell(value))).toBe(
				normalizedLineEndings(value),
			);
		},
	);

	test.prop({ value: cellStringArbitrary }, { numRuns: PROPERTY_RUNS })(
		"Jira unescapes every escaped cell",
		({ value }) => {
			expect(unescapeJiraCell(escapeJiraCell(value))).toBe(
				normalizedLineEndings(value),
			);
		},
	);
});

describe("registered codec properties", () => {
	for (const codec of listCodecs()) {
		test.prop(
			{ document: codecDocumentArbitrary(codec) },
			{ numRuns: PROPERTY_RUNS },
		)(`${codec.id} preserves its documented projection`, ({ document }) => {
			expect(canSerialize(codec, document)).toBeNull();
			const parsed = expectSuccessfulParse(
				codec.id,
				codec.parse(codec.serialize(document)),
			);

			expect(observeDocumentForCodec(codec, parsed)).toEqual(
				expectedDocumentForCodec(codec, document),
			);
		});

		test.prop(
			{ document: universallySerializableDocumentArbitrary },
			{ numRuns: PROPERTY_RUNS },
		)(`CSV bytes survive a ${codec.id} round trip`, ({ document }) => {
			const fromCsv = expectSuccessfulParse(
				"csv",
				csvCodec.parse(csvCodec.serialize(document)),
			);
			expect(canSerialize(codec, fromCsv)).toBeNull();

			const fromTarget = expectSuccessfulParse(
				codec.id,
				codec.parse(codec.serialize(fromCsv)),
			);
			const backFromCsv = expectSuccessfulParse(
				"csv",
				csvCodec.parse(csvCodec.serialize(fromTarget)),
			);

			expect(documentToMatrix(backFromCsv)).toEqual(
				expectedDocumentForCodec(codec, document).matrix,
			);
		});
	}

	test.prop(
		{ document: universallySerializableDocumentArbitrary },
		{ numRuns: PROPERTY_RUNS },
	)(
		"every registry codec accepts the shared constrained document",
		({ document }) => {
			for (const codec of listCodecs()) {
				expect(canSerialize(codec, document), codec.id).toBeNull();
			}
		},
	);
});
