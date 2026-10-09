// The one size policy every path that can grow the table follows (#418):
// import, paste, source parsing, grid and source structure commands,
// duplication, transpose, and agent batches all judge the shape they would
// produce here, before building it. AGENTS.md puts the working scale at
// roughly 200 rows; these are the ceilings past which input is refused with a
// message rather than allowed to freeze the tab.
//
// `rows` always counts data rows, as `document.rows` holds them: the header
// row is structural and every table has exactly one, so it is never charged.
// `cells` is data rows times columns.
export const TABLE_LIMITS = {
	rows: 500,
	columns: 200,
	cells: 50_000,
} as const;

export type TableShapeLimitError =
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
	  };

export interface TableShape {
	// Data rows, header excluded.
	readonly rows: number;
	readonly columns: number;
}

export function tableShapeLimitError({
	rows,
	columns,
}: TableShape): TableShapeLimitError | null {
	if (rows > TABLE_LIMITS.rows) {
		return { code: "too-many-rows", actual: rows, limit: TABLE_LIMITS.rows };
	}
	if (columns > TABLE_LIMITS.columns) {
		return {
			code: "too-many-columns",
			actual: columns,
			limit: TABLE_LIMITS.columns,
		};
	}
	const cells = rows * columns;
	if (cells > TABLE_LIMITS.cells) {
		return { code: "too-many-cells", actual: cells, limit: TABLE_LIMITS.cells };
	}
	return null;
}

// The shape a parsed, possibly ragged, matrix would become, judged before it
// is padded out to a rectangle: padding first would allocate every cell of a
// table the limits are about to refuse. The widest row is what padding would
// make every row, so it is the column count.
//
// `headerRow` is what the source declared. A declared header is not a data
// row. An undecided one (CSV, TSV, or plain text, which ask later) is judged
// as data, because answering "data" keeps every row as one.
export function matrixShapeLimitError(
	matrix: readonly (readonly unknown[])[],
	headerRow: boolean | undefined,
): TableShapeLimitError | null {
	let columns = 0;
	for (const row of matrix) {
		if (row.length > columns) columns = row.length;
	}
	const rows =
		headerRow === true ? Math.max(1, matrix.length - 1) : matrix.length;
	return tableShapeLimitError({ rows, columns });
}
