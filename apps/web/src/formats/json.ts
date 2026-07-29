import { documentToMatrix } from "@/core/document";
import type { TableDocument } from "@/core/types";
import { toDocumentParseResult } from "./parse";
import type { MatrixParseResult, ParseIssue, TableCodec } from "./types";

function syntaxErrorLine(error: unknown, text: string): number | undefined {
	if (!(error instanceof SyntaxError)) return undefined;
	const position = /position\s+(\d+)/i.exec(error.message)?.[1];
	if (!position) return undefined;
	return text.slice(0, Number(position)).split(/\r?\n/).length;
}

function parseJsonMatrix(text: string): MatrixParseResult {
	if (!text.trim()) {
		return { ok: false, issues: [{ code: "empty-source" }] };
	}

	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch (error) {
		return {
			ok: false,
			issues: [{ code: "json-invalid", line: syntaxErrorLine(error, text) }],
		};
	}

	if (!Array.isArray(value) || value.length === 0) {
		return { ok: false, issues: [{ code: "json-rows-required" }] };
	}
	if (value.some((row) => !Array.isArray(row))) {
		return { ok: false, issues: [{ code: "json-row-array-required" }] };
	}

	const rows = value as unknown[][];
	if (rows[0].length === 0) {
		return { ok: false, issues: [{ code: "json-header-required" }] };
	}
	if (rows.some((row) => row.some((cell) => typeof cell !== "string"))) {
		return { ok: false, issues: [{ code: "json-string-cells-required" }] };
	}

	const width = rows[0].length;
	const warnings: ParseIssue[] = [];
	rows.slice(1).forEach((row, index) => {
		if (row.length === width) return;
		warnings.push({
			code: "row-column-count",
			row: index + 1,
			actual: row.length,
			expected: width,
		});
	});

	return {
		ok: true,
		table: { matrix: rows as string[][] },
		warnings: warnings.length > 0 ? warnings : undefined,
	};
}

function serializeJson(document: TableDocument): string {
	const rows = documentToMatrix(document);
	return `[\n${rows.map((row) => `  ${JSON.stringify(row)}`).join(",\n")}\n]`;
}

export const jsonCodec: TableCodec = {
	id: "json",
	extension: "json",
	mimeType: "application/json",
	parseMatrix: parseJsonMatrix,
	parse: (text) => toDocumentParseResult(parseJsonMatrix(text)),
	serialize: serializeJson,
	sniffPriority: 5,
	canSniff: (text) => text.trimStart().startsWith("["),
};
