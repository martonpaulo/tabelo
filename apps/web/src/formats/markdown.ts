import type { Alignment, TableDocument } from "@/core/types";
import { toDocumentParseResult } from "./parse";
import type { MatrixParseResult, ParseIssue, TableCodec } from "./types";

// Markdown cannot hold a literal pipe or line break inside a table cell, so
// both are escaped rather than dropped. The transformation must be exactly
// reversible. See docs/adr/0002. This is why the escape sequences
// themselves (`\`, `\|`, and a literal `<br>`) are escaped too.
export function escapeCell(value: string): string {
	const source = value.replace(/\r\n?/g, "\n");
	const leadingWhitespace = source.match(/^\s*/u)?.[0].length ?? 0;
	const trailingWhitespace = source.match(/\s*$/u)?.[0].length ?? 0;
	const trailingWhitespaceStart = source.length - trailingWhitespace;
	let out = "";
	for (let index = 0; index < source.length; index += 1) {
		const char = source[index];
		if (
			/^\s$/u.test(char) &&
			(index < leadingWhitespace || index >= trailingWhitespaceStart)
		) {
			out += `&#${char.codePointAt(0)};`;
			continue;
		}
		if (char === "&") {
			out += "&amp;";
			continue;
		}
		if (char === "\\") {
			out += "\\\\";
			continue;
		}
		if (char === "|") {
			out += "\\|";
			continue;
		}
		if (char === "\n") {
			out += "<br>";
			continue;
		}
		// Every spelling the decoder recognises has to be escaped here, or a
		// literal `<br/>` typed by the user would come back as a line break.
		if (source.startsWith("<br />", index)) {
			out += "\\<br />";
			index += 5;
			continue;
		}
		if (source.startsWith("<br/>", index)) {
			out += "\\<br/>";
			index += 4;
			continue;
		}
		if (source.startsWith("<br>", index)) {
			out += "\\<br>";
			index += 3;
			continue;
		}
		out += char;
	}
	return out;
}

export function unescapeCell(value: string): string {
	let out = "";
	for (let index = 0; index < value.length; index += 1) {
		// Decode only the entity forms the serializer emits. Appended output is
		// never scanned again, so literal text such as `&#32;` stays literal after
		// its protected ampersand is restored.
		if (value.startsWith("&amp;", index)) {
			out += "&";
			index += 4;
			continue;
		}
		const entity = value.slice(index).match(/^&#([0-9]+);/);
		if (entity) {
			const codePoint = Number(entity[1]);
			const decoded =
				codePoint <= 0x10ffff && String(codePoint) === entity[1]
					? String.fromCodePoint(codePoint)
					: "";
			if (codePoint !== 13 && /^\s$/u.test(decoded)) {
				out += decoded;
				index += entity[0].length - 1;
				continue;
			}
		}
		// Longest escape first, and every escaped break form before the plain
		// backslash rule, or `\<br>` would decode as a backslash followed by a
		// line break.
		if (value.startsWith("\\<br />", index)) {
			out += "<br />";
			index += 6;
			continue;
		}
		if (value.startsWith("\\<br/>", index)) {
			out += "<br/>";
			index += 5;
			continue;
		}
		if (value.startsWith("\\<br>", index)) {
			out += "<br>";
			index += 4;
			continue;
		}
		if (value.startsWith("\\\\", index)) {
			out += "\\";
			index += 1;
			continue;
		}
		if (value.startsWith("\\|", index)) {
			out += "|";
			index += 1;
			continue;
		}
		if (value.startsWith("<br />", index)) {
			out += "\n";
			index += 5;
			continue;
		}
		if (value.startsWith("<br/>", index)) {
			out += "\n";
			index += 4;
			continue;
		}
		if (value.startsWith("<br>", index)) {
			out += "\n";
			index += 3;
			continue;
		}
		out += value[index];
	}
	return out;
}

// Splits one table line into raw cells, honouring escaped pipes.
function splitRow(line: string): string[] {
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

	return parts.map((part) => part.trim());
}

const DELIMITER_CELL = /^:?-+:?$/;

function isDelimiterRow(cells: readonly string[]): boolean {
	return cells.length > 0 && cells.every((cell) => DELIMITER_CELL.test(cell));
}

function alignmentOf(cell: string): Alignment {
	const left = cell.startsWith(":");
	const right = cell.endsWith(":");
	if (left && right) return "center";
	if (right) return "right";
	if (left) return "left";
	return "default";
}

function alignmentMarker(align: Alignment, width: number): string {
	const dashes = "-".repeat(Math.max(3, width));
	switch (align) {
		case "left":
			return `:${dashes.slice(1)}`;
		case "right":
			return `${dashes.slice(1)}:`;
		case "center":
			return `:${dashes.slice(2)}:`;
		default:
			return dashes;
	}
}

function parseMarkdownMatrix(text: string): MatrixParseResult {
	const lines = text.split(/\r?\n/);
	const start = lines.findIndex((line) => line.trim() !== "");

	if (start === -1) {
		return { ok: false, issues: [{ code: "empty-source" }] };
	}

	// A Markdown table is a contiguous block of non-blank lines.
	let end = start;
	while (end < lines.length && lines[end].trim() !== "") end += 1;
	const block = lines.slice(start, end);

	if (block.length < 2) {
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

	const headerCells = splitRow(block[0]);
	const delimiterCells = splitRow(block[1]);

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
		return cells.map(unescapeCell);
	});

	// Ragged rows are padded rather than rejected: the user is mid-edit, and
	// their data should survive it.
	const matrix = [headerCells.map(unescapeCell), ...bodyRows];
	return {
		ok: true,
		table: {
			matrix,
			alignments: delimiterCells.map(alignmentOf),
		},
		warnings: warnings.length > 0 ? warnings : undefined,
	};
}

function serializeMarkdown(document: TableDocument): string {
	const headers = document.columns.map((column) => escapeCell(column.header));
	const body = document.rows.map((row) =>
		document.columns.map((column) => escapeCell(row.cells[column.id] ?? "")),
	);

	// Pad columns to a common width so the source stays readable by hand.
	const widths = document.columns.map((_, index) =>
		Math.max(
			headers[index]?.length ?? 0,
			...body.map((cells) => cells[index]?.length ?? 0),
			3,
		),
	);

	const line = (cells: readonly string[]) =>
		`| ${cells.map((cell, index) => cell.padEnd(widths[index])).join(" | ")} |`;

	const divider = `| ${document.columns
		.map((column, index) => alignmentMarker(column.align, widths[index]))
		.join(" | ")} |`;

	return [line(headers), divider, ...body.map(line)].join("\n");
}

export const markdownCodec: TableCodec = {
	id: "markdown",
	extension: "md",
	mimeType: "text/markdown",
	parseMatrix: parseMarkdownMatrix,
	parse: (text) => toDocumentParseResult(parseMarkdownMatrix(text)),
	serialize: serializeMarkdown,
	sniffPriority: 20,
	canSniff: (text) => text.includes("|"),
};
