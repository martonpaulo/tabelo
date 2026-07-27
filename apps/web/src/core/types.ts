export type ColumnId = string;
export type RowId = string;

// Markdown column alignment. `default` emits `---` with no colon.
export type Alignment = "default" | "left" | "center" | "right";

export interface Column {
	readonly id: ColumnId;
	readonly header: string;
	readonly align: Alignment;
	// Display width in pixels. Presentation only; never affects serialization.
	readonly width?: number;
}

export interface Row {
	readonly id: RowId;
	// Keyed by column id. A missing key reads as an empty cell.
	readonly cells: Readonly<Record<ColumnId, string>>;
}

// The canonical table. Every representation — grid, Markdown, CSV — is derived
// from this. See docs/adr/0001.
export interface TableDocument {
	readonly columns: readonly Column[];
	readonly rows: readonly Row[];
}
