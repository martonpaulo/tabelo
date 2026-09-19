import { cellTextContentAt } from "@/core/cell-value";
import type { TableDocument, TextContent } from "@/core/types";
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
	StructuralAssistance,
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

// How an empty cell is spelled in a row. Jira reads two adjacent pipes as a
// header delimiter, not as a cell with nothing in it, so `|a||c|` is a header
// cell `c` and a row of empty cells written `||||` is a header line holding
// nothing. Atlassian records that a cell holding one space is what renders as
// an empty cell: https://jira.atlassian.com/browse/JRASERVER-70048
//
// So an empty value is written as one space, and a value that is exactly one
// space is written as its character reference, which the cell grammar already
// decodes. Each spelling reads back as what wrote it, and a field of one space
// is the only text read differently from its content.
const EMPTY_FIELD = " ";
const ONE_SPACE_FIELD = "&#32;";

function writeJiraField(value: TextContent): string {
	const written = writeJiraCell(value);
	if (written === "") return EMPTY_FIELD;
	if (written === EMPTY_FIELD) return ONE_SPACE_FIELD;
	return written;
}

function readJiraField(raw: string): TextContent {
	return raw === EMPTY_FIELD ? "" : parseJiraCell(raw);
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
		readJiraField,
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
		return cells.map(readJiraField);
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
		.map((column) => writeJiraField(column.header))
		.join("||")}||`;

	const body = document.rows.map(
		(row) =>
			`|${document.columns
				.map((column) => writeJiraField(cellTextContentAt(row, column.id)))
				.join("|")}|`,
	);

	// Jira has no alignment syntax, so column alignment simply does not appear
	// here. It stays on the document and returns intact in Markdown.
	return [header, ...body].join("\n");
}

// Empty-cell fill: a named structural-assistance feature under "Source text is
// free; structural assistance is narrow" in AGENTS.md, needed because an empty
// cell is spelled with one space. Typing into that cell would otherwise keep
// the space beside what was typed, and `|x |` is the value `x ` with a
// trailing space nobody meant.
//
// - Syntax: a field of the table block, as `jiraFields` reads it, whose text is
//   exactly the one space an empty cell is written with.
// - Trigger: text with no line break and not only spaces, inserted at either
//   edge of that field, and nothing else changed.
// - Change: that one space removed. The caret stays after what was typed.
//
// Everything else, including a paste across a delimiter, a selection replaced
// by text, several carets, or a space typed into the field, stays as typed.
const jiraEmptyCellFill: StructuralAssistance = (before, after, changed) => {
	const [edit, ...others] = changed;
	if (!edit || others.length > 0) return null;
	const at = edit.from;
	const inserted = after.slice(at, edit.to);
	if (inserted.trim() === "" || /[\r\n]/.test(inserted)) return null;
	if (after.length !== before.length + inserted.length) return null;
	if (!after.startsWith(before.slice(0, at))) return null;
	if (!after.endsWith(before.slice(at))) return null;
	const field = jiraFields(before).find(
		({ from, to }) =>
			before.slice(from, to) === EMPTY_FIELD && (at === from || at === to),
	);
	if (!field) return null;
	// Typed before the space, the space now follows the typed text; typed after
	// it, the space is where it was.
	const space = at === field.from ? edit.to : field.from;
	return [{ from: space, to: space + EMPTY_FIELD.length, insert: "" }];
};

const jiraRowStart = jiraRowStartAssistance(isJiraHeaderLine);

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
	// bare `|` (#391). Typing into an empty cell replaces the space that spells
	// it. The two never compete: one wants a line break, the other refuses one.
	structuralAssistance: (before, after, changed) =>
		jiraRowStart(before, after, changed) ??
		jiraEmptyCellFill(before, after, changed),
	parseMatrix: parseJiraMatrix,
	parse: (text) => toDocumentParseResult(parseJiraMatrix(text)),
	serialize: serializeJira,
	sniffPriority: 30,
	canSniff: (text) => isJiraHeaderLine(text),
};
