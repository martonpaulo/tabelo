import Papa from "papaparse";
import { documentToMatrix } from "@/core/document";
import type { TableDocument } from "@/core/types";
import { toDocumentParseResult } from "./parse";
import type {
	CodecId,
	MatrixParseResult,
	ParseIssue,
	SourceRowRange,
	TableCodec,
} from "./types";

// CSV and TSV differ only by delimiter, so they share one implementation.
// Papa Parse owns the RFC 4180 edge cases this project promises to handle:
// delimiters inside quoted values, line breaks inside quoted values, escaped
// quotes, empty cells, empty rows, and mixed line endings.

// The separators Papa Parse would sniff on its own. A codec only ever
// considers the ones other than its own.
const SNIFF_CANDIDATES = [",", ";", "\t", "|"] as const;

const LINE_BREAK = /\r\n|\r|\n/;

export interface DelimitedMatrix {
	readonly matrix: string[][];
	readonly issues: readonly ParseIssue[];
	// Where each row of the matrix sits in the text (#296).
	readonly rows: readonly SourceRowRange[];
}

interface PapaRun {
	readonly data: string[][];
	readonly errors: Papa.ParseError[];
	// The offset just past each row, its line break included.
	readonly cursors: number[];
}

// Row by row rather than all at once, because only a step reports where each
// row ends, and that is the one reliable source of row boundaries a quoted line
// break cannot fool. It yields the same rows as a whole-text parse; an error's
// `row` is reported relative to its step, so it is numbered here instead.
// https://github.com/mholt/PapaParse/blob/5.5.4/papaparse.js#L1669-L1680
function runPapa(text: string, delimiter: string): PapaRun {
	const data: string[][] = [];
	const errors: Papa.ParseError[] = [];
	const cursors: number[] = [];
	Papa.parse<string[]>(text, {
		skipEmptyLines: false,
		delimiter,
		step: (row) => {
			for (const error of row.errors) {
				errors.push({ ...error, row: data.length });
			}
			data.push(row.data);
			cursors.push(row.meta.cursor);
		},
	});
	return { data, errors, cursors };
}

// A row runs from where the previous one ended to its own end, less the line
// break that closes it.
function rowRanges(text: string, cursors: readonly number[]): SourceRowRange[] {
	return cursors.map((cursor, index) => {
		const from = index === 0 ? 0 : (cursors[index - 1] ?? 0);
		const ending = text.slice(Math.max(from, cursor - 2), cursor);
		const breakLength = ending.endsWith("\r\n")
			? 2
			: ending.endsWith("\n") || ending.endsWith("\r")
				? 1
				: 0;
		return { from, to: Math.max(from, cursor - breakLength) };
	});
}

// A blank line is a legitimate empty row and looks like a single empty field
// under every delimiter, so it says nothing about which one is in use.
function significantWidths(rows: string[][]): number[] {
	return rows
		.filter((row) => !(row.length === 1 && row[0] === ""))
		.map((row) => row.length);
}

// Papa Parse's own guess counts fields and can pick a separator that only
// occurs inside cell data, which makes a delimited codec reject or corrupt its
// own canonical output (#217). A separator that is genuinely structural splits
// every row into the same number of fields, so only an alternative that is
// both consistent and wider than the declared one may win.
function chooseDelimiter(text: string, declared: string): string {
	const declaredWidths = significantWidths(runPapa(text, declared).data);
	const declaredWidth = Math.max(0, ...declaredWidths);

	let chosen = declared;
	let chosenWidth = declaredWidth;

	for (const candidate of SNIFF_CANDIDATES) {
		if (candidate === declared) continue;
		if (!text.includes(candidate)) continue;

		const widths = significantWidths(runPapa(text, candidate).data);
		if (widths.length === 0) continue;

		const width = widths[0] ?? 0;
		const consistent = widths.every((value) => value === width);
		if (consistent && width > chosenWidth) {
			chosen = candidate;
			chosenWidth = width;
		}
	}

	return chosen;
}

export function parseDelimitedMatrix(
	text: string,
	delimiter?: string,
	options: { readonly sniffDelimiter?: boolean } = {},
): DelimitedMatrix {
	const declared = delimiter ?? ",";
	const effective = options.sniffDelimiter
		? chooseDelimiter(text, declared)
		: declared;

	const result = runPapa(text, effective);

	const matrix = result.data.map((row) => row.map((cell) => cell ?? ""));
	const rows = rowRanges(text, result.cursors);

	// Only a source that actually ends in a line break can carry the phantom
	// record Papa Parse reports after it. Judging by shape alone deleted the
	// last row of a table whose final cells were empty.
	if (matrix.length > 1 && LINE_BREAK.test(text.slice(-2))) {
		const last = matrix.at(-1);
		if (last?.length === 1 && last[0] === "") {
			matrix.pop();
			rows.pop();
		}
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

	return { matrix, issues, rows };
}

export function serializeDelimited(
	document: TableDocument,
	delimiter: string,
): string {
	const matrix = documentToMatrix(document);
	const text = Papa.unparse(matrix, { delimiter, newline: "\n" });

	// A final row of only empty cells writes nothing visible, so without a
	// terminator the record disappears and the table cannot be read back. Every
	// other table keeps its exact previous bytes.
	const last = matrix.at(-1);
	const endsEmpty =
		matrix.length > 0 &&
		last !== undefined &&
		last.every((cell) => cell === "");
	return endsEmpty ? `${text}\n` : text;
}

interface DelimitedCodecConfig {
	readonly id: CodecId;
	readonly extension: string;
	readonly mimeType: string;
	readonly delimiter: string;
	// CSV lets an unambiguously structural separator win so a semicolon file
	// still opens; TSV is only ever tab-separated, and sniffing there would
	// misread a tab-free line.
	readonly sniffDelimiter: boolean;
}

export function createDelimitedCodec(config: DelimitedCodecConfig): TableCodec {
	const readMatrix = (
		text: string,
		sniffDelimiter: boolean,
	): MatrixParseResult => {
		// A delimiter or a line break is structure, not blank space. Tabs and
		// newlines are whitespace to String.trim, which made an all-empty TSV
		// table indistinguishable from a cleared editor (#217).
		const hasStructure =
			text.includes(config.delimiter) || LINE_BREAK.test(text);
		if (!hasStructure && text.trim() === "") {
			return { ok: false, issues: [{ code: "empty-source" }] };
		}

		const { matrix, issues, rows } = parseDelimitedMatrix(
			text,
			config.delimiter,
			{ sniffDelimiter },
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
			rows,
		};
	};

	return {
		id: config.id,
		reconciliation: {
			cellValues: "text",
			columnAlignment: "unexpressed",
		},
		extension: config.extension,
		mimeType: config.mimeType,
		mapsSourceRows: true,
		fieldSeparator: config.delimiter,
		// Import and the clipboard carry text this product did not write, so a
		// European semicolon file still has to open.
		parseMatrix: (text) => readMatrix(text, config.sniffDelimiter),
		// A source view only ever reads back this codec's own output, where the
		// separator is the one the format declares. Guessing there let cell data
		// masquerade as structure and made canonical output unreadable (#217).
		parse: (text) => toDocumentParseResult(readMatrix(text, false)),
		serialize: (document) => serializeDelimited(document, config.delimiter),
		sniffPriority: config.id === "tsv" ? 10 : 40,
		canSniff: (text) =>
			config.id === "tsv"
				? text.includes("\t")
				: text.includes(",") || text.includes(";"),
	};
}
