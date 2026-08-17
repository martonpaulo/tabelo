import { documentToMatrix } from "@/core/document";
import type { Alignment, TableDocument } from "@/core/types";
import type { CodecId, TableCodec } from "@/formats";

interface CodecProjectionContract {
	readonly normalizesLineEndings: boolean;
}

// These are format facts, not weakened assertions. Matrix content is always
// compared. Only metadata the format cannot encode is projected away.
const projectionContracts: Record<CodecId, CodecProjectionContract> = {
	markdown: { normalizesLineEndings: true },
	csv: { normalizesLineEndings: false },
	tsv: { normalizesLineEndings: false },
	html: { normalizesLineEndings: true },
	jira: { normalizesLineEndings: true },
	json: { normalizesLineEndings: false },
	records: { normalizesLineEndings: true },
};

function normalizeLineEndings(value: string): string {
	return value.replace(/\r\n?/g, "\n");
}

export interface DocumentProjection {
	readonly matrix: readonly (readonly string[])[];
	readonly alignments: readonly Alignment[];
}

function projectAlignment(
	codec: TableCodec,
	document: TableDocument,
): readonly Alignment[] {
	return document.columns.map((column) =>
		codec.reconciliation.columnAlignment === "carried"
			? column.align
			: "default",
	);
}

export function observeDocumentForCodec(
	codec: TableCodec,
	document: TableDocument,
): DocumentProjection {
	return {
		matrix: documentToMatrix(document),
		alignments: projectAlignment(codec, document),
	};
}

export function expectedDocumentForCodec(
	codec: TableCodec,
	document: TableDocument,
): DocumentProjection {
	const contract = projectionContracts[codec.id];
	const matrix = documentToMatrix(document).map((row) =>
		row.map((value) =>
			contract.normalizesLineEndings ? normalizeLineEndings(value) : value,
		),
	);
	return {
		matrix,
		alignments: projectAlignment(codec, document),
	};
}
