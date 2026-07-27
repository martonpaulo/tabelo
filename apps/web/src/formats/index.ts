import { csvFormat } from "./csv";
import { markdownFormat } from "./markdown";
import type { TableFormat, TextFormat } from "./types";

// The registry is deliberately a plain lookup rather than a plugin system.
// Adding TSV or JSON later means adding a TableFormat here and widening
// TextFormat — nothing else has to change. See docs/adr/0001.
export const formats: Record<TextFormat, TableFormat> = {
	markdown: markdownFormat,
	csv: csvFormat,
};

export const formatOrder: readonly TextFormat[] = ["markdown", "csv"];

export function getFormat(id: TextFormat): TableFormat {
	return formats[id];
}

export type { ParseIssue, ParseResult, TableFormat, TextFormat } from "./types";
export { csvFormat, markdownFormat };
