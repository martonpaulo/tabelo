import Papa from "papaparse";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import type { TableDocument } from "@/core/types";
import type { ParseIssue, ParseResult, TableFormat } from "./types";

// Papa Parse owns the RFC 4180 edge cases this project promises to handle:
// delimiters inside quoted values, line breaks inside quoted values, escaped
// quotes, empty cells, empty rows, and mixed line endings.

export function parseCsvMatrix(text: string): {
	matrix: string[][];
	issues: ParseIssue[];
} {
	const result = Papa.parse<string[]>(text, {
		skipEmptyLines: false,
		// Let Papa sniff , ; \t and | so a pasted European CSV still works.
		delimiter: "",
	});

	const matrix = result.data.map((row) => row.map((cell) => cell ?? ""));

	// A trailing newline produces one phantom row; a genuinely empty last row
	// would have been written as a blank line the user can still see.
	if (matrix.length > 1) {
		const last = matrix[matrix.length - 1];
		if (last.length === 1 && last[0] === "") matrix.pop();
	}

	const issues = result.errors.map((error) => ({
		message: error.message,
		line: typeof error.row === "number" ? error.row + 1 : undefined,
	}));

	return { matrix, issues };
}

function parseCsv(text: string): ParseResult {
	if (text.trim() === "") {
		return { ok: false, issues: [{ message: "Nothing to read yet." }] };
	}

	const { matrix, issues } = parseCsvMatrix(text);

	// An unterminated quote means the user is mid-edit. Hold the last valid
	// table rather than showing them a mangled one.
	const fatal = issues.filter((issue) => /quote/i.test(issue.message));
	if (fatal.length > 0) return { ok: false, issues: fatal };

	if (matrix.length === 0) {
		return { ok: false, issues: [{ message: "Nothing to read yet." }] };
	}

	// In the text panel row 1 is always the header — the document always has
	// one. Header detection is an import-time concern only.
	return {
		ok: true,
		document: documentFromMatrix(matrix, { headerRow: true }),
		warnings: issues.length > 0 ? issues : undefined,
	};
}

export interface CsvSerializeOptions {
	readonly includeHeader?: boolean;
}

export function serializeCsvWith(
	document: TableDocument,
	options: CsvSerializeOptions = {},
): string {
	const matrix = documentToMatrix(document, {
		includeHeader: options.includeHeader ?? true,
	});
	return Papa.unparse(matrix, { newline: "\n" });
}

export const csvFormat: TableFormat = {
	id: "csv",
	label: "CSV",
	extension: "csv",
	mimeType: "text/csv",
	parse: parseCsv,
	serialize: (document) => serializeCsvWith(document),
};
