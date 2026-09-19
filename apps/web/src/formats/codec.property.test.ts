// @vitest-environment happy-dom

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { cellText, readCell } from "@/core/cell-value";
import {
	documentFromMatrix,
	documentToMatrix,
	reconcileDocument,
} from "@/core/document";
import { setCell } from "@/core/operations";
import type { CellValue, TableDocument } from "@/core/types";
import { canSerialize, csvCodec, listCodecs, type TableCodec } from "@/formats";
import { jiraCodec } from "@/formats/jira";
import { escapeJiraCell, unescapeJiraCell } from "@/formats/jira-inline";
import { escapeCell, unescapeCell } from "@/formats/markdown-inline";
import { cellAtPosition } from "@/formats/parse";
import {
	expectedDocumentForCodec,
	observeDocumentForCodec,
} from "@/testing/codec-projections";
import {
	cellStringArbitrary,
	codecDocumentArbitrary,
	documentPositionArbitrary,
	formattedCodecDocumentArbitrary,
	inlineCodecDocumentArbitrary,
	PROPERTY_RUNS,
	typedTextCodecDocumentArbitrary,
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

function valuesOf(document: TableDocument): CellValue[][] {
	return document.rows.map((row) =>
		document.columns.map((column) => readCell(row, column.id)),
	);
}

function typedTextCodecCase(codec: TableCodec) {
	return typedTextCodecDocumentArbitrary(codec).chain((document) =>
		documentPositionArbitrary(document).map((position) => ({
			document,
			position,
		})),
	);
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

	// #397: `<br>` is the chosen spelling's alternative, and text that spells
	// either one literally still comes back as that text.
	test.prop({ value: cellStringArbitrary }, { numRuns: PROPERTY_RUNS })(
		"Markdown unescapes every cell escaped with <br> breaks",
		({ value }) => {
			expect(unescapeCell(escapeCell(value, true))).toBe(
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

// Empty, whitespace-only, and pipe-holding cells in the header and body rows:
// the one-space empty spelling and its reference-spelled twin read back
// byte-exact, and a body row never carries the doubled pipe Jira reads as a
// header delimiter.
const jiraEdgeCellArbitrary = fc.oneof(
	fc.constantFrom("", " ", "  ", "\t", "|", " | ", "||", "&#32;", "\\"),
	cellStringArbitrary,
);

describe("jira empty and whitespace cells", () => {
	test.prop(
		{
			header: fc.array(jiraEdgeCellArbitrary, { minLength: 1, maxLength: 4 }),
			rows: fc.array(fc.array(jiraEdgeCellArbitrary, { maxLength: 4 }), {
				minLength: 1,
				maxLength: 4,
			}),
		},
		{ numRuns: PROPERTY_RUNS },
	)("round trip byte-exact", ({ header, rows }) => {
		const width = header.length;
		const matrix = [
			header,
			...rows.map((row) =>
				Array.from({ length: width }, (_, index) => row[index] ?? ""),
			),
		];
		const document = documentFromMatrix(matrix, { headerRow: true });
		const text = jiraCodec.serialize(document);
		for (const line of text.split("\n").slice(1)) {
			expect(line.startsWith("||")).toBe(false);
		}
		const parsed = expectSuccessfulParse("jira", jiraCodec.parse(text));
		expect(documentToMatrix(parsed)).toEqual(
			matrix.map((row) => row.map(normalizedLineEndings)),
		);
		expect(jiraCodec.serialize(parsed)).toBe(text);
	});
});

describe("registered codec properties", () => {
	// #397. A format offering a choice of spelling reads back, byte-exact, what
	// either spelling wrote, and writing what it read in the same spelling
	// changes nothing; the two spellings read back as the same table.
	for (const codec of listCodecs()) {
		for (const id of codec.spellings ?? []) {
			test.prop(
				{ document: inlineCodecDocumentArbitrary(codec) },
				{ numRuns: PROPERTY_RUNS },
			)(`${codec.id} round trips in both ${id} spellings`, ({ document }) => {
				const tables = [false, true].map((chosen) => {
					const spelling = { [id]: chosen };
					const text = codec.serialize(document, spelling);
					const parsed = expectSuccessfulParse(codec.id, codec.parse(text));
					expect(valuesOf(parsed)).toEqual(valuesOf(document));
					expect(parsed.columns.map((column) => column.header)).toEqual(
						document.columns.map((column) => column.header),
					);
					expect(codec.serialize(parsed, spelling)).toBe(text);
					return parsed;
				});
				expect(valuesOf(tables[0] as TableDocument)).toEqual(
					valuesOf(tables[1] as TableDocument),
				);
			});
		}
	}

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

	// #306. No codec spells inline structure yet, so every one of them sees only
	// the projection of a formatted header or cell. Passing through any of them
	// unchanged must keep the document exactly as it was, formatting included.
	for (const codec of listCodecs().filter(
		(codec) => codec.reconciliation.inlineContent === "unexpressed",
	)) {
		test.prop(
			{ document: formattedCodecDocumentArbitrary(codec) },
			{ numRuns: PROPERTY_RUNS },
		)(
			`${codec.id} keeps inline structure it cannot spell through reconciliation`,
			({ document }) => {
				expect(canSerialize(codec, document)).toBeNull();
				const parsed = expectSuccessfulParse(
					codec.id,
					codec.parse(codec.serialize(document)),
				);

				expect(reconcileDocument(document, parsed, codec.reconciliation)).toBe(
					document,
				);
			},
		);
	}

	// #306. A format that spells inline structure reads back exactly the
	// structure it wrote, byte-exact in every run, URL, and alternative text,
	// and writing what it read changes nothing, so switching views never
	// accumulates normalization.
	for (const codec of listCodecs().filter(
		(codec) => codec.reconciliation.inlineContent === "carried",
	)) {
		test.prop(
			{ document: inlineCodecDocumentArbitrary(codec) },
			{ numRuns: PROPERTY_RUNS },
		)(`${codec.id} round trips inline structure exactly`, ({ document }) => {
			const text = codec.serialize(document);
			const parsed = expectSuccessfulParse(codec.id, codec.parse(text));

			expect(parsed.columns.map((column) => column.header)).toEqual(
				document.columns.map((column) => column.header),
			);
			expect(valuesOf(parsed)).toEqual(valuesOf(document));
			expect(codec.serialize(parsed)).toBe(text);
			expect(reconcileDocument(document, parsed, codec.reconciliation)).toBe(
				document,
			);
		});
	}

	for (const codec of listCodecs().filter(
		(codec) => codec.reconciliation.cellValues === "text",
	)) {
		test.prop(
			{ document: typedTextCodecDocumentArbitrary(codec) },
			{ numRuns: PROPERTY_RUNS },
		)(
			`${codec.id} preserves mixed native values through text reconciliation`,
			({ document }) => {
				expect(canSerialize(codec, document)).toBeNull();
				const parsed = expectSuccessfulParse(
					codec.id,
					codec.parse(codec.serialize(document)),
				);

				expect(reconcileDocument(document, parsed, codec.reconciliation)).toBe(
					document,
				);
			},
		);

		test.prop({ case: typedTextCodecCase(codec) }, { numRuns: PROPERTY_RUNS })(
			`${codec.id} turns only a retyped projection into a string`,
			({ case: { document, position } }) => {
				const parsed = expectSuccessfulParse(
					codec.id,
					codec.parse(codec.serialize(document)),
				);
				const oldValue =
					valuesOf(document)[position.rowIndex]?.[position.columnIndex];
				if (oldValue === undefined) {
					throw new Error("the generated cell must exist");
				}
				const replacement = `${cellText(oldValue)}!`;
				const changed = setCell(
					parsed,
					position.rowIndex,
					position.columnIndex,
					replacement,
				);
				const next = reconcileDocument(document, changed, codec.reconciliation);
				const expected = valuesOf(document).map((row) => [...row]);
				const expectedRow = expected[position.rowIndex];
				if (!expectedRow) throw new Error("the generated row must exist");
				expectedRow[position.columnIndex] = replacement;

				expect(valuesOf(next)).toEqual(expected);
				expect(next.columns.map((column) => column.id)).toEqual(
					document.columns.map((column) => column.id),
				);
				expect(next.rows.map((row) => row.id)).toEqual(
					document.rows.map((row) => row.id),
				);
				expect(next.columns.map((column) => column.expectedType)).toEqual(
					document.columns.map((column) => column.expectedType),
				);
				expect(next.columns.map((column) => column.align)).toEqual(
					document.columns.map((column) => column.align),
				);
			},
		);
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

// The position mapping names the cell a position renders, or a structural
// command acts on the wrong row and looks like it worked (#255). Rewriting the
// text a mapped cell covers must change that cell of the parsed table and no
// other, which proves the range covers exactly the cell's spelling.
const SENTINEL = "mapped";

function mappedCellCase(codec: TableCodec) {
	return codecDocumentArbitrary(codec).chain((document) =>
		fc
			.record({
				row: fc.integer({ min: 0, max: document.rows.length }),
				column: fc.integer({ min: 0, max: document.columns.length - 1 }),
			})
			.map((cell) => ({ document, cell })),
	);
}

describe("source position mapping properties", () => {
	for (const codec of listCodecs().filter((codec) => codec.mapsSourceRows)) {
		test.prop({ case: mappedCellCase(codec) }, { numRuns: PROPERTY_RUNS })(
			`${codec.id} maps every cell to the text it is parsed from`,
			({ case: { document, cell } }) => {
				const text = codec.serialize(document);
				const parsed = codec.parse(text);
				if (!parsed.ok) throw new Error(`${codec.id} rejected its own output`);
				const rows = parsed.rows ?? [];
				expect(rows).toHaveLength(document.rows.length + 1);
				for (const row of rows) {
					expect(row.cells).toHaveLength(document.columns.length);
				}

				const range = rows[cell.row]?.cells[cell.column];
				if (!range) throw new Error("the mapped cell is missing");
				expect(cellAtPosition(rows, range.from)).toEqual(cell);
				expect(cellAtPosition(rows, range.to)).toEqual(cell);

				const rewritten = expectSuccessfulParse(
					codec.id,
					codec.parse(
						`${text.slice(0, range.from)}${SENTINEL}${text.slice(range.to)}`,
					),
				);
				const expected = documentToMatrix(parsed.document);
				const expectedRow = expected[cell.row];
				if (!expectedRow) throw new Error("the parsed row is missing");
				expectedRow[cell.column] = SENTINEL;
				expect(documentToMatrix(rewritten)).toEqual(expected);
			},
		);
	}
});
