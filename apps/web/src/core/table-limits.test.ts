import { describe, expect, it } from "vitest";
import { matrixShapeLimitError, TABLE_LIMITS } from "./table-limits";

function matrix(rows: number, columns: number): string[][] {
	return Array.from({ length: rows }, () =>
		Array.from({ length: columns }, () => ""),
	);
}

// A parsed matrix is judged as the table it would become (#418): data rows,
// the widest row as the column count, and their product as the cells.
describe("matrix shape limits", () => {
	it.each([
		// A declared header is not a data row.
		[TABLE_LIMITS.rows + 1, 1, true, null],
		[TABLE_LIMITS.rows + 2, 1, true, "too-many-rows"],
		// An undecided header may become data, so every row is counted.
		[TABLE_LIMITS.rows, 1, undefined, null],
		[TABLE_LIMITS.rows + 1, 1, undefined, "too-many-rows"],
		[TABLE_LIMITS.rows + 1, 1, false, "too-many-rows"],
		[2, TABLE_LIMITS.columns, true, null],
		[2, TABLE_LIMITS.columns + 1, true, "too-many-columns"],
		[251, 200, true, null],
		[252, 200, true, "too-many-cells"],
		[250, 200, undefined, null],
		[251, 200, undefined, "too-many-cells"],
	] as const)(
		"%i rows by %i columns, header %s",
		(rows, columns, header, code) => {
			expect(
				matrixShapeLimitError(matrix(rows, columns), header)?.code ?? null,
			).toBe(code);
		},
	);

	it("counts the widest row of a ragged matrix as the column count", () => {
		const ragged = [
			[""],
			Array.from({ length: TABLE_LIMITS.columns + 1 }, () => ""),
			[],
		];

		expect(matrixShapeLimitError(ragged, true)).toEqual({
			code: "too-many-columns",
			actual: TABLE_LIMITS.columns + 1,
			limit: TABLE_LIMITS.columns,
		});
	});

	// Many short rows under one long one: the product of the two is what
	// padding would allocate, and it is refused without being built.
	it("refuses a ragged matrix whose padded rectangle is past the cell limit", () => {
		const ragged = [
			Array.from({ length: TABLE_LIMITS.columns }, () => ""),
			...Array.from({ length: TABLE_LIMITS.rows }, () => [""]),
		];

		expect(matrixShapeLimitError(ragged, true)?.code).toBe("too-many-cells");
	});
});
