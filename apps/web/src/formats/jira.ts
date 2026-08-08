import type { TableDocument } from "@/core/types";
import { toDocumentParseResult } from "./parse";
import type { MatrixParseResult, ParseIssue, TableCodec } from "./types";

// Jira's wiki table syntax marks header cells with a doubled pipe:
//
//   ||Name||Role||Active||
//   |Ingrid|Designer|Yes|
//
// Like Markdown it is line-delimited and pipe-delimited, so pipes and newlines
// inside a cell have to be escaped reversibly. Jira renders `\\` as a forced
// line break, which is the closest equivalent to Markdown's `<br>`.
// Atlassian documents that break syntax here:
// https://confluence.atlassian.com/conf101/confluence-wiki-markup-1652924946.html
// A Jira defect records `&#92;` as the compatible literal-backslash spelling:
// https://jira.atlassian.com/browse/JRASERVER-76901

export function escapeJiraCell(value: string): string {
	let out = "";
	for (let index = 0; index < value.length; index += 1) {
		const char = value[index];
		if (char === "&") {
			out += "&amp;";
			continue;
		}
		if (char === "\\") {
			out += "&#92;";
			continue;
		}
		if (char === "|") {
			out += "\\|";
			continue;
		}
		if (char === "\r") {
			if (value[index + 1] === "\n") continue;
			out += "\\\\";
			continue;
		}
		if (char === "\n") {
			out += "\\\\";
			continue;
		}
		out += char;
	}
	return out;
}

export function unescapeJiraCell(value: string): string {
	let out = "";
	for (let index = 0; index < value.length; index += 1) {
		// Scan the serialized source once. Restored output is never examined
		// again, which keeps literal entity-like user text reversible.
		if (value.startsWith("\\\\", index)) {
			out += "\n";
			index += 1;
			continue;
		}
		if (value.startsWith("\\|", index)) {
			out += "|";
			index += 1;
			continue;
		}
		if (value.startsWith("&#92;", index)) {
			out += "\\";
			index += 4;
			continue;
		}
		if (value.startsWith("&amp;", index)) {
			out += "&";
			index += 4;
			continue;
		}
		out += value[index];
	}
	return out;
}

// Splits a Jira row on unescaped single pipes. Header rows arrive with their
// doubled pipes already collapsed by the caller.
function splitJiraRow(line: string): string[] {
	const source = line.trim();
	const parts: string[] = [];
	let current = "";
	let endedOnPipe = false;

	for (let index = 0; index < source.length; index += 1) {
		const char = source[index];
		if (char === "\\" && index + 1 < source.length) {
			current += char + source[index + 1];
			index += 1;
			endedOnPipe = false;
			continue;
		}
		if (char === "|") {
			parts.push(current);
			current = "";
			endedOnPipe = true;
			continue;
		}
		current += char;
		endedOnPipe = false;
	}
	parts.push(current);

	if (source.startsWith("|")) parts.shift();
	if (endedOnPipe && parts.length > 0) parts.pop();

	return parts;
}

const HEADER_LINE = /^\s*\|\|/;

function parseJiraMatrix(text: string): MatrixParseResult {
	const lines = text.split(/\r?\n/);
	const start = lines.findIndex((line) => line.trim() !== "");

	if (start === -1) {
		return { ok: false, issues: [{ code: "empty-source" }] };
	}

	let end = start;
	while (end < lines.length && lines[end].trim() !== "") end += 1;
	const block = lines.slice(start, end);

	if (!HEADER_LINE.test(block[0])) {
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
	const headerCells = splitJiraRow(block[0].replace(/\|\|/g, "|")).map(
		unescapeJiraCell,
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
		return cells.map(unescapeJiraCell);
	});

	return {
		ok: true,
		table: { matrix: [headerCells, ...bodyRows] },
		warnings: warnings.length > 0 ? warnings : undefined,
	};
}

function serializeJira(document: TableDocument): string {
	const header = `||${document.columns
		.map((column) => escapeJiraCell(column.header))
		.join("||")}||`;

	const body = document.rows.map(
		(row) =>
			`|${document.columns
				.map((column) => escapeJiraCell(row.cells[column.id] ?? ""))
				.join("|")}|`,
	);

	// Jira has no alignment syntax, so column alignment simply does not appear
	// here. It stays on the document and returns intact in Markdown.
	return [header, ...body].join("\n");
}

export const jiraCodec: TableCodec = {
	id: "jira",
	extension: "jira.txt",
	mimeType: "text/plain",
	parseMatrix: parseJiraMatrix,
	parse: (text) => toDocumentParseResult(parseJiraMatrix(text)),
	serialize: serializeJira,
	sniffPriority: 30,
	canSniff: (text) => HEADER_LINE.test(text),
};
