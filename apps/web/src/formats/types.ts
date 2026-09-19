import type { ReconciliationSource } from "@/core/document";
import type { Alignment, CellValue, TableDocument } from "@/core/types";

export type CodecId =
	| "markdown"
	| "csv"
	| "tsv"
	| "html"
	| "jira"
	| "json"
	| "records";

interface LocatedParseIssue {
	// 1-based line in the source text, when the problem can be located.
	readonly line?: number;
}

interface ColumnCountParseIssue extends LocatedParseIssue {
	readonly actual: number;
	readonly expected: number;
}

// Codecs report product-owned facts, never parser-authored prose. The UI is the
// single owner of visible copy and turns these discriminated values into calm,
// actionable messages.
export type ParseIssue =
	| ({ readonly code: "empty-source" } & LocatedParseIssue)
	| ({ readonly code: "markdown-table-incomplete" } & LocatedParseIssue)
	| ({ readonly code: "markdown-divider-required" } & LocatedParseIssue)
	| ({ readonly code: "markdown-divider-column-count" } & ColumnCountParseIssue)
	| ({
			readonly code: "row-column-count";
			readonly row: number;
	  } & ColumnCountParseIssue)
	| ({ readonly code: "jira-header-required" } & LocatedParseIssue)
	| ({ readonly code: "html-unavailable" } & LocatedParseIssue)
	| ({ readonly code: "html-table-required" } & LocatedParseIssue)
	// Inline HTML the document cannot carry (#306). The first two are warnings:
	// the text stays and only the formatting or the link around an image does
	// not. The last two refuse the parse, because keeping the text would lose
	// what the reader sees.
	| ({
			readonly code: "html-formatting-unsupported";
			// The element's tag name, lowercase, as the markup spells it.
			readonly tag: string;
	  } & LocatedParseIssue)
	| ({ readonly code: "html-linked-image-unsupported" } & LocatedParseIssue)
	| ({ readonly code: "html-image-alt-required" } & LocatedParseIssue)
	| ({
			readonly code: "html-embedded-content-unsupported";
			readonly tag: string;
	  } & LocatedParseIssue)
	| ({ readonly code: "json-invalid" } & LocatedParseIssue)
	| ({ readonly code: "json-rows-required" } & LocatedParseIssue)
	| ({ readonly code: "json-row-object-required" } & LocatedParseIssue)
	| ({ readonly code: "json-header-required" } & LocatedParseIssue)
	| ({ readonly code: "json-scalar-cells-required" } & LocatedParseIssue)
	| ({ readonly code: "delimited-unclosed-quote" } & LocatedParseIssue)
	| ({ readonly code: "delimited-invalid-quote" } & LocatedParseIssue)
	| ({ readonly code: "delimited-delimiter-undetected" } & LocatedParseIssue)
	| ({ readonly code: "delimited-field-count" } & LocatedParseIssue)
	| ({ readonly code: "delimited-parse-error" } & LocatedParseIssue)
	| ({ readonly code: "records-title-required" } & LocatedParseIssue)
	| ({ readonly code: "records-title-mismatch" } & LocatedParseIssue)
	| ({ readonly code: "records-bullet-required" } & LocatedParseIssue)
	| ({ readonly code: "records-unknown-column" } & LocatedParseIssue);

// Where one semantic table row sits in the source it was parsed from, as UTF-16
// offsets: `from` is its first character and `to` is just after its last one,
// before the line break that ends it (#296). A row is the table's unit, not a
// text line: a Markdown header owns its alignment divider too, and a CSV row
// with a quoted line break spans several lines. Only a format that can say this
// reliably returns it, from the same parse that found the rows; a source view
// draws the boundaries between them and never works them out itself.
export interface SourceRowRange {
	readonly from: number;
	readonly to: number;
}

// One table row as the parse found it in the source, with where each of its
// cells sits (#255). A cell runs from just after the delimiter before it to just
// before the delimiter after it, so it holds the cell's whole spelling: a
// Markdown cell's padding, a CSV field's quotes, every escape. Cells are in
// column order and never overlap, and a row holds as many as its line spells,
// which in a ragged draft can differ from the table's column count. A Markdown
// header's cells are on its first line; its alignment divider names the row
// and no column.
export interface SourceTableRow extends SourceRowRange {
	readonly cells: readonly SourceRowRange[];
}

