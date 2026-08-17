import Papa from "papaparse";
import { documentToMatrix } from "@/core/document";
import type { TableDocument } from "@/core/types";
import { toDocumentParseResult } from "./parse";
import {
	type CodecId,
	defaultOutputOptions,
	type MatrixParseResult,
	type OutputOptionId,
	type OutputOptions,
	type ParseIssue,
	type TableCodec,
} from "./types";

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
		const last = matrix.at(-1);
		if (last?.length === 1 && last[0] === "") matrix.pop();
	}

	const issues: ParseIssue[] = result.errors.map((error) => {
		const line = typeof error.row === "number" ? error.row + 1 : undefined;
		switch (error.code) {
			case "MissingQuotes":
				return { code: "delimited-unclosed-quote", line };
			case "InvalidQuotes":
				return { code: "delimited-invalid-quote", line };
			case "UndetectableDelimiter":
				return { code: "delimited-delimiter-undetected", line };
			case "TooFewFields":
			case "TooManyFields":
				return { code: "delimited-field-count", line };
			default:
				return { code: "delimited-parse-error", line };
		}
	});

	return { matrix, issues };
}

export function serializeDelimited(
	document: TableDocument,
	delimiter: string,
	options: OutputOptions = {},
): string {
	const matrix = documentToMatrix(document, {
		includeHeader: options.includeHeader ?? defaultOutputOptions.includeHeader,
	});
	return Papa.unparse(matrix, { delimiter, newline: "\n" });
}

interface DelimitedCodecConfig {
	readonly id: CodecId;
	readonly extension: string;
	readonly mimeType: string;
	readonly delimiter: string;
	// CSV lets Papa sniff the separator so a semicolon file still opens; TSV is
	// only ever tab-separated, and sniffing there would misread a tab-free line.
	readonly sniffDelimiter: boolean;
	// Declared per format rather than derived: both delimited formats could
	// drop the header row, but only CSV promises the choice.
	readonly outputOptions?: readonly OutputOptionId[];
}

export function createDelimitedCodec(config: DelimitedCodecConfig): TableCodec {
	const parseMatrix = (text: string): MatrixParseResult => {
		if (text.trim() === "") {
			return { ok: false, issues: [{ code: "empty-source" }] };
		}

		const { matrix, issues } = parseDelimitedMatrix(
			text,
			config.sniffDelimiter ? undefined : config.delimiter,
		);

		// An unterminated quote means the user is mid-edit. Hold the last valid
		// table rather than showing them a mangled one.
		const fatal = issues.filter(
			(issue) =>
				issue.code === "delimited-unclosed-quote" ||
				issue.code === "delimited-invalid-quote",
		);
		if (fatal.length > 0) return { ok: false, issues: fatal };

		if (matrix.length === 0) {
			return { ok: false, issues: [{ code: "empty-source" }] };
		}

		return {
			ok: true,
			table: { matrix },
			warnings: issues.length > 0 ? issues : undefined,
		};
	};

	return {
		id: config.id,
		extension: config.extension,
		mimeType: config.mimeType,
		parseMatrix,
		parse: (text) => toDocumentParseResult(parseMatrix(text)),
		serialize: (document, options) =>
			serializeDelimited(document, config.delimiter, options),
		outputOptions: config.outputOptions,
		sniffPriority: config.id === "tsv" ? 10 : 40,
		canSniff: (text) =>
			config.id === "tsv"
				? text.includes("\t")
				: text.includes(",") || text.includes(";"),
	};
}
