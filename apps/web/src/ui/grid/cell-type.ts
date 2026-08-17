import type {
	CellValue,
	CellValueType,
	ExpectedColumnType,
} from "@/core/types";

export type { CellValueType } from "@/core/types";

export const CELL_TYPE_MARKS = {
	string: "text",
	number: "num",
	boolean: "bool",
	null: "null",
} as const satisfies Record<CellValueType, string>;

export function cellValueType(value: CellValue): CellValueType {
	switch (typeof value) {
		case "string":
			return "string";
		case "number":
			return "number";
		case "boolean":
			return "boolean";
		default:
			return "null";
	}
}

export function expectedCellValueType(
	expectedType: ExpectedColumnType,
): Exclude<CellValueType, "null"> {
	return expectedType === "text" ? "string" : expectedType;
}

export function cellTypeDiverges(
	value: CellValue,
	expectedType: ExpectedColumnType,
): boolean {
	return cellValueType(value) !== expectedCellValueType(expectedType);
}
