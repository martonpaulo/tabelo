import { documentFromMatrix } from "@/core/document";
import type { MatrixParseResult, ParseResult } from "./types";

export function toDocumentParseResult(result: MatrixParseResult): ParseResult {
	if (!result.ok) return result;

	return {
		ok: true,
		document: documentFromMatrix(result.table.matrix, {
			headerRow: result.table.headerRow ?? true,
			alignments: result.table.alignments,
		}),
		warnings: result.warnings,
	};
}
