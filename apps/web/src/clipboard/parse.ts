import { normalizeMatrix } from "@/core/document";
import type { Alignment, CellValue } from "@/core/types";
import { listSniffableCodecs } from "@/formats";
import { readHtmlTable } from "@/formats/html";
import type { CodecId, ParseIssue, TableCodec } from "@/formats/types";

export type ClipboardSource = CodecId | "text";

export interface ClipboardTable {
	readonly matrix: CellValue[][];
	readonly source: ClipboardSource;
	readonly headerRow?: boolean;
	readonly alignments?: readonly Alignment[];
	readonly warnings?: readonly ParseIssue[];
}

export interface ClipboardPayload {
	readonly text: string;
	readonly html?: string;
}

function tableViaCodec(codec: TableCodec, text: string): ClipboardTable | null {
	if (codec.canSniff && !codec.canSniff(text)) return null;
	const result = codec.parseMatrix(text);
	if (!result.ok) return null;
	return {
		matrix: normalizeMatrix(result.table.matrix),
		source: codec.id,
		headerRow: result.table.headerRow,
		alignments: result.table.alignments,
		warnings: result.warnings,
	};
}

// Sniffing order is fixed and documented: the richest reliable representation
// wins, and plain text is the last resort rather than the default. The order is
// registry data so adding a format does not add another branch here.
export function readClipboardTable(
	payload: ClipboardPayload,
): ClipboardTable | null {
	const text = payload.text ?? "";

	const html = payload.html ? readHtmlTable(payload.html) : null;
	if (html) {
		return {
			matrix: normalizeMatrix(html.matrix),
			source: "html",
			headerRow: html.headerRow,
			alignments: html.alignments,
		};
	}

	if (!text.trim()) return null;

	for (const codec of listSniffableCodecs()) {
		const table = tableViaCodec(codec, text);
		if (table) return table;
	}

	// A multi-line paste with no delimiter is still a column of values.
	const lines = text.split(/\r?\n/);
	if (lines.length > 1)
		return { matrix: lines.map((line) => [line]), source: "text" };

	return { matrix: [[text]], source: "text" };
}