// Where one field's content sits in source text, as UTF-16 offsets, for the
// source views that move between fields with Tab (#54). `from` is where typing
// into the field begins: inside a quoted delimited field, after a Markdown
// cell's padding, after a Records label. The ranges are ordered and come from
// the format's own grammar, so a delimiter inside a quoted or escaped value is
// never a stop. They describe the text as it stands, including a draft that
// does not parse, and they never change it.
export interface SourceFieldRange {
	readonly from: number;
	readonly to: number;
}

// One replacement in source text, as UTF-16 offsets into the text it applies
// to: `from` to `to` becomes `insert`.
export interface SourceEdit {
	readonly from: number;
	readonly to: number;
	readonly insert: string;
}

// A structural-assistance edit. `caretAfter` asks that a caret the user's edit
// left exactly at `from` land after the inserted text rather than before it,
// for a feature whose insertion is where typing continues, such as a new row's
// opening delimiter (#391). Without it a caret stays where the user put it.
export interface AssistanceEdit extends SourceEdit {
	readonly caretAfter?: boolean;
}

export type StructuralAssistance = (
	before: string,
	after: string,
	changed: readonly SourceRowRange[],
) => AssistanceEdit | null;

// A successful parse can still carry warnings: a ragged row is recoverable by
// padding, and saying so is better than silently reshaping the user's table.
export type ParseResult =
	| {
			readonly ok: true;
			readonly document: TableDocument;
			readonly warnings?: readonly ParseIssue[];
			// One per table row, header first, when the format can map them.
			readonly rows?: readonly SourceTableRow[];
	  }
	| { readonly ok: false; readonly issues: readonly ParseIssue[] };

export interface ParsedTable {
	readonly matrix: CellValue[][];
	// Formats that encode row roles declare whether row 1 is a header. An
	// absent fact means import must ask; it is never permission to infer from
	// cell values.
	readonly headerRow?: boolean;
	readonly alignments?: readonly Alignment[];
}

export type MatrixParseResult =
	| {
			readonly ok: true;
			readonly table: ParsedTable;
			readonly warnings?: readonly ParseIssue[];
			// One per matrix row: see SourceTableRow.
			readonly rows?: readonly SourceTableRow[];
	  }
	| { readonly ok: false; readonly issues: readonly ParseIssue[] };

// Choices that belong to the output file and to nothing else. They never reach
// the document, the history timeline, or any source projection: an output
// option shapes one download and says nothing about the table. See AGENTS.md
// on header handling.
export type OutputOptionId = "includeFirstColumnName" | "includeEmptyValues";

export interface OutputOptions {
	// Records only, both download-only: dropping the first column's name from
	// the title line, or dropping bullets whose value is empty. Both produce
	// output the codec cannot parse back, which is exactly why neither may ever
	// reach an editable pane. See formats/records.ts.
	readonly includeFirstColumnName?: boolean;
	readonly includeEmptyValues?: boolean;
}

// How a format spells what it can write more than one lossless way (#397).
// Unlike an output option, a spelling is never lossy and reaches every text of
// the format alike: a pane shows exactly what a download, a copy, or the
// clipboard would hold, and the parser reads every spelling whatever is
// chosen, so the choice decides only which one is written. A format ignores
// a spelling it does not declare.
export interface Spelling {
	// Markdown only: write a line break inside a cell as `<br>` rather than
	// as the character reference `&#10;`.
	readonly lineBreakTags?: boolean;
}

export type SpellingId = keyof Spelling;

// A precondition failure means the document is valid, but this codec cannot
// represent it. Indices are zero-based application positions; presentation
// code gives them user-facing row numbers and column letters.
export interface PreconditionFailure {
	readonly code: string;
	readonly columns?: readonly number[];
	readonly rows?: readonly number[];
}

// One owner for what an unconfigured download produces.
export const defaultOutputOptions: Required<OutputOptions> = {
	includeFirstColumnName: true,
	includeEmptyValues: true,
};

