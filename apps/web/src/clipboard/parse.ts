import { normalizeMatrix } from "@/core/document";
import { parseCsvMatrix } from "@/formats/csv";
import { markdownFormat } from "@/formats/markdown";

export type ClipboardSource = "html" | "tsv" | "markdown" | "csv" | "text";

export interface ClipboardTable {
	readonly matrix: string[][];
	readonly source: ClipboardSource;
}

// Reads an HTML table out of a clipboard payload. Spreadsheets and web pages
// both put real markup on text/html, which carries cell boundaries far more
// reliably than the plain-text fallback.
function fromHtml(html: string): string[][] | null {
	if (!html.trim()) return null;

	const parsed = new DOMParser().parseFromString(html, "text/html");
	const table = parsed.querySelector("table");
	if (!table) return null;

	const rows = [...table.querySelectorAll("tr")];
	if (rows.length === 0) return null;

	const matrix = rows.map((row) =>
		[...row.querySelectorAll("th, td")].map((cell) => {
			// <br> is a line break in the source data, not decoration.
			const clone = cell.cloneNode(true) as HTMLElement;
			for (const br of clone.querySelectorAll("br")) {
				br.replaceWith(parsed.createTextNode("\n"));
			}
			return (clone.textContent ?? "").replace(/ /g, " ").trim();
		}),
	);

	return matrix.some((row) => row.length > 0) ? matrix : null;
}

function fromTsv(text: string): string[][] | null {
	if (!text.includes("\t")) return null;
	const { matrix } = parseCsvMatrix(text);
	return matrix.length > 0 ? matrix : null;
}

function fromMarkdown(text: string): string[][] | null {
	const result = markdownFormat.parse(text);
	if (!result.ok) return null;
	return [
		result.document.columns.map((column) => column.header),
		...result.document.rows.map((row) =>
			result.document.columns.map((column) => row.cells[column.id] ?? ""),
		),
	];
}

function fromCsv(text: string): string[][] | null {
	if (!text.includes(",") && !text.includes(";")) return null;
	const { matrix } = parseCsvMatrix(text);
	return matrix.length > 0 ? matrix : null;
}

export interface ClipboardPayload {
	readonly text: string;
	readonly html?: string;
}

// Sniffing order is fixed and documented: the richest reliable representation
// wins, and plain text is the last resort rather than the default.
export function readClipboardTable(
	payload: ClipboardPayload,
): ClipboardTable | null {
	const text = payload.text ?? "";

	const html = payload.html ? fromHtml(payload.html) : null;
	if (html) return { matrix: normalizeMatrix(html), source: "html" };

	if (!text.trim()) return null;

	const tsv = fromTsv(text);
	if (tsv) return { matrix: normalizeMatrix(tsv), source: "tsv" };

	const markdown = fromMarkdown(text);
	if (markdown)
		return { matrix: normalizeMatrix(markdown), source: "markdown" };

	const csv = fromCsv(text);
	if (csv) return { matrix: normalizeMatrix(csv), source: "csv" };

	// A multi-line paste with no delimiter is still a column of values.
	const lines = text.split(/\r?\n/);
	if (lines.length > 1) {
		return { matrix: lines.map((line) => [line]), source: "text" };
	}

	return { matrix: [[text]], source: "text" };
}
