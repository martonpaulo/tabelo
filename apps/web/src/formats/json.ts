import { documentToMatrix } from "@/core/document";
import type { TableDocument } from "@/core/types";
import { toDocumentParseResult } from "./parse";
import type {
	MatrixParseResult,
	ParseIssue,
	PreconditionFailure,
	TableCodec,
} from "./types";

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

	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return { ok: false, issues: [{ code: "json-object-shape-required" }] };
	}

	const obj = value as Record<string, unknown>;
	if (!Array.isArray(obj.columns)) {
		return { ok: false, issues: [{ code: "json-columns-array-required" }] };
	}
	if (!Array.isArray(obj.rows)) {
		return { ok: false, issues: [{ code: "json-rows-array-required" }] };
	}

	const columns = obj.columns as unknown[];
	if (columns.some((col) => typeof col !== "string")) {
		return { ok: false, issues: [{ code: "json-string-cells-required" }] };
	}

	const headerRow = columns as string[];
	const dataRows = obj.rows as unknown[];

	if (
		dataRows.some(
			(row) => !row || typeof row !== "object" || Array.isArray(row),
		)
	) {
		return { ok: false, issues: [{ code: "json-object-shape-required" }] };
	}

	const rowsAsObjects = dataRows as Record<string, unknown>[];

	// Check for non-string values for the declared columns
	for (const rowObj of rowsAsObjects) {
		for (const key of headerRow) {
			const cellValue = rowObj[key];
			if (cellValue !== undefined && typeof cellValue !== "string") {
				return { ok: false, issues: [{ code: "json-string-cells-required" }] };
			}
		}
	}

	const width = headerRow.length;
	const matrix: string[][] = [headerRow];
	const warnings: ParseIssue[] = [];

	rowsAsObjects.forEach((rowObj, index) => {
		const row: string[] = [];
		let actualCount = 0;
		headerRow.forEach((key) => {
			const cellValue = rowObj[key];
			if (cellValue !== undefined) {
				row.push(cellValue as string);
				actualCount++;
			} else {
				row.push("");
			}
		});

		// We count the number of declared columns that were actually present in the row object.
		// If the row object had fewer keys (ignoring extra keys), we warn about ragged rows.
		if (actualCount !== width) {
			warnings.push({
				code: "row-column-count",
				row: index + 1,
				actual: actualCount,
				expected: width,
			});
		}

		matrix.push(row);
	});

	return {
		ok: true,
		table: { matrix },
		warnings: warnings.length > 0 ? warnings : undefined,
	};
}

function serializeJson(document: TableDocument): string {
	const matrix = documentToMatrix(document);
	const headers = matrix[0];
	const rows = matrix.slice(1);

	const serializedRows = rows.map((row) => {
		const rowObj: Record<string, string> = {};
		headers.forEach((header, i) => {
			// Precondition guarantees headers are unique and non-empty,
			// but we still serialize whatever is there.
			rowObj[header] = row[i];
		});
		return `    ${JSON.stringify(rowObj)}`;
	});

	return `{\n  "columns": ${JSON.stringify(headers)},\n  "rows": [\n${serializedRows.join(",\n")}\n  ]\n}`;
}

function jsonPrecondition(document: TableDocument): PreconditionFailure | null {
	const matrix = documentToMatrix(document);
	const headers = matrix[0];

	const emptyHeaders: number[] = [];
	const dupHeaders: number[] = [];
	const seen = new Set<string>();

	for (let i = 0; i < headers.length; i++) {
		const header = headers[i].trim();
		if (!header) {
			emptyHeaders.push(i);
		} else if (seen.has(header)) {
			dupHeaders.push(i);
		}
		seen.add(header);
	}

	if (emptyHeaders.length > 0) {
		return { code: "json-empty-header", columns: emptyHeaders };
	}
	if (dupHeaders.length > 0) {
		return { code: "json-duplicate-header", columns: dupHeaders };
	}

	return null;
}

export const jsonCodec: TableCodec = {
	id: "json",
	extension: "json",
	mimeType: "application/json",
	parseMatrix: parseJsonMatrix,
	parse: (text) => toDocumentParseResult(parseJsonMatrix(text)),
	serialize: serializeJson,
	precondition: jsonPrecondition,
	sniffPriority: 5,
	canSniff: (text) => text.trimStart().startsWith("{"),
};
