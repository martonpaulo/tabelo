import { cellText } from "@/core/cell-value";
import { normalizeMatrix } from "@/core/document";
import type { Alignment, CellValue, ExpectedColumnType } from "@/core/types";
import { listSniffableCodecs } from "@/formats";
import { type HtmlTable, readHtmlTable } from "@/formats/html";
import type { CodecId, ParseIssue, TableCodec } from "@/formats/types";
import { type ClipboardSelection, readTabeloPayload } from "./payload";

// "tabelo" is not a codec: it is the private flavour Tabelo writes for itself,
// and it is the only source that can hand over values that are already typed.
export type ClipboardSource = CodecId | "text" | "tabelo";

export interface ClipboardTable {
	readonly matrix: CellValue[][];
	readonly source: ClipboardSource;
	readonly headerRow?: boolean;
	readonly alignments?: readonly Alignment[];
	readonly expectedTypes?: readonly ExpectedColumnType[];
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

// The private payload is preferred only when it describes the table the
// clipboard is visibly carrying. Metadata that disagrees with the content
// beside it is stale or foreign, and letting it win would replace what the
// user can see with something they cannot.
function describesPublicTable(
	selection: ClipboardSelection,
	table: HtmlTable,
): boolean {
	const projected = normalizeMatrix(selection.matrix).map((row) =>
		row.map(cellText),
	);
	if (projected.length !== table.matrix.length) return false;
	const width = projected[0]?.length ?? 0;
	if (selection.expectedTypes.length !== width) return false;

	return projected.every((row, index) => {
		const published = table.matrix[index];
		return (
			published !== undefined &&
			row.length === published.length &&
			row.every((value, column) => value === published[column])
		);
	});
}

// Sniffing order is fixed and documented: the richest reliable representation
// wins, and plain text is the last resort rather than the default. The order is
// registry data so adding a format does not add another branch here.
//
// Tabelo's own flavour sorts ahead of all of it, because it is the only one
// that carries types rather than a text projection of them. It never widens
// what a paste accepts: it is read strictly, and anything short of a valid
// payload that matches the visible table falls through to the public path
// below, which is where every external application's content is read.
export function readClipboardTable(
	payload: ClipboardPayload,
): ClipboardTable | null {
	const text = payload.text ?? "";
	const split = payload.html
		? readTabeloPayload(payload.html)
		: { html: "", selection: null };

	const html = split.html ? readHtmlTable(split.html) : null;
	if (html) {
		const typed =
			split.selection && describesPublicTable(split.selection, html)
				? split.selection
				: null;
		return {
			matrix: normalizeMatrix(typed ? typed.matrix : html.matrix),
			source: typed ? "tabelo" : "html",
			// The header decision and the alignments stay with the public table.
			// The private payload supplements what HTML cannot spell; it does not
			// become a second answer to what HTML already says.
			headerRow: html.headerRow,
			alignments: html.alignments,
			expectedTypes: typed?.expectedTypes,
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
