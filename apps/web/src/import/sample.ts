import { cellText } from "@/core/cell-value";
import type { CellValue } from "@/core/types";

// The corner of an incoming table the header question shows (#454), so the
// user can see row 1 before deciding what it is. These bound what is drawn,
// not what may be imported: the matrix already passed the import limits.
export const IMPORT_SAMPLE_LIMITS = {
	rows: 5,
	columns: 5,
	cellCharacters: 80,
} as const;

export interface ImportSampleCell {
	readonly text: string;
	// The text was cut at the character bound and ends with an ellipsis.
	readonly clipped: boolean;
}

export interface ImportSample {
	readonly rows: readonly (readonly ImportSampleCell[])[];
	readonly omittedRows: number;
	readonly omittedColumns: number;
}

function sampleCell(value: CellValue | undefined): ImportSampleCell {
	// Every value is read through the one projection, so a typed value shows
	// the text every view shows for it and nothing is inferred from it.
	const text = value === undefined ? "" : cellText(value);
	const characters = [...text];
	if (characters.length <= IMPORT_SAMPLE_LIMITS.cellCharacters) {
		return { text, clipped: false };
	}
	return {
		text: `${characters.slice(0, IMPORT_SAMPLE_LIMITS.cellCharacters).join("")}…`,
		clipped: true,
	};
}

// Reads only the bounded corner: rows and columns past it are counted, never
// copied, so a large input costs the dialog no more than a small one.
export function importSample(
	matrix: readonly (readonly CellValue[])[],
): ImportSample {
	const width = matrix.reduce((widest, row) => Math.max(widest, row.length), 0);
	const columns = Math.min(width, IMPORT_SAMPLE_LIMITS.columns);
	const rows = matrix
		.slice(0, IMPORT_SAMPLE_LIMITS.rows)
		.map((row) =>
			Array.from({ length: columns }, (_, column) => sampleCell(row[column])),
		);
	return {
		rows,
		omittedRows: Math.max(0, matrix.length - IMPORT_SAMPLE_LIMITS.rows),
		omittedColumns: Math.max(0, width - columns),
	};
}
