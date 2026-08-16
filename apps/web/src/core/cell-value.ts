import type { CellValue, ColumnId, ExpectedColumnType, Row } from "./types";

// The scalar cell model and its one text projection. Framework-free, and the
// only place that decides what a native value looks like as text.
// See docs/adr/0008.

export const EXPECTED_COLUMN_TYPES = [
	"text",
	"number",
	"boolean",
] as const satisfies readonly ExpectedColumnType[];

// A column expects text until something says otherwise. Every column created
// here, parsed from a text format, or migrated from an older payload starts
// with this, so widening the model changed no existing table.
export const DEFAULT_EXPECTED_TYPE: ExpectedColumnType = "text";

// The single owner of scalar-to-text projection. Every view, codec, and export
// that needs a cell as text comes through here, so there is exactly one answer
// to what a value looks like and no caller can drift from it.
//
// `null` and the empty string project to the same text and stay distinct as
// canonical values: text is a projection, never the value itself.
export function cellText(value: CellValue): string {
	switch (typeof value) {
		case "string":
			return value;
		case "number":
			return String(value);
		case "boolean":
			return value ? "true" : "false";
		default:
			return "";
	}
}

// A cell key that is not present reads as an empty cell. `??` cannot express
// that any more: it would swallow a stored `null` as well, which is a real
// value the user or a typed source chose. Every read goes through here.
export function readCell(row: Row, columnId: ColumnId): CellValue {
	const value = row.cells[columnId];
	return value === undefined ? "" : value;
}

export function cellTextAt(row: Row, columnId: ColumnId): string {
	return cellText(readCell(row, columnId));
}

// Blank is the empty string and nothing else. A `0`, a `false`, or an explicit
// `null` is content someone put there, and counting it as blank would let the
// destructive actions guarded by `isDocumentBlank` skip their confirmation.
export function isBlankCell(value: CellValue): boolean {
	return value === "";
}
