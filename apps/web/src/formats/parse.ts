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
