import { fc } from "@fast-check/vitest";
import { EXPECTED_COLUMN_TYPES, readCell } from "@/core/cell-value";
import { documentToMatrix } from "@/core/document";
import type { CellRect } from "@/core/selection";
import type {
	Alignment,
	CellValue,
	ExpectedColumnType,
	TableDocument,
} from "@/core/types";
import type { CodecId, TableCodec } from "@/formats";

export const PROPERTY_RUNS = 100;

const escapeTokenArbitrary = fc.constantFrom(
	" ",
	"  ",
	"\t",
	"\n",
	"\r",
	"\r\n",
	"|",
	"\\",
	"&",
	"&amp;",
	"&#32;",
	"&#92;",
	"<br>",
	"<br/>",
	"<br />",
	",",
	'"',
	": ",
	"- ",
	"<tag>",
	"é",
	"漢",
	"🧪",
);

// Random text finds ordinary combinations. The token array deliberately spends
// more runs on the escape alphabets where the lossless codecs have failed.
export const cellStringArbitrary = fc.oneof(
	fc.string({ maxLength: 24 }),
	fc
		.array(escapeTokenArbitrary, { minLength: 0, maxLength: 10 })
		.map((tokens) => tokens.join("")),
);

export const headerStringArbitrary = cellStringArbitrary.filter(
	(value) => value.trim().length > 0,
);

export const alignmentArbitrary: fc.Arbitrary<Alignment> = fc.constantFrom(
	"default",
	"left",
	"center",
	"right",
);

const expectedColumnTypeArbitrary: fc.Arbitrary<ExpectedColumnType> =
	fc.constantFrom(...EXPECTED_COLUMN_TYPES);

// Every scalar a cell may hold. Only finite numbers: a non-finite number is
// not a persistable cell value, so generating one would test a state the
// product refuses rather than one it has to survive.
export const nativeCellValueArbitrary: fc.Arbitrary<
	Exclude<CellValue, string>
> = fc.oneof(
	fc.double({ noNaN: true, noDefaultInfinity: true }),
	fc.integer(),
	fc.boolean(),
	fc.constant(null),
);

export const cellValueArbitrary: fc.Arbitrary<CellValue> = fc.oneof(
	cellStringArbitrary,
	nativeCellValueArbitrary,
);

const widthArbitrary = fc.option(
	fc.integer({ min: 4, max: 48 }).map((value) => value / 2),
	{ nil: undefined },
);

interface DocumentArbitraryOptions {
	readonly headerArbitrary?: fc.Arbitrary<string>;
	readonly keyedHeaders: boolean;
	readonly minColumnCount: number;
	readonly titledRows: boolean;
	// The text alphabet a format has to survive. It supplies headers and, unless
	// `scalarArbitrary` overrides them, cell values too.
	readonly valueArbitrary?: fc.Arbitrary<string>;
	// Native scalars for the cells. Only the core model accepts these today: a
	// codec that round-trips text would read a number back as its own text.
	readonly scalarArbitrary?: fc.Arbitrary<CellValue>;
}

function createDocumentArbitrary(
	options: DocumentArbitraryOptions,
): fc.Arbitrary<TableDocument> {
	const textArbitrary = options.valueArbitrary ?? cellStringArbitrary;
	const valueArbitrary = options.scalarArbitrary ?? textArbitrary;
	const generatedHeaderArbitrary = options.headerArbitrary ?? textArbitrary;
	return fc
		.record({
			columnCount: fc.integer({
				min: options.minColumnCount,
				max: 4,
			}),
			rowCount: fc.integer({ min: 1, max: 5 }),
		})
		.chain(({ columnCount, rowCount }) =>
			fc
				.tuple(
					fc.array(generatedHeaderArbitrary, {
						minLength: columnCount,
						maxLength: columnCount,
					}),
					fc.array(alignmentArbitrary, {
						minLength: columnCount,
						maxLength: columnCount,
					}),
					fc.array(widthArbitrary, {
						minLength: columnCount,
						maxLength: columnCount,
					}),
					fc.array(expectedColumnTypeArbitrary, {
						minLength: columnCount,
						maxLength: columnCount,
					}),
					fc.array(
						fc.array(valueArbitrary, {
							minLength: columnCount,
							maxLength: columnCount,
						}),
						{ minLength: rowCount, maxLength: rowCount },
					),
				)
				.map(([headers, alignments, widths, expectedTypes, values]) => {
					const columns = headers.map((header, index) => ({
						id: `c_property_${index}`,
						header: options.keyedHeaders
							? `column-${index + 1}:${header}`
							: header,
						align: alignments[index] ?? "default",
						expectedType: expectedTypes[index] ?? "text",
						...(widths[index] === undefined ? {} : { width: widths[index] }),
					}));
					const rows = values.map((rowValues, rowIndex) => ({
						id: `r_property_${rowIndex}`,
						cells: Object.fromEntries(
							columns.map((column, columnIndex) => {
								// A short row pads with an empty string. `??` would
								// also swallow a generated `null`, which is the one
								// variant these documents exist to exercise.
								const generated = rowValues[columnIndex];
								const value = generated === undefined ? "" : generated;
								return [
									column.id,
									options.titledRows && columnIndex === 0
										? `row-${rowIndex + 1}:${value}`
										: value,
								];
							}),
						),
					}));
					return { columns, rows };
				}),
		);
}

export const tableDocumentArbitrary = createDocumentArbitrary({
	keyedHeaders: false,
	minColumnCount: 1,
	titledRows: false,
});

