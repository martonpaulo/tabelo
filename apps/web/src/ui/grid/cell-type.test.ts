import { describe, expect, it } from "vitest";
import type { CellValue, ExpectedColumnType } from "@/core/types";
import { cellTypeDiverges } from "./cell-type";

describe("grid cell type presentation", () => {
	it.each([
		["007", "text", false],
		[7, "number", false],
		[true, "boolean", false],
		[null, "text", true],
		["7", "number", true],
		[7, "text", true],
		[false, "number", true],
	] as const satisfies readonly [CellValue, ExpectedColumnType, boolean][])(
		"reports whether %p diverges from %s",
		(value, expected, diverges) => {
			expect(cellTypeDiverges(value, expected)).toBe(diverges);
		},
	);
});
