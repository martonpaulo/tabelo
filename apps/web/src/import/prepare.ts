import {
	type ClipboardPayload,
	type ClipboardSource,
	readClipboard,
} from "@/clipboard/parse";
import { stripTabeloPayload } from "@/clipboard/payload";
import { documentFromMatrix, normalizeMatrix } from "@/core/document";
import {
	matrixShapeLimitError,
	TABLE_LIMITS,
	type TableShapeLimitError,
} from "@/core/table-limits";
import type {
	Alignment,
	CellValue,
	ExpectedColumnType,
	TableDocument,
} from "@/core/types";
import { getCodec } from "@/formats";
import type { CodecId, MatrixParseOptions, ParseIssue } from "@/formats/types";

// The table shape every input path shares, plus the byte budget that only an
// import or a paste has to spend.
export const IMPORT_LIMITS = {
	...TABLE_LIMITS,
	payloadBytes: 1_048_576,
} as const;

export type ImportError =
	| {
			readonly code: "invalid-format";
			readonly format: CodecId;
			readonly issues: readonly ParseIssue[];
	  }
	| { readonly code: "empty" }
	// A file whose bytes are not UTF-8, refused before any parse (#547).
	| { readonly code: "not-utf8" }
	| TableShapeLimitError
	| {
			readonly code: "payload-too-large";
			readonly actual: number;
			readonly limit: number;
	  };

export interface PreparedImport {
	readonly matrix: CellValue[][];
	readonly source: ClipboardSource;
	readonly headerRow?: boolean;
	readonly alignments?: readonly Alignment[];
	readonly expectedTypes?: readonly ExpectedColumnType[];
	readonly warnings: readonly ParseIssue[];
}

// The warnings that mean something the source showed was not kept: formatting
// the product declines, whose text stays (#306). A ragged row is padded, not
// lost, so it is not one of them; it stays the source pane's own diagnostic.
export function droppedFormatting(
	warnings: readonly ParseIssue[],
): readonly ParseIssue[] {
	return warnings.filter(
		(issue) =>
			issue.code === "html-formatting-unsupported" ||
			issue.code === "html-linked-image-unsupported",
	);
}

export type PrepareImportResult =
	| { readonly ok: true; readonly value: PreparedImport }
	| { readonly ok: false; readonly error: ImportError };

export interface PrepareImportRequest {
	readonly payload: ClipboardPayload;
	readonly format?: CodecId;
	// The user's answer to a refusal that asked them (#548).
	readonly options?: MatrixParseOptions;
}

// The member key of the first JSON number a double cannot hold, when that is
// the only reason the import was refused: a choice the user can make, keeping
// such numbers as exact text (#548). Null for every other refusal.
export function impreciseNumbersKey(error: ImportError): string | null {
	if (error.code !== "invalid-format") return null;
	const [first, ...others] = error.issues;
	if (first?.code !== "json-number-imprecise" || others.length > 0) return null;
	return first.key;
}

function payloadBytes(payload: ClipboardPayload): number {
	const encoder = new TextEncoder();
	// Tabelo's own private flavour rides inside the HTML, and it is metadata
	// rather than content the user is importing. It carries its own bound, so
	// charging it to this budget would shrink the table a Tabelo copy can be
	// pasted back into for bytes the destination never has to hold.
	const html = payload.html ? stripTabeloPayload(payload.html) : "";
	return (
		encoder.encode(payload.text).byteLength + encoder.encode(html).byteLength
	);
}

export function prepareImport(
	request: PrepareImportRequest,
): PrepareImportResult {
	const bytes = payloadBytes(request.payload);
	if (bytes > IMPORT_LIMITS.payloadBytes) {
		return {
			ok: false,
			error: {
				code: "payload-too-large",
				actual: bytes,
				limit: IMPORT_LIMITS.payloadBytes,
			},
		};
	}

	const namedCodec = request.format ? getCodec(request.format) : null;
	let table: {
		readonly matrix: readonly (readonly CellValue[])[];
		readonly source: ClipboardSource;
		readonly headerRow?: boolean;
		readonly alignments?: readonly Alignment[];
		readonly expectedTypes?: readonly ExpectedColumnType[];
		readonly warnings?: readonly ParseIssue[];
	};

	if (namedCodec) {
		const parsed = namedCodec.parseMatrix(
			request.payload.text,
			request.options,
		);
		if (!parsed.ok) {
			return {
				ok: false,
				error: {
					code: "invalid-format",
					format: namedCodec.id,
					issues: parsed.issues,
				},
			};
		}
		table = {
			matrix: parsed.table.matrix,
			source: namedCodec.id,
			headerRow: parsed.table.headerRow,
			alignments: parsed.table.alignments,
			warnings: parsed.warnings,
		};
	} else {
		const parsed = readClipboard(request.payload, request.options);
		if (!parsed) return { ok: false, error: { code: "empty" } };
		if (!parsed.ok) {
			return {
				ok: false,
				error: {
					code: "invalid-format",
					format: parsed.format,
					issues: [parsed.issue],
				},
			};
		}
		table = parsed.table;
	}

	// The shape is read off the parsed matrix, before it is padded out to a
	// rectangle. Normalizing first allocated every cell of a table the limits
	// were about to refuse, which is the opposite of refusing oversized input
	// before it can freeze the tab.
	const parsed = table.matrix;
	const firstParsedRow = parsed[0];
	if (!firstParsedRow || (parsed.length === 1 && firstParsedRow.length === 0)) {
		return { ok: false, error: { code: "empty" } };
	}

	const error = matrixShapeLimitError(parsed, table.headerRow);
	if (error) return { ok: false, error };

	const matrix = normalizeMatrix(parsed);

	return {
		ok: true,
		value: {
			matrix,
			source: table.source,
			headerRow: table.headerRow,
			alignments: table.alignments,
			expectedTypes: table.expectedTypes,
			warnings: table.warnings ?? [],
		},
	};
}

export function createImportedDocument(
	prepared: PreparedImport,
	headerRow: boolean,
): TableDocument {
	return documentFromMatrix(prepared.matrix, {
		headerRow,
		alignments: prepared.alignments,
		expectedTypes: prepared.expectedTypes,
	});
}
