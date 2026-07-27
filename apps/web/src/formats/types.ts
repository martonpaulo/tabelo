import type { TableDocument } from "@/core/types";

export type CodecId = "markdown" | "csv" | "tsv" | "html" | "jira";

export interface ParseIssue {
	readonly message: string;
	// 1-based line in the source text, when the problem can be located.
	readonly line?: number;
}

// A successful parse can still carry warnings — a ragged row is recoverable by
// padding, and saying so is better than silently reshaping the user's table.
export type ParseResult =
	| {
			readonly ok: true;
			readonly document: TableDocument;
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
	readonly parse: (text: string) => ParseResult;
	readonly serialize: (document: TableDocument) => string;
}
