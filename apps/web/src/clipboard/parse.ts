import { cellText, headerContent } from "@/core/cell-value";
import { normalizeMatrix } from "@/core/document";
import type {
	Alignment,
	CellValue,
	ExpectedColumnType,
	TextContent,
} from "@/core/types";
import { listSniffableCodecs } from "@/formats";
import {
	type HtmlTable,
	htmlProjection,
	normalizeLineEndings,
	readHtmlFragment,
	readHtmlTable,
} from "@/formats/html";
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
	// Compared on the terms HTML can spell. The flavour carries one line break
	// and writes each run of formatted text on its own, so a value whose only
	// difference is a carriage return still describes the table beside it;
	// that difference is precisely what the payload is for.
	const projected = normalizeMatrix(selection.matrix).map((row) =>
		row.map((value) => htmlProjection(headerContent(value))),
	);
	if (projected.length !== table.matrix.length) return false;
	const width = projected[0]?.length ?? 0;
	if (selection.expectedTypes.length !== width) return false;

	return projected.every((row, index) => {
		const published = table.matrix[index];
		return (
			published !== undefined &&
			row.length === published.length &&
			row.every((value, column) => {
				const cell = published[column];
				return cell !== undefined && value === cellText(cell);
			})
		);
	});
}

// The one value of a single-cell selection, when the markup beside it, a
// fragment with no table such as one copied out of the rich cell editor, reads
// as that value. The single-cell counterpart of `describesPublicTable`.
function describedFragmentValue(
	selection: ClipboardSelection,
	content: TextContent,
): { readonly value: CellValue } | null {
	const [row, ...otherRows] = selection.matrix;
	if (row?.length !== 1 || otherRows.length > 0) return null;
	if (selection.expectedTypes.length !== 1) return null;
	const value = row[0] ?? null;
	return htmlProjection(headerContent(value)) === cellText(content)
		? { value }
		: null;
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

	// Markup that refuses to be read, such as an image with no alternative
	// text, falls through to the plain text beside it, which is what every
	// other application would paste.
	const reading = split.html ? readHtmlTable(split.html) : null;
	const html = reading?.ok ? reading.table : null;
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
			warnings: typed || html.warnings.length === 0 ? undefined : html.warnings,
		};
	}

	// A fragment Tabelo copied out of one cell's editor carries no table, so the
	// public path would read it as text. Its own payload, when the markup beside
	// it says the same thing, hands the cell back exactly (#306).
	if (!reading && split.selection) {
		const fragment = readHtmlFragment(split.html);
		const described = fragment?.ok
			? describedFragmentValue(split.selection, fragment.content)
			: null;
		if (described) {
			return {
				matrix: [[described.value]],
				source: "tabelo",
				expectedTypes: split.selection.expectedTypes,
			};
		}
	}

	if (!text.trim()) return null;

	for (const codec of listSniffableCodecs()) {
		const table = tableViaCodec(codec, text);
		if (table) return table;
	}

	// A multi-line paste with no delimiter is still a column of values. The
	// line break that ends the last line reports one more, empty, line, which
	// would write an empty value over the cell below the paste: the same
	// phantom record the delimited codec drops, and for the same reason.
	const lines = text.split(/\r?\n/);
	if (lines.length > 1 && lines.at(-1) === "") lines.pop();
	if (lines.length > 1)
		return { matrix: lines.map((line) => [line]), source: "text" };

	return { matrix: [[lines[0] ?? ""]], source: "text" };
}

// What a paste into the rich cell editor inserts at its caret (#306): the
// content of one cell, with its formatting. Null when the clipboard holds no
// such thing, and the editor then pastes the plain text beside it as it always
// did. That is the rule for more than one cell too: a matrix has no single
// place in one cell's text, so it arrives as its plain flavour, the cells
// joined by tabs and the rows by line breaks.
export interface ClipboardInline {
	readonly content: TextContent;
	// Formatting read and not kept, under the HTML codec's own rule.
	readonly warnings: readonly ParseIssue[];
}

// Whether the plain flavour spells the same text as the content read from the
// markup. An application writes no text for an image, so either reading of an
// image, its alternative text or nothing, agrees with the content.
function spellsSameText(text: string, content: TextContent): boolean {
	if (text === cellText(content)) return true;
	if (typeof content === "string") return false;
	const withoutImages = content.nodes
		.map((node) => {
			if (node.kind === "text") return node.text;
			if (node.kind === "link") {
				return node.children.map((child) => child.text).join("");
			}
			return "";
		})
		.join("");
	return text === withoutImages;
}

export function readClipboardInline(
	payload: ClipboardPayload,
): ClipboardInline | null {
	if (!payload.html) return null;
	const split = readTabeloPayload(payload.html);

	const reading = readHtmlTable(split.html);
	if (reading) {
		// A refused table, or one of more than one cell, pastes as plain text.
		if (!reading.ok) return null;
		const [row, ...otherRows] = reading.table.matrix;
		const cell = row?.length === 1 && otherRows.length === 0 ? row[0] : null;
		if (cell === null || cell === undefined) return null;
		if (
			split.selection &&
			describesPublicTable(split.selection, reading.table)
		) {
			const value = split.selection.matrix[0]?.[0] ?? null;
			return { content: headerContent(value), warnings: [] };
		}
		return { content: cell, warnings: reading.table.warnings };
	}

	const fragment = readHtmlFragment(split.html);
	if (!fragment?.ok) return null;
	const described = split.selection
		? describedFragmentValue(split.selection, fragment.content)
		: null;
	if (described) {
		return { content: headerContent(described.value), warnings: [] };
	}
	// Markup from elsewhere is believed only when it reads as the text the
	// application wrote beside it. Blocks, and source whitespace a renderer
	// folds, are not cell syntax, so when the two disagree the plain text,
	// which is what the application says was selected, wins.
	const text = normalizeLineEndings(payload.text ?? "");
	if (text !== "" && !spellsSameText(text, fragment.content)) return null;
	return { content: fragment.content, warnings: fragment.warnings };
}
