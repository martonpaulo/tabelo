import type { TableDocument } from "@/core/types";
import {
	createDelimitedCodec,
	type DelimitedOptions,
	serializeDelimited,
} from "./delimited";

export const csvCodec = createDelimitedCodec({
	id: "csv",
	label: "CSV",
	extension: "csv",
	mimeType: "text/csv",
	delimiter: ",",
	sniffDelimiter: true,
});

// Header-less output is an export preference, never document state. See
// AGENTS.md on header handling.
export function serializeCsvWith(
	document: TableDocument,
	options: DelimitedOptions = {},
): string {
	return serializeDelimited(document, ",", options);
}

export { parseDelimitedMatrix as parseCsvMatrix } from "./delimited";
