import { cellValueType, expectedCellValueType } from "@/core/cell-value";
import type {
	CellValue,
	CellValueType,
	ExpectedColumnType,
} from "@/core/types";

export { cellValueType, expectedCellValueType } from "@/core/cell-value";
export type { CellValueType } from "@/core/types";

const CELL_TYPE_PRESENTATION_CLASSES = {
	string: "text-foreground",
	number: "text-value-number font-semibold tabular-nums",
	boolean: "text-value-boolean font-semibold",
	null: "text-value-null italic",
} as const satisfies Record<CellValueType, string>;

export function cellTypePresentationClass(type: CellValueType): string {
	return CELL_TYPE_PRESENTATION_CLASSES[type];
}

// An empty string is an empty cell, not text that disagrees with its column:
// marking every blank cell of a number column drew a symbol down the whole
// column (owner, 2026-09-19). A null is a stated value and keeps its mark.
export function cellTypeDiverges(
	value: CellValue,
	expectedType: ExpectedColumnType,
): boolean {
	if (value === "") return false;
	return cellValueType(value) !== expectedCellValueType(expectedType);
}
