import { documentToMatrix } from "@/core/document";
import type { Alignment, TableDocument } from "@/core/types";
import type { CodecId, TableCodec } from "@/formats";

interface CodecProjectionContract {
	readonly normalizesLineEndings: boolean;
	readonly preservesAlignment: boolean;
}

// These are format facts, not weakened assertions. Matrix content is always
// compared. Only metadata the format cannot encode is projected away.
const projectionContracts: Record<CodecId, CodecProjectionContract> = {
	markdown: { normalizesLineEndings: true, preservesAlignment: true },
	csv: { normalizesLineEndings: false, preservesAlignment: false },
	tsv: { normalizesLineEndings: false, preservesAlignment: false },
	html: { normalizesLineEndings: true, preservesAlignment: true },
	jira: { normalizesLineEndings: true, preservesAlignment: false },
	json: { normalizesLineEndings: false, preservesAlignment: false },
	records: { normalizesLineEndings: true, preservesAlignment: false },
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
	const contract = projectionContracts[codec.id];
	return document.columns.map((column) =>
		contract.preservesAlignment ? column.align : "default",
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