// Documents whose cells hold every scalar variant. The core model and pure
// operations carry these values directly. Text codecs preserve them only when
// reconciliation has the previous document and sees the same projection.
export const typedTableDocumentArbitrary = createDocumentArbitrary({
	keyedHeaders: false,
	minColumnCount: 1,
	scalarArbitrary: cellValueArbitrary,
	titledRows: false,
});

const keyedTableDocumentArbitrary = createDocumentArbitrary({
	headerArbitrary: headerStringArbitrary,
	keyedHeaders: true,
	minColumnCount: 1,
	titledRows: false,
});

// #217 tracks CSV sniffing its own canonical output as the wrong delimiter and
// the one-column empty TSV ambiguity. Keep unaffected delimited contracts active
// until that focused fix restores the full hostile alphabet and one-column range.
const csvSafeCellStringArbitrary = cellStringArbitrary.filter(
	(value) => !/[;\t|]/u.test(value),
);
const htmlSafeCellStringArbitrary = cellStringArbitrary.filter(
	(value) => !value.includes("\r"),
);
const crossFormatSafeCellStringArbitrary = csvSafeCellStringArbitrary.filter(
	(value) => !value.includes("\r"),
);
const crossFormatSafeHeaderStringArbitrary =
	crossFormatSafeCellStringArbitrary.filter((value) => value.trim().length > 0);
const delimitedTableDocumentArbitrary = createDocumentArbitrary({
	keyedHeaders: false,
	minColumnCount: 2,
	titledRows: false,
});

const csvTableDocumentArbitrary = createDocumentArbitrary({
	keyedHeaders: false,
	minColumnCount: 2,
	titledRows: false,
	valueArbitrary: csvSafeCellStringArbitrary,
});

// #218 tracks HTML retaining carriage returns instead of applying the
// documented line-ending normalization.
const htmlTableDocumentArbitrary = createDocumentArbitrary({
	keyedHeaders: false,
	minColumnCount: 1,
	titledRows: false,
	valueArbitrary: htmlSafeCellStringArbitrary,
});

// Satisfies both JSON's key restrictions and Records' title restrictions, so
// one document can travel through every registered codec in sequence.
export const universallySerializableDocumentArbitrary = createDocumentArbitrary(
	{
		headerArbitrary: crossFormatSafeHeaderStringArbitrary,
		keyedHeaders: true,
		minColumnCount: 2,
		titledRows: true,
		valueArbitrary: crossFormatSafeCellStringArbitrary,
	},
);

const codecDocumentArbitraries: Record<CodecId, fc.Arbitrary<TableDocument>> = {
	markdown: tableDocumentArbitrary,
	csv: csvTableDocumentArbitrary,
	tsv: delimitedTableDocumentArbitrary,
	html: htmlTableDocumentArbitrary,
	jira: tableDocumentArbitrary,
	json: keyedTableDocumentArbitrary,
	records: universallySerializableDocumentArbitrary,
};

export function codecDocumentArbitrary(
	codec: TableCodec,
): fc.Arbitrary<TableDocument> {
	return codecDocumentArbitraries[codec.id];
}

// Start from each codec's existing grammar-safe document, then replace some,
// but not all, cells with native values. Filtering carriage returns keeps this
// property on type preservation rather than the separately tracked line-ending
// normalization contracts.
export function typedTextCodecDocumentArbitrary(
	codec: TableCodec,
): fc.Arbitrary<TableDocument> {
	if (codec.reconciliation.cellValues !== "text") {
		throw new Error(`${codec.id} is not a text-only codec`);
	}

	return codecDocumentArbitrary(codec)
		.filter(
			(document) =>
				document.rows.length * document.columns.length >= 2 &&
				documentToMatrix(document).every((row) =>
					row.every((value) => !value.includes("\r")),
				),
		)
		.chain((document) => {
			const cellCount = document.rows.length * document.columns.length;
			return fc
				.array(fc.option(nativeCellValueArbitrary, { nil: undefined }), {
					minLength: cellCount,
					maxLength: cellCount,
				})
				.filter(
					(values) =>
						values.some((value) => value !== undefined) &&
						values.some((value) => value === undefined),
				)
				.map((values) => {
					let valueIndex = 0;
					const rows = document.rows.map((row) => ({
						...row,
						cells: Object.fromEntries(
							document.columns.map((column) => {
								const replacement = values[valueIndex];
								valueIndex += 1;
								return [
									column.id,
									replacement === undefined
										? readCell(row, column.id)
										: replacement,
								];
							}),
						),
					}));
					return { ...document, rows };
				});
		})
		.filter((document) => codec.precondition?.(document) == null);
}

export interface DocumentPosition {
	readonly rowIndex: number;
	readonly columnIndex: number;
}

export function documentPositionArbitrary(
	document: TableDocument,
): fc.Arbitrary<DocumentPosition> {
	return fc.record({
		rowIndex: fc.integer({ min: 0, max: document.rows.length - 1 }),
		columnIndex: fc.integer({ min: 0, max: document.columns.length - 1 }),
	});
}

export function cellRectArbitrary(
	document: TableDocument,
): fc.Arbitrary<CellRect> {
	return fc
		.record({
			firstRow: fc.integer({ min: -1, max: document.rows.length - 1 }),
			secondRow: fc.integer({ min: -1, max: document.rows.length - 1 }),
			firstColumn: fc.integer({
				min: 0,
				max: document.columns.length - 1,
			}),
			secondColumn: fc.integer({
				min: 0,
				max: document.columns.length - 1,
			}),
		})
		.map(({ firstRow, secondRow, firstColumn, secondColumn }) => ({
			top: Math.min(firstRow, secondRow),
			bottom: Math.max(firstRow, secondRow),
			left: Math.min(firstColumn, secondColumn),
			right: Math.max(firstColumn, secondColumn),
		}));
}
