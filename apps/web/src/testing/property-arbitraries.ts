import { fc } from "@fast-check/vitest";
import { cellText, EXPECTED_COLUMN_TYPES, readCell } from "@/core/cell-value";
import { documentToMatrix } from "@/core/document";
import {
	isInlineContent,
	normalizeInline,
	setLink,
	setMark,
} from "@/core/inline-content";
import type { CellRect } from "@/core/selection";
import type {
	Alignment,
	CellValue,
	ExpectedColumnType,
	InlineContent,
	InlineMark,
	InlineNode,
	InlineText,
	TableDocument,
	TextContent,
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
	// The inline syntax of Markdown and Jira (#306): every marker, alone and
	// doubled, and a letter to stand beside one.
	"*",
	"**",
	"_",
	"~",
	"~~",
	"+",
	"-",
	"`",
	"[",
	"]",
	"(",
	")",
	"!",
	"{{",
	"}}",
	"<u>",
	"</u>",
	"a",
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

// Inline content before normalization: marks in any order, empty runs,
// adjacent runs that should merge, and links that normalize away. Inline code
// never spans a line break here, because the model cannot hold that and
// normalization does not repair it.
const inlineRunArbitrary: fc.Arbitrary<InlineText> = fc
	.record({
		text: cellStringArbitrary,
		marks: fc.oneof(
			{
				weight: 4,
				arbitrary: fc.shuffledSubarray<InlineMark>([
					"bold",
					"italic",
					"underline",
					"strikethrough",
				]),
			},
			{ weight: 1, arbitrary: fc.constant<InlineMark[]>(["code"]) },
		),
	})
	.map(({ text, marks }) => ({
		kind: "text",
		text: marks.includes("code") ? text.replace(/[\r\n]/g, "") : text,
		marks,
	}));

// Authored URLs are kept, never judged, so the model has to carry schemes it
// will later refuse to activate as faithfully as the ones it will.
const inlineUrlArbitrary = fc.constantFrom(
	"https://example.com/ingrid",
	"http://example.com/paulo?city=Madrid&lang=es",
	"mailto:ingrid@example.com",
	"javascript:alert(1)",
	"relative/rio.png",
	"https://example.com/<pipe|and>",
);

export const inlineNodesArbitrary: fc.Arbitrary<InlineNode[]> = fc.array(
	fc.oneof(
		{ weight: 4, arbitrary: inlineRunArbitrary },
		{
			weight: 1,
			arbitrary: fc
				.record({
					url: inlineUrlArbitrary,
					children: fc.array(inlineRunArbitrary, {
						minLength: 1,
						maxLength: 3,
					}),
				})
				.map(
					({ url, children }): InlineNode => ({ kind: "link", url, children }),
				),
		},
		{
			weight: 1,
			arbitrary: fc
				.record({ url: inlineUrlArbitrary, alt: headerStringArbitrary })
				.map(({ url, alt }): InlineNode => ({ kind: "image", url, alt })),
		},
	),
	{ minLength: 1, maxLength: 6 },
);

// Normalized inline content: what a cell or header may hold beside a string.
export const inlineContentArbitrary: fc.Arbitrary<InlineContent> =
	inlineNodesArbitrary
		.map(normalizeInline)
		.filter((value): value is InlineContent => typeof value !== "string");

// Every value a cell may hold: text, formatted text, and each native scalar.
export const richCellValueArbitrary: fc.Arbitrary<CellValue> = fc.oneof(
	cellStringArbitrary,
	inlineContentArbitrary,
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

// Documents whose cells hold every value variant, inline content included.
// The core model and pure operations carry these values directly. Text codecs preserve them only when
// reconciliation has the previous document and sees the same projection.
export const typedTableDocumentArbitrary = createDocumentArbitrary({
	keyedHeaders: false,
	minColumnCount: 1,
	scalarArbitrary: richCellValueArbitrary,
	titledRows: false,
});

const keyedTableDocumentArbitrary = createDocumentArbitrary({
	headerArbitrary: headerStringArbitrary,
	keyedHeaders: true,
	minColumnCount: 1,
	titledRows: false,
});

// Satisfies both JSON's key restrictions and Records' title restrictions, so
// one document can travel through every registered codec in sequence.
export const universallySerializableDocumentArbitrary = createDocumentArbitrary(
	{
		headerArbitrary: headerStringArbitrary,
		keyedHeaders: true,
		minColumnCount: 2,
		titledRows: true,
	},
);

const codecDocumentArbitraries: Record<CodecId, fc.Arbitrary<TableDocument>> = {
	markdown: tableDocumentArbitrary,
	csv: tableDocumentArbitrary,
	tsv: tableDocumentArbitrary,
	html: tableDocumentArbitrary,
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

interface FormattingChoice {
	readonly mark: InlineMark;
	readonly markRange: readonly [number, number];
	readonly url: string | undefined;
	readonly linkRange: readonly [number, number];
}

// Start from each codec's grammar-safe document and format some headers and
// cells without changing what they read as: a mark over a range, then a link
// over another. The projection every codec serializes is therefore exactly the
// plain document's, which isolates the property on structure preservation.
export function formattedCodecDocumentArbitrary(
	codec: TableCodec,
): fc.Arbitrary<TableDocument> {
	const formatting: fc.Arbitrary<FormattingChoice | undefined> = fc.option(
		fc.record({
			mark: fc.constantFrom<InlineMark>(
				"bold",
				"italic",
				"underline",
				"strikethrough",
				"code",
			),
			markRange: fc.tuple(fc.nat(24), fc.nat(24)),
			url: fc.option(inlineUrlArbitrary, { nil: undefined }),
			linkRange: fc.tuple(fc.nat(24), fc.nat(24)),
		}),
		{ nil: undefined },
	);
	const format = (
		text: string,
		choice: FormattingChoice | undefined,
	): TextContent => {
		if (choice === undefined) return text;
		const [markFrom, markTo] = choice.markRange;
		const marked = setMark(text, markFrom, markTo, choice.mark, true);
		if (choice.url === undefined) return marked;
		const [linkFrom, linkTo] = choice.linkRange;
		return setLink(marked, linkFrom, linkTo, choice.url) ?? marked;
	};

	return codecDocumentArbitrary(codec)
		.filter((document) =>
			documentToMatrix(document).every((row) =>
				row.every((value) => !value.includes("\r")),
			),
		)
		.chain((document) => {
			const cellCount = document.rows.length * document.columns.length;
			return fc
				.record({
					headers: fc.array(formatting, {
						minLength: document.columns.length,
						maxLength: document.columns.length,
					}),
					cells: fc.array(formatting, {
						minLength: cellCount,
						maxLength: cellCount,
					}),
				})
				.map(({ headers, cells }) => {
					let cellIndex = 0;
					const columns = document.columns.map((column, index) => ({
						...column,
						header: format(cellText(column.header), headers[index]),
					}));
					const rows = document.rows.map((row) => ({
						...row,
						cells: Object.fromEntries(
							document.columns.map((column) => {
								const value = readCell(row, column.id);
								const choice = cells[cellIndex];
								cellIndex += 1;
								return [
									column.id,
									typeof value === "string" ? format(value, choice) : value,
								];
							}),
						),
					}));
					return { columns, rows };
				});
		})
		.filter(
			(document) =>
				document.columns.some((column) => isInlineContent(column.header)) ||
				document.rows.some((row) =>
					Object.values(row.cells).some(isInlineContent),
				),
		);
}

// Inline content with no carriage return anywhere, since every text format
// that spells structure folds one into a line break (the separately tracked
// line-ending contract), and this property is about structure.
const lineFeedInlineContentArbitrary = inlineContentArbitrary.filter(
	(content) => !JSON.stringify(content.nodes).includes("\\r"),
);

// A codec's grammar-safe document with arbitrary inline content in some of its
// headers and cells: marks in every allowed combination, links, and images
// beside plain text. For the formats that spell structure, reading one back
// must give exactly the content that was written.
export function inlineCodecDocumentArbitrary(
	codec: TableCodec,
): fc.Arbitrary<TableDocument> {
	return codecDocumentArbitrary(codec)
		.filter((document) =>
			documentToMatrix(document).every((row) =>
				row.every((value) => !value.includes("\r")),
			),
		)
		.chain((document) => {
			const cellCount = document.rows.length * document.columns.length;
			const replacement = fc.option(lineFeedInlineContentArbitrary, {
				nil: undefined,
			});
			return fc
				.record({
					headers: fc.array(replacement, {
						minLength: document.columns.length,
						maxLength: document.columns.length,
					}),
					cells: fc.array(replacement, {
						minLength: cellCount,
						maxLength: cellCount,
					}),
				})
				.map(({ headers, cells }) => {
					let cellIndex = 0;
					const columns = document.columns.map((column, index) => ({
						...column,
						header: headers[index] ?? column.header,
					}));
					const rows = document.rows.map((row) => ({
						...row,
						cells: Object.fromEntries(
							document.columns.map((column) => {
								const value = cells[cellIndex] ?? readCell(row, column.id);
								cellIndex += 1;
								return [column.id, value];
							}),
						),
					}));
					return { columns, rows };
				});
		});
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
