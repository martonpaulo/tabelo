import Papa from "papaparse";
import { documentFromMatrix, documentToMatrix } from "@/core/document";
import type { TableDocument } from "@/core/types";
import type { CodecId, ParseIssue, ParseResult, TableCodec } from "./types";

// CSV and TSV differ only by delimiter, so they share one implementation.
// Papa Parse owns the RFC 4180 edge cases this project promises to handle:
// delimiters inside quoted values, line breaks inside quoted values, escaped
// quotes, empty cells, empty rows, and mixed line endings.

export interface DelimitedMatrix {
	readonly matrix: string[][];
	readonly issues: readonly ParseIssue[];
}

export function parseDelimitedMatrix(
	text: string,
	delimiter?: string,
): DelimitedMatrix {
	const result = Papa.parse<string[]>(text, {
		skipEmptyLines: false,
		// An empty delimiter lets Papa sniff , ; \t and | so a pasted European
		// CSV still works.
		delimiter: delimiter ?? "",
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

export interface DelimitedOptions {
	readonly includeHeader?: boolean;
}

export function serializeDelimited(
	document: TableDocument,
	delimiter: string,
	options: DelimitedOptions = {},
): string {
	const matrix = documentToMatrix(document, {
		includeHeader: options.includeHeader ?? true,
	});
	return Papa.unparse(matrix, { delimiter, newline: "\n" });
}

interface DelimitedCodecConfig {
	readonly id: CodecId;
	readonly label: string;
	readonly extension: string;
	readonly mimeType: string;
	readonly delimiter: string;
	// CSV lets Papa sniff the separator so a semicolon file still opens; TSV is
	// only ever tab-separated, and sniffing there would misread a tab-free line.
	readonly sniffDelimiter: boolean;
}

export function createDelimitedCodec(config: DelimitedCodecConfig): TableCodec {
	return {
		id: config.id,
		label: config.label,
		extension: config.extension,
		mimeType: config.mimeType,

		parse(text: string): ParseResult {
			if (text.trim() === "") {
				return { ok: false, issues: [{ message: "Nothing to read yet." }] };
			}

			const { matrix, issues } = parseDelimitedMatrix(
				text,
				config.sniffDelimiter ? undefined : config.delimiter,
			);

			// An unterminated quote means the user is mid-edit. Hold the last valid
			// table rather than showing them a mangled one.
			const fatal = issues.filter((issue) => /quote/i.test(issue.message));
			if (fatal.length > 0) return { ok: false, issues: fatal };

			if (matrix.length === 0) {
				return { ok: false, issues: [{ message: "Nothing to read yet." }] };
			}

			// In a source view row 1 is always the header — the document always has
			// one. Header detection is an import-time concern only.
			return {
				ok: true,
				document: documentFromMatrix(matrix, { headerRow: true }),
				warnings: issues.length > 0 ? issues : undefined,
			};
		},

		serialize: (document) => serializeDelimited(document, config.delimiter),
	};
}
