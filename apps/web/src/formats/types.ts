import type { Alignment, TableDocument } from "@/core/types";

export type CodecId = "markdown" | "csv" | "tsv" | "html" | "jira";

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
	| ({ readonly code: "delimited-unclosed-quote" } & LocatedParseIssue)
	| ({ readonly code: "delimited-invalid-quote" } & LocatedParseIssue)
	| ({ readonly code: "delimited-delimiter-undetected" } & LocatedParseIssue)
	| ({ readonly code: "delimited-field-count" } & LocatedParseIssue)
	| ({ readonly code: "delimited-parse-error" } & LocatedParseIssue);

// A successful parse can still carry warnings — a ragged row is recoverable by
// padding, and saying so is better than silently reshaping the user's table.
export type ParseResult =
	| {
			readonly ok: true;
			readonly document: TableDocument;
			readonly warnings?: readonly ParseIssue[];
	  }
	| { readonly ok: false; readonly issues: readonly ParseIssue[] };

export interface ParsedTable {
	readonly matrix: string[][];
	readonly alignments?: readonly Alignment[];
}

export type MatrixParseResult =
	| {
			readonly ok: true;
			readonly table: ParsedTable;
			readonly warnings?: readonly ParseIssue[];
	  }
	| { readonly ok: false; readonly issues: readonly ParseIssue[] };

// A codec is a parser/serializer pair over the table document, plus the file
// facts needed to download it. Adding a format means adding one of these and
// registering it; synchronization, history, persistence, downloads, and the
// clipboard all read the registry rather than naming formats. See
// docs/adr/0005.
export interface TableCodec {
	readonly id: CodecId;
	readonly label: string;
	// Without the leading dot.
	readonly extension: string;
	readonly mimeType: string;
	// Import and clipboard preparation validate this neutral matrix before any
	// application document is constructed or rendered.
	readonly parseMatrix: (text: string) => MatrixParseResult;
	readonly parse: (text: string) => ParseResult;
	readonly serialize: (document: TableDocument) => string;
	// Text clipboard sniffing is format-owned. Lower priorities run first.
	readonly sniffPriority?: number;
	readonly canSniff?: (text: string) => boolean;
}
