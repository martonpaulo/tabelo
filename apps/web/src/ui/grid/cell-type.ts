import { cellValueType, expectedCellValueType } from "@/core/cell-value";
import type {
	CellValue,
	CellValueType,
	ExpectedColumnType,
} from "@/core/types";

export { cellValueType, expectedCellValueType } from "@/core/cell-value";
export type { CellValueType } from "@/core/types";

export const CELL_TYPE_MARKS = {
	string: "text",
	number: "num",
	boolean: "bool",
	null: "null",
} as const satisfies Record<CellValueType, string>;

export function cellTypeDiverges(
	value: CellValue,
	expectedType: ExpectedColumnType,
): boolean {
	return cellValueType(value) !== expectedCellValueType(expectedType);
}
