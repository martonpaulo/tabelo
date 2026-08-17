export type ColumnId = string;
export type RowId = string;

// Markdown column alignment. `default` emits `---` with no colon.
export type Alignment = "default" | "left" | "center" | "right";

// What a cell may hold. A value is one of these because something carried the
// type here: a typed source, or the user choosing it. Nothing derives a type
// from how text looks. See docs/adr/0008.
export type CellValue = string | number | boolean | null;

export type CellValueType = "string" | "number" | "boolean" | "null";

// What a column expects to be typed into it. It guides editing and validation
// and never constrains the cells: a typed source may legitimately carry mixed
// types in one column, and the real type always belongs to the cell.
// `null` is a cell value chosen explicitly, not a column mode.
export type ExpectedColumnType = "text" | "number" | "boolean";

export interface Column {
	readonly id: ColumnId;
	readonly header: string;
	readonly align: Alignment;
	readonly expectedType: ExpectedColumnType;
}

export interface Row {
	readonly id: RowId;
	// Keyed by column id. A missing key reads as an empty cell, which is not
	// the same thing as a stored `null`: read it through `readCell` so the two
	// stay distinguishable.
	readonly cells: Readonly<Record<ColumnId, CellValue>>;
}

// The canonical table. Every representation: grid, Markdown, CSV: is derived
// from this. See docs/adr/0001.
export interface TableDocument {
	readonly columns: readonly Column[];
	readonly rows: readonly Row[];
}
