import stringWidth from "string-width";
import { cellTextAt } from "@/core/cell-value";
import { EMPTY_VALUE_PLACEHOLDER } from "@/core/empty-value";
import type { Alignment, TableDocument } from "@/core/types";
import { toDocumentParseResult } from "./parse";
import type {
	EscapeMatcher,
	MatrixParseResult,
	ParseIssue,
	TableCodec,
} from "./types";

// The three ways a line break can be spelled in a Markdown cell, longest first
// so a match is never a prefix of a longer one. Both directions of the grammar
// read this list, so a spelling can never be escaped without being decodable.
const BREAK_SPELLINGS = ["<br />", "<br/>", "<br>"] as const;

function breakSpellingAt(value: string, index: number): string | null {
	for (const spelling of BREAK_SPELLINGS) {
		if (value.startsWith(spelling, index)) return spelling;
	}
	return null;
}

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
		if (char === undefined) break;
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
		if (char === "<") {
			const spelling = breakSpellingAt(source, index);
			if (spelling) {
				out += `\\${spelling}`;
				index += spelling.length - 1;
				continue;
			}
		}
		out += char;
	}
	return out;
}

// Every character the escaper rewrites, plus whitespace at either boundary. A
// cell matching none of them is returned by `escapeCell` unchanged, so the fast
// path below can skip the loop. The class is deliberately wider than the
// grammar: `<` sends every tag-like cell down the general path rather than only
// the three `<br>` spellings, and `\s` carries the `u` flag the boundary
// encoding uses, so a non-breaking space is not mistaken for an ordinary one.
const NEEDS_ESCAPING = /^\s|\s$|[&\\|\n\r<]/u;

// `.length` is the display width only inside printable ASCII. #186 chose
// `string-width` so CJK and emoji align in a monospaced editor, and measuring
// anything outside this range by length would reintroduce that defect while
// looking correct in a Latin fixture.
const ASCII_PRINTABLE = /^[\x20-\x7e]*$/;

export interface EscapedCell {
	readonly text: string;
	readonly width: number;
}

function displayWidth(text: string): number {
	return ASCII_PRINTABLE.test(text) ? text.length : stringWidth(text);
}

// One escaping implementation with two entry points. The serializer needs each
// cell's escaped text and its display width together, and measuring here is
// what lets the width scan and the padding pass share one measurement instead
// of calling `stringWidth` twice per cell. Cells that need no escaping skip the
// loop entirely; everything else goes through `escapeCell` itself, so the
// grammar of docs/adr/0002 stays in exactly one place.
export function escapeAndMeasure(value: string): EscapedCell {
	const text = NEEDS_ESCAPING.test(value) ? escapeCell(value) : value;
	return { text, width: displayWidth(text) };
}

// Sticky, so the entity match is anchored at `lastIndex` instead of searching
// forward, with none of the copying that matching `^` against a fresh slice of
// the remaining cell required.
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/sticky
const ENTITY = /&#([0-9]+);/y;

// The one reader of Markdown's escape grammar, at one offset. Only `&`, `\`,
// and `<` can begin an escape sequence, so the switch reaches the right branch
// directly and an ordinary character falls straight through with no test at
// all. A branch that matches nothing must reach the same `null`: `break` leaves
// the switch, where returning early would swallow a trailing backslash or a
// lone `<`.
//
// The decoder below and the source view's escape glyphs both read this, so
// there is exactly one description of what `&#32;` stands for and the editor
// never becomes a second parser. What a match reports is never examined again,
// which is what keeps literal text such as `&amp;#32;` literal once its
// protected ampersand is restored.
export const matchMarkdownEscape: EscapeMatcher = (value, index) => {
	switch (value[index]) {
		// Decode only the entity forms the serializer emits.
		case "&": {
			if (value.startsWith("&amp;", index)) {
				return { source: "&amp;", decoded: "&", kind: "character" };
			}
			// Set on every attempt rather than trusting what the previous call
			// left behind: the regex is shared module state, and a stale
			// `lastIndex` after a failed match is the classic defect with this
			// flag.
			ENTITY.lastIndex = index;
			const entity = ENTITY.exec(value);
			const decimal = entity?.[1];
			if (entity && decimal !== undefined) {
				const codePoint = Number(decimal);
				const decoded =
					codePoint <= 0x10ffff && String(codePoint) === decimal
						? String.fromCodePoint(codePoint)
						: "";
				if (codePoint !== 13 && /^\s$/u.test(decoded)) {
					return { source: entity[0], decoded, kind: "whitespace" };
				}
			}
			break;
		}
		// Longest escape first, and every escaped break form before the plain
		// backslash rule, or `\<br>` would decode as a backslash followed by a
		// line break.
		case "\\": {
			const spelling = breakSpellingAt(value, index + 1);
			if (spelling) {
				return {
					source: `\\${spelling}`,
					decoded: spelling,
					kind: "character",
				};
			}
			if (value.startsWith("\\\\", index)) {
				return { source: "\\\\", decoded: "\\", kind: "character" };
			}
			if (value.startsWith("\\|", index)) {
				return { source: "\\|", decoded: "|", kind: "character" };
			}
			break;
		}
		case "<": {
			const spelling = breakSpellingAt(value, index);
			if (spelling) {
				return { source: spelling, decoded: "\n", kind: "line-break" };
			}
			break;
		}
	}
	return null;
};

export function unescapeCell(value: string): string {
	let out = "";
	for (let index = 0; index < value.length; index += 1) {
		const char = value[index];
		if (char === undefined) break;
		const match = matchMarkdownEscape(value, index);
		if (match) {
			out += match.decoded;
			index += match.source.length - 1;
			continue;
		}
		out += char;
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
	while (end < lines.length) {
		const line = lines[end];
		if (line === undefined || line.trim() === "") break;
		end += 1;
	}
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
		return cells.map(unescapeCell);
	});

	// Ragged rows are padded rather than rejected: the user is mid-edit, and
	// their data should survive it.
	const matrix = [headerCells.map(unescapeCell), ...bodyRows];
	return {
		ok: true,
		table: {
			matrix,
			headerRow: true,
			alignments: delimiterCells.map(alignmentOf),
		},
		warnings: warnings.length > 0 ? warnings : undefined,
	};
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
	const widths: number[] = document.columns.map(() => 3);
	const reserve = (index: number, cell: EscapedCell): EscapedCell => {
		const reserved =
			cell.text === "" ? EMPTY_VALUE_PLACEHOLDER.length : cell.width;
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
			reserve(index, escapeAndMeasure(cellTextAt(row, column.id))),
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
	},
	extension: "md",
	mimeType: "text/markdown",
	parseMatrix: parseMarkdownMatrix,
	parse: (text) => toDocumentParseResult(parseMarkdownMatrix(text)),
	serialize: serializeMarkdown,
	sniffPriority: 20,
	canSniff: (text) => text.includes("|"),
};
