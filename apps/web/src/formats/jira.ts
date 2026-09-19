import { cellTextContentAt } from "@/core/cell-value";
import type { TableDocument } from "@/core/types";
import { jiraConstructEnd, parseJiraCell, writeJiraCell } from "./jira-inline";
import {
	firstLineBlock,
	lineSpans,
	pipeCellSpans,
	toDocumentParseResult,
} from "./parse";
import { jiraRowStartAssistance } from "./row-start-assistance";
import type {
	MatrixParseResult,
	ParseIssue,
	SourceFieldRange,
	SourceRowRange,
	TableCodec,
} from "./types";

// Jira's wiki table syntax marks header cells with a doubled pipe:
//
//   ||Name||Role||Active||
//   |Ingrid|Designer|Yes|
//
// Like Markdown it is line-delimited and pipe-delimited. What a cell holds, its
// escapes and its inline syntax, belongs to jira-inline.ts.

// Splits a Jira row on unescaped single pipes, outside the links and images
// Jira reads first. Header rows arrive with their doubled pipes already
// collapsed by the caller. Unlike Markdown, Jira pads nothing, so a cell's
// surrounding space is its own.
function jiraCellSpans(line: string): SourceRowRange[] {
	return pipeCellSpans(line, jiraConstructEnd);
}

function splitJiraRow(line: string): string[] {
	return jiraCellSpans(line).map(({ from, to }) => line.slice(from, to));
}

// A header line with its doubled pipes collapsed to single ones, exactly as
// `replace(/\|\|/g, "|")` collapses them, keeping the offset in the original
// line of every collapsed character plus one past the end. A span found in the
// collapsed text maps back through it, which is what lets the header's fields
// come from the same splitter as every other row.
function collapseHeaderPipes(line: string): {
	readonly text: string;
	readonly offsets: readonly number[];
} {
	let text = "";
	const offsets: number[] = [];
	for (let index = 0; index < line.length; index += 1) {
		offsets.push(index);
		// An escaped character is content, so an escaped pipe beside a delimiter
		// is never read as half of a doubled one.
		if (line[index] === "\\" && index + 1 < line.length) {
			text += line.slice(index, index + 2);
			offsets.push(index + 1);
			index += 1;
			continue;
		}
		if (line[index] === "|" && line[index + 1] === "|") {
			text += "|";
			index += 1;
			continue;
		}
		text += line[index];
	}
	offsets.push(line.length);
	return { text, offsets };
}

const HEADER_LINE = /^\s*\|\|/;

// A Jira header line opens with a doubled pipe, which is also what makes its
// delimiters double rather than single. One owner for that rule, because the
// source editor reads the same structure to place empty-value markers.
export function isJiraHeaderLine(line: string): boolean {
	return HEADER_LINE.test(line);
}

function parseJiraMatrix(text: string): MatrixParseResult {
	const lines = text.split(/\r?\n/);
	const found = firstLineBlock(lines);
	if (!found) {
		return { ok: false, issues: [{ code: "empty-source" }] };
	}
	const { start, end } = found;
	const block = lines.slice(start, end);
	const headerLine = block[0];

	if (headerLine === undefined || !isJiraHeaderLine(headerLine)) {
		return {
			ok: false,
			issues: [
				{
					code: "jira-header-required",
					line: start + 1,
				},
			],
		};
	}

	// Collapse the header's doubled pipes so one splitter handles both rows.
	const headerCells = splitJiraRow(collapseHeaderPipes(headerLine).text).map(
		parseJiraCell,
	);

	const warnings: ParseIssue[] = [];
	const bodyRows = block.slice(1).map((line, offset) => {
		const cells = splitJiraRow(line);
		if (cells.length !== headerCells.length) {
			warnings.push({
				code: "row-column-count",
				row: offset + 1,
				actual: cells.length,
				expected: headerCells.length,
				line: start + 2 + offset,
			});
		}
		return cells.map(parseJiraCell);
	});

	return {
		ok: true,
		table: { matrix: [headerCells, ...bodyRows], headerRow: true },
		warnings: warnings.length > 0 ? warnings : undefined,
		// One line per row, header included, with its cells read by the same
		// splitter the rows above were (#255).
		rows: lineSpans(text)
			.slice(start, end)
			.map((line, index) => ({
				...line,
				cells: jiraLineCells(text.slice(line.from, line.to), index === 0).map(
					(cell) => ({ from: line.from + cell.from, to: line.from + cell.to }),
				),
			})),
	};
}

// Where each cell of one Jira line sits in that line. A header line's doubled
// pipes are collapsed for the splitter and its spans mapped back, so a header
// cell is placed in the line the user is editing.
function jiraLineCells(line: string, header: boolean): SourceRowRange[] {
	if (!header) return jiraCellSpans(line);
	const { text: collapsed, offsets } = collapseHeaderPipes(line);
	return jiraCellSpans(collapsed).map((cell) => ({
		from: offsets[cell.from] ?? line.length,
		to: offsets[cell.to] ?? line.length,
	}));
}

// The cells of the table block in reading order, header first. Every cell's
// text is content, so a field spans all of it, and the header's doubled pipes
// are mapped back to the line the user is editing.
function jiraFields(text: string): SourceFieldRange[] {
	const lines = text.split(/\r?\n/);
	const found = firstLineBlock(lines);
	if (!found) return [];
	const spans = lineSpans(text);
	const fields: SourceFieldRange[] = [];
	for (let index = found.start; index < found.end; index += 1) {
		const line = lines[index];
		const lineFrom = spans[index]?.from;
		if (line === undefined || lineFrom === undefined) continue;
		// Only the block's first line is read as a header, as the parse reads it;
		// a body line that happens to open with `||` is split like any other.
		const header = index === found.start && isJiraHeaderLine(line);
		for (const cell of jiraLineCells(line, header)) {
			fields.push({ from: lineFrom + cell.from, to: lineFrom + cell.to });
		}
	}
	return fields;
}

function serializeJira(document: TableDocument): string {
	const header = `||${document.columns
		.map((column) => writeJiraCell(column.header))
		.join("||")}||`;

	const body = document.rows.map(
		(row) =>
			`|${document.columns
				.map((column) => writeJiraCell(cellTextContentAt(row, column.id)))
				.join("|")}|`,
	);

	// Jira has no alignment syntax, so column alignment simply does not appear
	// here. It stays on the document and returns intact in Markdown.
	return [header, ...body].join("\n");
}

export const jiraCodec: TableCodec = {
	id: "jira",
	reconciliation: {
		cellValues: "text",
		columnAlignment: "unexpressed",
		inlineContent: "carried",
	},
	extension: "jira.txt",
	mimeType: "text/plain",
	mapsSourceRows: true,
	sourceFields: jiraFields,
	// Enter at the end of a row or of the header starts the next row with a
	// bare `|` (#391).
	structuralAssistance: jiraRowStartAssistance(isJiraHeaderLine),
	parseMatrix: parseJiraMatrix,
	parse: (text) => toDocumentParseResult(parseJiraMatrix(text)),
	serialize: serializeJira,
	sniffPriority: 30,
	canSniff: (text) => isJiraHeaderLine(text),
};
