import { documentFromMatrix } from "@/core/document";
import type { MatrixParseResult, ParseResult, SourceRowRange } from "./types";

export function toDocumentParseResult(result: MatrixParseResult): ParseResult {
	if (!result.ok) return result;

	return {
		ok: true,
		document: documentFromMatrix(result.table.matrix, {
			headerRow: result.table.headerRow ?? true,
			alignments: result.table.alignments,
		}),
		warnings: result.warnings,
		rows: result.rows,
	};
}

// The span of every text line, split the way the line-based formats split
// them, so a line index from their parse becomes source offsets directly.
export function lineSpans(text: string): SourceRowRange[] {
	const spans: SourceRowRange[] = [];
	const lineBreak = /\r?\n/g;
	let from = 0;
	for (const match of text.matchAll(lineBreak)) {
		spans.push({ from, to: match.index });
		from = match.index + match[0].length;
	}
	spans.push({ from, to: text.length });
	return spans;
}

// The first contiguous block of non-blank lines, as line indices with `end`
// exclusive. Markdown and Jira both read one table from exactly this block and
// ignore anything after the blank line that ends it.
export function firstLineBlock(
	lines: readonly string[],
): { readonly start: number; readonly end: number } | null {
	const start = lines.findIndex((line) => line.trim() !== "");
	if (start === -1) return null;
	let end = start;
	while (end < lines.length) {
		const line = lines[end];
		if (line === undefined || line.trim() === "") break;
		end += 1;
	}
	return { start, end };
}

// Where each cell of one pipe-delimited line sits within that line, honouring
// backslash-escaped pipes and ignoring the outer pipes and surrounding blank
// space. The one scanner behind Markdown's and Jira's row splitting and behind
// their Tab field navigation (#54): the parse reads the text of these spans,
// the source view reads their offsets, so the two can never disagree about
// where a cell is.
export function pipeCellSpans(line: string): SourceRowRange[] {
	const start = line.length - line.trimStart().length;
	const end = Math.max(start, line.trimEnd().length);
	const spans: SourceRowRange[] = [];
	let from = start;
	let endedOnPipe = false;

	for (let index = start; index < end; index += 1) {
		const char = line[index];
		if (char === "\\" && index + 1 < end) {
			index += 1;
			endedOnPipe = false;
			continue;
		}
		if (char === "|") {
			spans.push({ from, to: index });
			from = index + 1;
			endedOnPipe = true;
			continue;
		}
		endedOnPipe = false;
	}
	spans.push({ from, to: end });

	if (line[start] === "|") spans.shift();
	if (endedOnPipe && spans.length > 0) spans.pop();

	return spans;
}
