import {
	type ClipboardPayload,
	type ClipboardSource,
	readClipboardTable,
} from "@/clipboard/parse";
import {
	detectHeaderRow,
	documentFromMatrix,
	normalizeMatrix,
} from "@/core/document";
import type { Alignment, TableDocument } from "@/core/types";
import { getCodec } from "@/formats";
import type { CodecId, ParseIssue } from "@/formats/types";

export const IMPORT_LIMITS = {
	rows: 500,
	columns: 200,
	cells: 50_000,
	payloadBytes: 1_048_576,
} as const;

export type ImportError =
	| {
			readonly code: "invalid-format";
			readonly format: CodecId;
			readonly issues: readonly ParseIssue[];
	  }
	| { readonly code: "empty" }
	| {
			readonly code: "too-many-rows";
			readonly actual: number;
			readonly limit: number;
	  }
	| {
			readonly code: "too-many-columns";
			readonly actual: number;
			readonly limit: number;
	  }
	| {
			readonly code: "too-many-cells";
			readonly actual: number;
			readonly limit: number;
	  }
	| {
			readonly code: "payload-too-large";
			readonly actual: number;
			readonly limit: number;
	  };

export interface PreparedImport {
	readonly matrix: string[][];
	readonly source: ClipboardSource;
	readonly headerRow: boolean;
	readonly alignments?: readonly Alignment[];
	readonly warnings: readonly ParseIssue[];
}

export type PrepareImportResult =
	| { readonly ok: true; readonly value: PreparedImport }
	| { readonly ok: false; readonly error: ImportError };

export interface PrepareImportRequest {
	readonly payload: ClipboardPayload;
	readonly format?: CodecId;
}

function payloadBytes(payload: ClipboardPayload): number {
	const encoder = new TextEncoder();
	return (
		encoder.encode(payload.text).byteLength +
		(payload.html ? encoder.encode(payload.html).byteLength : 0)
	);
}

export interface TableShape {
	readonly rows: number;
	readonly columns: number;
}

export function tableShapeLimitError({
	rows,
	columns,
}: TableShape): ImportError | null {
	const cells = rows * columns;

	if (rows > IMPORT_LIMITS.rows) {
		return { code: "too-many-rows", actual: rows, limit: IMPORT_LIMITS.rows };
	}
	if (columns > IMPORT_LIMITS.columns) {
		return {
			code: "too-many-columns",
			actual: columns,
			limit: IMPORT_LIMITS.columns,
		};
	}
	if (cells > IMPORT_LIMITS.cells) {
		return {
			code: "too-many-cells",
			actual: cells,
			limit: IMPORT_LIMITS.cells,
		};
	}
	return null;
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
		readonly matrix: string[][];
		readonly source: ClipboardSource;
		readonly alignments?: readonly Alignment[];
		readonly warnings?: readonly ParseIssue[];
	};

	if (namedCodec) {
		const parsed = namedCodec.parseMatrix(request.payload.text);
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
			alignments: parsed.table.alignments,
			warnings: parsed.warnings,
		};
	} else {
		const parsed = readClipboardTable(request.payload);
		if (!parsed) return { ok: false, error: { code: "empty" } };
		table = parsed;
	}

	const matrix = normalizeMatrix(table.matrix);
	if (matrix.length === 0 || (matrix.length === 1 && matrix[0].length === 0)) {
		return { ok: false, error: { code: "empty" } };
	}

	const error = tableShapeLimitError({
		rows: matrix.length,
		columns: matrix[0]?.length ?? 0,
	});
	if (error) return { ok: false, error };

	return {
		ok: true,
		value: {
			matrix,
			source: table.source,
			headerRow: detectHeaderRow(matrix),
			alignments: table.alignments,
			warnings: table.warnings ?? [],
		},
	};
}

export function createImportedDocument(
	prepared: PreparedImport,
): TableDocument {
	return documentFromMatrix(prepared.matrix, {
		headerRow: prepared.headerRow,
		alignments: prepared.alignments,
	});
}
