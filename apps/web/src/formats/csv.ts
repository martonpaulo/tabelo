import { createDelimitedCodec } from "./delimited";

// The header row is document state and always exists; whether a CSV file
// prints it is a property of that file. CSV is the only format that promises
// the choice, so it is the only one that declares it. See AGENTS.md.
export const csvCodec = createDelimitedCodec({
	id: "csv",
	extension: "csv",
	mimeType: "text/csv",
	delimiter: ",",
	sniffDelimiter: true,
	outputOptions: ["includeHeader"],
});
