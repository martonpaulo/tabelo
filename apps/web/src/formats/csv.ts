import { createDelimitedCodec } from "./delimited";

// The header row is structural document state, so every CSV file prints it.
// A file without it no longer describes the table it came from, and nothing
// reads one back that way. See AGENTS.md.
export const csvCodec = createDelimitedCodec({
	id: "csv",
	extension: "csv",
	mimeType: "text/csv",
	delimiter: ",",
	sniffDelimiter: true,
});
