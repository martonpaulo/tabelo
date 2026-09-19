import { cellTextContentAt } from "@/core/cell-value";
import type { TableDocument, TextContent } from "@/core/types";
import { markdownAssistance } from "./markdown-assistance";
import {
	alignmentMarker,
	alignmentOf,
	displayWidth,
	isDelimiterRow,
	MIN_DIVIDER_WIDTH,
	reservedWidth,
	splitRow,
} from "./markdown-grammar";
import { parseMarkdownCell, writeMarkdownCell } from "./markdown-inline";
import {
	firstLineBlock,
	lineSpans,
	pipeCellSpans,
	toDocumentParseResult,
} from "./parse";
import type {
	MatrixParseResult,
	ParseIssue,
	SourceFieldRange,
	SourceRowRange,
	SourceTableRow,
	TableCodec,
} from "./types";

// Every character the escaper rewrites, plus whitespace at either boundary. A
// plain cell matching none of them is returned by `escapeCell` unchanged, so
// the fast path below can skip the writer. The class is deliberately wider than
// the grammar: `<` sends every tag-like cell down the general path rather than
// only the spellings the decoder reads, `_`, `*`, and `~` go there even where
// they stay literal, and `\s` carries the `u` flag the boundary encoding uses,
// so a non-breaking space is not mistaken for an ordinary one.
const NEEDS_ESCAPING = /^\s|\s$|[&\\|\n\r<*_~`[\]!]/u;

export interface EscapedCell {
	readonly text: string;
	readonly width: number;
}

// One escaping implementation with two entry points. The serializer needs each
// cell's escaped text and its display width together, and measuring here is
// what lets the width scan and the padding pass share one measurement instead
// of calling `stringWidth` twice per cell. Plain cells that need no escaping
// skip the writer entirely; everything else goes through it, so the grammar of
// docs/adr/0002 and docs/adr/0011 stays in exactly one place.
export function escapeAndMeasure(value: TextContent): EscapedCell {
	const text =
		typeof value === "string" && !NEEDS_ESCAPING.test(value)
			? value
			: writeMarkdownCell(value);
	return { text, width: displayWidth(text) };
}

// The header row owns the alignment divider under it: the divider is how
// Markdown says the line above is a header, not a row of its own. Every body
// line after it is one row.
// Every line's cells come from the same scanner that splits it for the parse,
// so a cell the mapping names is exactly the cell the parse read (#255).
function markdownRows(
	text: string,
	start: number,
	end: number,
): SourceTableRow[] {
	const spans = lineSpans(text).slice(start, end);
	const [header, divider, ...body] = spans;
	if (!header || !divider) return [];
	return [
		{ from: header.from, to: divider.to, cells: lineCells(text, header) },
		...body.map((line) => ({ ...line, cells: lineCells(text, line) })),
	];
}

function lineCells(text: string, line: SourceRowRange): SourceRowRange[] {
	return pipeCellSpans(text.slice(line.from, line.to)).map((cell) => ({
		from: line.from + cell.from,
		to: line.from + cell.to,
	}));
}

function parseMarkdownMatrix(text: string): MatrixParseResult {
	const lines = text.split(/\r?\n/);
	// A Markdown table is a contiguous block of non-blank lines.
	const found = firstLineBlock(lines);
	if (!found) {
		return { ok: false, issues: [{ code: "empty-source" }] };
	}
	const { start, end } = found;
	const block = lines.slice(start, end);
	const headerLine = block[0];
	const delimiterLine = block[1];

	if (headerLine === undefined || delimiterLine === undefined) {
		return {
			ok: false,
			issues: [
				{
					code: "markdown-table-incomplete",
					line: start + 1,
				},
			],
		};
	}

	const headerCells = splitRow(headerLine);
	const delimiterCells = splitRow(delimiterLine);

	if (!isDelimiterRow(delimiterCells)) {
		return {
			ok: false,
			issues: [
				{
					code: "markdown-divider-required",
					line: start + 2,
				},
			],
		};
	}

	if (delimiterCells.length !== headerCells.length) {
		return {
			ok: false,
			issues: [
				{
					code: "markdown-divider-column-count",
					actual: delimiterCells.length,
					expected: headerCells.length,
					line: start + 2,
				},
			],
		};
	}

	const warnings: ParseIssue[] = [];
	const bodyRows = block.slice(2).map((line, offset) => {
		const cells = splitRow(line);
		if (cells.length !== headerCells.length) {
			warnings.push({
				code: "row-column-count",
				row: offset + 1,
				actual: cells.length,
				expected: headerCells.length,
				line: start + 3 + offset,
			});
		}
		return cells.map(parseMarkdownCell);
	});

	// Ragged rows are padded rather than rejected: the user is mid-edit, and
	// their data should survive it.
	const matrix = [headerCells.map(parseMarkdownCell), ...bodyRows];
	return {
		ok: true,
		table: {
			matrix,
			headerRow: true,
			alignments: delimiterCells.map(alignmentOf),
		},
		warnings: warnings.length > 0 ? warnings : undefined,
		rows: markdownRows(text, start, end),
	};
}

// A cell's padding is layout, not content, so a field starts at its first
// visible character. An empty cell keeps one space of padding before the
// caret when it has any, which is where the serializer would put its text.
function markdownField(
	lineFrom: number,
	line: string,
	span: SourceRowRange,
): SourceFieldRange {
	const cell = line.slice(span.from, span.to);
	const leading = cell.length - cell.trimStart().length;
	if (leading === cell.length) {
		const caret = lineFrom + Math.min(span.from + 1, span.to);
		return { from: caret, to: caret };
	}
	return {
		from: lineFrom + span.from + leading,
		to: lineFrom + span.from + cell.trimEnd().length,
	};
}

// The cells of the table block in reading order, header first. The alignment
// divider holds no content, so it is skipped when it is one; while the user is
// still writing it, whatever the second line holds is treated as a row.
function markdownFields(text: string): SourceFieldRange[] {
	const lines = text.split(/\r?\n/);
	const found = firstLineBlock(lines);
	if (!found) return [];
	const spans = lineSpans(text);
	const fields: SourceFieldRange[] = [];
	for (let index = found.start; index < found.end; index += 1) {
		const line = lines[index];
		const lineFrom = spans[index]?.from;
		if (line === undefined || lineFrom === undefined) continue;
		const cells = pipeCellSpans(line);
		if (
			index === found.start + 1 &&
			isDelimiterRow(cells.map(({ from, to }) => line.slice(from, to).trim()))
		) {
			continue;
		}
		for (const cell of cells) fields.push(markdownField(lineFrom, line, cell));
	}
	return fields;
}

function serializeMarkdown(document: TableDocument): string {
	// Pad columns to a common width so the source stays readable by hand. An
	// empty cell is padded to hold the empty-value placeholder, because a source
	// view draws that word where the cell's value would be: reserving the room
	// here is what keeps the column aligned around it, and keeps the file the
	// one place a table's layout is decided. The padding does not depend on
	// whether anyone has that indicator switched on, so the bytes are the same
	// either way. See core/empty-value.ts.
	//
	// The room reserved in the column and the width the cell is padded from
	// disagree for exactly one input, the empty cell: it reserves the
	// placeholder's length and is padded from an actual width of zero. Both are
	// derived from the one measurement the cell carries, so the escape pass and
	// the padding pass never measure the same cell twice.
	const widths: number[] = document.columns.map(() => MIN_DIVIDER_WIDTH);
	const reserve = (index: number, cell: EscapedCell): EscapedCell => {
		const reserved = reservedWidth(cell.text, cell.width);
		const current = widths[index];
		if (current === undefined) {
			throw new Error("Markdown column width is missing.");
		}
		if (reserved > current) widths[index] = reserved;
		return cell;
	};

	// One pass: each cell is escaped, measured, and folded into its column's
	// maximum as it is produced. The widths are complete once this is done.
	const headers = document.columns.map((column, index) =>
		reserve(index, escapeAndMeasure(column.header)),
	);
	const body = document.rows.map((row) =>
		document.columns.map((column, index) =>
			reserve(index, escapeAndMeasure(cellTextContentAt(row, column.id))),
		),
	);

	const widthAt = (index: number): number => {
		const width = widths[index];
		if (width === undefined) {
			throw new Error("Markdown column width is missing.");
		}
		return width;
	};

	const line = (cells: readonly EscapedCell[]) =>
		`| ${cells
			.map(
				(cell, index) =>
					`${cell.text}${" ".repeat(Math.max(0, widthAt(index) - cell.width))}`,
			)
			.join(" | ")} |`;

	const divider = `| ${document.columns
		.map((column, index) => alignmentMarker(column.align, widthAt(index)))
		.join(" | ")} |`;

	return [line(headers), divider, ...body.map(line)].join("\n");
}

export const markdownCodec: TableCodec = {
	id: "markdown",
	reconciliation: {
		cellValues: "text",
		columnAlignment: "carried",
		inlineContent: "carried",
	},
	extension: "md",
	mimeType: "text/markdown",
	mapsSourceRows: true,
	alignsSourceColumns: true,
	sourceFields: markdownFields,
	structuralAssistance: markdownAssistance,
	parseMatrix: parseMarkdownMatrix,
	parse: (text) => toDocumentParseResult(parseMarkdownMatrix(text)),
	serialize: serializeMarkdown,
	sniffPriority: 20,
	canSniff: (text) => text.includes("|"),
};
