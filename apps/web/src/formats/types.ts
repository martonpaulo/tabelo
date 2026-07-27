import type { TableDocument } from "@/core/types";

export type TextFormat = "markdown" | "csv";

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

// A format is a parser/serializer pair over the table document. Adding TSV,
// JSON, or HTML later means adding one of these — synchronization, history,
// and persistence do not change. See docs/adr/0001.
export interface TableFormat {
	readonly id: TextFormat;
	readonly label: string;
	// File extension used for export, without the dot.
	readonly extension: string;
	readonly mimeType: string;
	parse(text: string): ParseResult;
	serialize(document: TableDocument): string;
}
