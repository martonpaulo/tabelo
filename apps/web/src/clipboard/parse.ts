import { documentToMatrix, normalizeMatrix } from "@/core/document";
import { parseDelimitedMatrix } from "@/formats/delimited";
import { readHtmlTable } from "@/formats/html";
import { jiraCodec } from "@/formats/jira";
import { markdownCodec } from "@/formats/markdown";
import type { TableCodec } from "@/formats/types";

export type ClipboardSource =
	| "html"
	| "tsv"
	| "markdown"
	| "jira"
	| "csv"
	| "text";

export interface ClipboardTable {
	readonly matrix: string[][];
	readonly source: ClipboardSource;
}

export interface ClipboardPayload {
	readonly text: string;
	readonly html?: string;
}

// Runs a codec purely to see whether the text is that format, and converts the
// result back to a matrix. Reusing the real parser is what keeps sniffing
// honest: nothing is recognised that the format could not actually read.
function matrixViaCodec(codec: TableCodec, text: string): string[][] | null {
	const result = codec.parse(text);
	if (!result.ok) return null;
	return documentToMatrix(result.document);
}

function fromTsv(text: string): string[][] | null {
	if (!text.includes("\t")) return null;
	const { matrix } = parseDelimitedMatrix(text, "\t");
	return matrix.length > 0 ? matrix : null;
}

function fromCsv(text: string): string[][] | null {
	if (!text.includes(",") && !text.includes(";")) return null;
	const { matrix } = parseDelimitedMatrix(text);
	return matrix.length > 0 ? matrix : null;
}

// Sniffing order is fixed and documented: the richest reliable representation
// wins, and plain text is the last resort rather than the default. Jira is
// tried before CSV because its rows contain no commas to mislead the CSV
// reader, but do start with a distinctive doubled pipe.
export function readClipboardTable(
	payload: ClipboardPayload,
): ClipboardTable | null {
	const text = payload.text ?? "";

	const html = payload.html ? readHtmlTable(payload.html) : null;
	if (html) return { matrix: normalizeMatrix(html.matrix), source: "html" };

	if (!text.trim()) return null;

	const tsv = fromTsv(text);
	if (tsv) return { matrix: normalizeMatrix(tsv), source: "tsv" };

	const markdown = matrixViaCodec(markdownCodec, text);
	if (markdown)
		return { matrix: normalizeMatrix(markdown), source: "markdown" };

	const jira = matrixViaCodec(jiraCodec, text);
	if (jira) return { matrix: normalizeMatrix(jira), source: "jira" };

	const csv = fromCsv(text);
	if (csv) return { matrix: normalizeMatrix(csv), source: "csv" };

	// A multi-line paste with no delimiter is still a column of values.
	const lines = text.split(/\r?\n/);
	if (lines.length > 1)
		return { matrix: lines.map((line) => [line]), source: "text" };

	return { matrix: [[text]], source: "text" };
}
