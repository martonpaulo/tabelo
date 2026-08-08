import { normalizeMatrix } from "@/core/document";
import type { Alignment, TableDocument } from "@/core/types";
import { toDocumentParseResult } from "./parse";
import type { MatrixParseResult, TableCodec } from "./types";

// HTML parsing uses the platform's own parser rather than a hand-rolled one.
// Real pasted markup is messy, with nested elements, entities, and attributes.
// DOMParser handles all of it correctly for free.

const ALIGNMENTS: Record<string, Alignment> = {
	left: "left",
	center: "center",
	right: "right",
};

export function escapeHtmlText(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

// Reads one cell's text, treating <br> as the line break it represents.
function cellText(cell: Element): string {
	const clone = cell.cloneNode(true) as HTMLElement;
	for (const br of clone.querySelectorAll("br")) {
		br.replaceWith(clone.ownerDocument.createTextNode("\n"));
	}
	return clone.textContent ?? "";
}

function alignmentOf(cell: Element): Alignment {
	const inline = (cell as HTMLElement).style?.textAlign?.toLowerCase();
	if (inline && ALIGNMENTS[inline]) return ALIGNMENTS[inline];
	const attribute = cell.getAttribute("align")?.toLowerCase();
	if (attribute && ALIGNMENTS[attribute]) return ALIGNMENTS[attribute];
	return "default";
}

export interface HtmlTable {
	readonly matrix: string[][];
	readonly headerRow: boolean;
	readonly alignments: readonly Alignment[];
}

// Extracts the first table from an HTML fragment. Shared by this codec and the
// clipboard, which faces the same problem from a different direction.
export function readHtmlTable(html: string): HtmlTable | null {
	if (typeof DOMParser === "undefined") return null;
	if (!html.trim()) return null;

	const parsed = new DOMParser().parseFromString(html, "text/html");
	const table = parsed.querySelector("table");
	if (!table) return null;

	const rows = [...table.querySelectorAll("tr")];
	if (rows.length === 0) return null;

	const matrix = rows.map((row) =>
		[...row.querySelectorAll("th, td")].map((cell) => cellText(cell)),
	);
	if (!matrix.some((row) => row.length > 0)) return null;

	const headerCells = [...(rows[0]?.querySelectorAll("th, td") ?? [])];
	// A row is the document header only when every cell is marked as one. A
	// mixed row commonly uses <th> as a row label inside body data; treating it
	// as the table header would drop that row from the imported data.
	const headerRow =
		headerCells.length > 0 &&
		headerCells.every((cell) => cell.tagName === "TH");
	const alignments = headerCells.map((cell) => alignmentOf(cell));

	return { matrix: normalizeMatrix(matrix), headerRow, alignments };
}

function parseHtmlMatrix(text: string): MatrixParseResult {
	if (text.trim() === "") {
		return { ok: false, issues: [{ code: "empty-source" }] };
	}
	if (typeof DOMParser === "undefined") {
		return {
			ok: false,
			issues: [{ code: "html-unavailable" }],
		};
	}

	const table = readHtmlTable(text);
	if (!table) {
		return {
			ok: false,
			issues: [{ code: "html-table-required" }],
		};
	}

	return {
		ok: true,
		table: {
			matrix: table.matrix,
			headerRow: table.headerRow,
			alignments: table.alignments,
		},
	};
}

function cellMarkup(tag: "th" | "td", value: string, align: Alignment): string {
	const style = align === "default" ? "" : ` style="text-align: ${align}"`;
	// A newline in the value is real data; <br> is how HTML carries it.
	const content = escapeHtmlText(value).replace(/\n/g, "<br>");
	return `      <${tag}${style}>${content}</${tag}>`;
}

// Indented and line-broken on purpose: this output is meant to be read and
// pasted by a person, not minified.
function serializeHtml(document: TableDocument): string {
	const header = document.columns
		.map((column) => cellMarkup("th", column.header, column.align))
		.join("\n");

	const body = document.rows
		.map((row) => {
			const cells = document.columns
				.map((column) =>
					cellMarkup("td", row.cells[column.id] ?? "", column.align),
				)
				.join("\n");
			return `    <tr>\n${cells}\n    </tr>`;
		})
		.join("\n");

	return [
		"<table>",
		"  <thead>",
		"    <tr>",
		header,
		"    </tr>",
		"  </thead>",
		"  <tbody>",
		body,
		"  </tbody>",
		"</table>",
	].join("\n");
}

export const htmlCodec: TableCodec = {
	id: "html",
	extension: "html",
	mimeType: "text/html",
	parseMatrix: parseHtmlMatrix,
	parse: (text) => toDocumentParseResult(parseHtmlMatrix(text)),
	serialize: serializeHtml,
};
