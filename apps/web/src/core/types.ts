export type ColumnId = string;
export type RowId = string;

// Markdown column alignment. `default` emits `---` with no colon.
export type Alignment = "default" | "left" | "center" | "right";

// The formatting a run of text can carry, in its one canonical order. See
// docs/adr/0011 for the model and why code cannot combine with the others.
export type InlineMark =
	| "bold"
	| "italic"
	| "underline"
	| "strikethrough"
	| "code";

// A run of text and the marks on all of it. Line breaks are ordinary `\n`
// characters inside the text.
export interface InlineText {
	readonly kind: "text";
	readonly text: string;
	readonly marks: readonly InlineMark[];
}

// A link owns only text runs: it never holds another link or an image. The URL
// is kept exactly as authored and never fetched, normalized, or followed.
export interface InlineLink {
	readonly kind: "link";
	readonly url: string;
	readonly children: readonly InlineText[];
}

// An atomic inline object. Its alternative text is required and is what every
// plain projection shows in its place.
export interface InlineImage {
	readonly kind: "image";
	readonly url: string;
	readonly alt: string;
}

export type InlineNode = InlineText | InlineLink | InlineImage;

// Text with structure. It exists only while it holds structure: content that
// normalizes to unmarked text is a plain string, so an existing document never
// gains a wrapper and one value has exactly one canonical form.
export interface InlineContent {
	readonly kind: "inline";
	readonly nodes: readonly InlineNode[];
}

// What a header or a textual cell holds.
export type TextContent = string | InlineContent;

// What a cell may hold. A value is one of these because something carried the
// type here: a typed source, or the user choosing it. Nothing derives a type
// from how text looks. Inline content is textual: its type is `string`, and
// formatting never reaches a number, a boolean, or `null`. See docs/adr/0008
// and docs/adr/0011.
export type CellValue = TextContent | number | boolean | null;

export type CellValueType = "string" | "number" | "boolean" | "null";

// What a column expects to be typed into it. It guides editing and validation
// and never constrains the cells: a typed source may legitimately carry mixed
// types in one column, and the real type always belongs to the cell.
// `null` is a cell value chosen explicitly, not a column mode.
export type ExpectedColumnType = "text" | "number" | "boolean";

export interface Column {
	readonly id: ColumnId;
	readonly header: TextContent;
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