// A codec is a parser/serializer pair over the table document, plus the file
// facts needed to download it. Adding a format means adding one of these and
// registering it; synchronization, history, persistence, downloads, and the
// clipboard all read the registry rather than naming formats. See
// docs/adr/0005.
export interface TableCodec {
	readonly id: CodecId;
	// Format facts used by structural reconciliation. A text-only syntax can
	// preserve an unchanged canonical value only with the previous document,
	// while metadata the syntax cannot express must stay on that document.
	readonly reconciliation: ReconciliationSource;
	// Without the leading dot.
	readonly extension: string;
	readonly mimeType: string;
	// Import and clipboard preparation validate this neutral matrix before any
	// application document is constructed or rendered.
	readonly parseMatrix: (text: string) => MatrixParseResult;
	readonly parse: (text: string) => ParseResult;
	readonly serialize: (
		document: TableDocument,
		options?: OutputOptions & Spelling,
	) => string;
	readonly precondition?: (
		document: TableDocument,
	) => PreconditionFailure | null;
	// Which output choices this format understands. Absent means the download
	// has nothing to ask, which is what keeps the chooser from offering an
	// option that would do nothing.
	readonly outputOptions?: readonly OutputOptionId[];
	// Which spellings this format offers a choice between (#397). Absent means
	// it writes one spelling of everything, and no pane offers a choice.
	readonly spellings?: readonly SpellingId[];
	// The separator this format writes between fields, for the formats that
	// have one. Declared rather than sniffed, because a source view only ever
	// reads back this codec's own output. Presentation reads it to place
	// empty-value markers; parsing never consults it.
	readonly fieldSeparator?: string;
	// Whether a successful parse returns where each row, and each cell of it,
	// sits in the source (#296, #255). This is the codec's position mapping: a
	// source view reads it to name the table row and column under the caret,
	// which is what lets a structural command act from the text. Declared only
	// where the mapping is exact, because a command on the wrong row is silent
	// corruption that looks like success. HTML, Records, and JSON have no
	// reliable row boundary and do not declare it, and their panes offer no
	// structural commands. The header row's cells it maps are also where a
	// source view stands its column letters (#368). See docs/adr/0005.
	readonly mapsSourceRows?: boolean;
	// Whether the format's own text pads every cell to its column's width, as
	// Markdown's serializer does. A source view aligns the columns of a format
	// that maps its rows and does not pad them, drawing the padding on screen
	// only (#396); a format that pads has nothing left to align.
	readonly padsColumns?: boolean;
	// The fields of `text` in reading order, header first, for the formats whose
	// syntax is a grid of delimited fields (#54). Tolerant by design: a draft
	// that fails to parse still yields whatever fields its lines spell, so Tab
	// keeps moving while the user repairs it. Absent for formats that nest
	// rather than delimit, whose source views indent instead.
	readonly sourceFields?: (text: string) => readonly SourceFieldRange[];
	// Whether a line break inside a cell is written as a real newline inside
	// one of the `sourceFields`, as a quoted delimited field writes it, rather
	// than as an escape sequence. A source view reads it to mark where such a
	// break falls (owner, 2026-09-19); it is a fact about the grammar and
	// never an input to parsing.
	readonly literalLineBreaks?: boolean;
	// This format's structural assistance, when it has any (#297). One function
	// per codec: a format with several named features combines them here, and
	// no two of them act on the same edit. Given the draft before and after a user edit, and the ranges that edit
	// changed in `after`, it returns at most one further edit to `after`, or
	// null to leave the text exactly as typed. Pure and text-only by contract:
	// it never reads the document, the store, or the editor, and it returns null
	// whenever the draft does not settle what the change should be. The source
	// editor lands the result in the same transaction as the triggering edit.
	// See "Source text is free; structural assistance is narrow" in AGENTS.md.
	readonly structuralAssistance?: StructuralAssistance;
	// Text clipboard sniffing is format-owned. Lower priorities run first.
	readonly sniffPriority?: number;
	readonly canSniff?: (text: string) => boolean;
}

// One escape sequence recognized at one offset of serialized text, as the
// format that owns the grammar reports it. The decoders read these to restore a
// cell, and the source views read the same matches to draw over them: see
// docs/adr/0002 for the grammar itself, and docs/design-system/2-tokens.md, "Syntax and
// table structure", for what the editor draws.
//
// `kind` says what the reader has to be told, not what the character is. A
// space and a tab are invisible, a line break cannot be drawn on one line, and
// everything else resolves to a character that is visible once the notation
// around it is gone.
export type EscapeKind = "whitespace" | "line-break" | "character";

export interface EscapeMatch {
	// Exactly the characters consumed at the offset, so a caller can advance by
	// its length without knowing the grammar.
	readonly source: string;
	// What the sequence restores. Empty for nothing the grammar can produce.
	readonly decoded: string;
	readonly kind: EscapeKind;
}

// Recognizes the one escape sequence beginning at `index`, or reports that an
// ordinary character sits there. One pass, longest match first: what a matcher
// returns is never examined again, which is what keeps a literal spelling such
// as `&amp;#32;` literal after its ampersand is restored.
export type EscapeMatcher = (
	value: string,
	index: number,
) => EscapeMatch | null;
