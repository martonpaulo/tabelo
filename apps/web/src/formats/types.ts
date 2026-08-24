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

// A successful parse can still carry warnings: a ragged row is recoverable by
// padding, and saying so is better than silently reshaping the user's table.
export type ParseResult =
	| {
			readonly ok: true;
			readonly document: TableDocument;
			readonly warnings?: readonly ParseIssue[];
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
	  }
	| { readonly ok: false; readonly issues: readonly ParseIssue[] };

// Choices that belong to the output file and to nothing else. They never reach
// the document, the history timeline, or any source projection: the table
// always has exactly one header row, and whether a download prints it is a
// property of that download. See AGENTS.md on header handling.
export type OutputOptionId =
	| "includeHeader"
	| "includeFirstColumnName"
	| "includeEmptyValues";

export interface OutputOptions {
	readonly includeHeader?: boolean;
	// Records only, both download-only: dropping the first column's name from
	// the title line, or dropping bullets whose value is empty. Both produce
	// output the codec cannot parse back, which is exactly why neither may ever
	// reach an editable pane. See formats/records.ts.
	readonly includeFirstColumnName?: boolean;
	readonly includeEmptyValues?: boolean;
}

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
	includeHeader: true,
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
		options?: OutputOptions,
	) => string;
	readonly precondition?: (
		document: TableDocument,
	) => PreconditionFailure | null;
	// Which output choices this format understands. Absent means the download
	// has nothing to ask, which is what keeps the chooser from offering an
	// option that would do nothing.
	readonly outputOptions?: readonly OutputOptionId[];
	// The separator this format writes between fields, for the formats that
	// have one. Declared rather than sniffed, because a source view only ever
	// reads back this codec's own output. Presentation reads it to place
	// empty-value markers; parsing never consults it.
	readonly fieldSeparator?: string;
	// Text clipboard sniffing is format-owned. Lower priorities run first.
	readonly sniffPriority?: number;
	readonly canSniff?: (text: string) => boolean;
}

// One escape sequence recognized at one offset of serialized text, as the
// format that owns the grammar reports it. The decoders read these to restore a
// cell, and the source views read the same matches to draw over them: see
// docs/adr/0002 for the grammar itself, and docs/design-system.md, "Syntax and
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
