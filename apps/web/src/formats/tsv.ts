import { createDelimitedCodec } from "./delimited";

// Tab-separated is what spreadsheets put on the clipboard, so this codec is
// also the shape most external pastes arrive in.
export const tsvCodec = createDelimitedCodec({
	id: "tsv",
	extension: "tsv",
	mimeType: "text/tab-separated-values",
	delimiter: "\t",
	sniffDelimiter: false,
});
