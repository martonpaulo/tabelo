import { csvCodec } from "./csv";
import { htmlCodec } from "./html";
import { jiraCodec } from "./jira";
import { jsonCodec } from "./json";
import { markdownCodec } from "./markdown";
import { tsvCodec } from "./tsv";
import type { CodecId, OutputOptions, TableCodec } from "./types";

// The codec registry. Downloads, clipboard sniffing, and the view registry all
// read from here, so adding a format is a single registration rather than an
// edit in five places. See docs/adr/0005.
const registry: Record<CodecId, TableCodec> = {
	markdown: markdownCodec,
	csv: csvCodec,
	tsv: tsvCodec,
	html: htmlCodec,
	jira: jiraCodec,
	json: jsonCodec,
};

// Order is the product's own preference, shown wherever formats are listed.
export const codecOrder: readonly CodecId[] = [
	"markdown",
	"csv",
	"tsv",
	"html",
	"jira",
	"json",
];

export function getCodec(id: CodecId): TableCodec {
	return registry[id];
}

export function listCodecs(): readonly TableCodec[] {
	return codecOrder.map((id) => registry[id]);
}

export function listSniffableCodecs(): readonly TableCodec[] {
	return listCodecs()
		.filter((codec) => codec.sniffPriority !== undefined)
		.toSorted(
			(left, right) => (left.sniffPriority ?? 0) - (right.sniffPriority ?? 0),
		);
}

// Every registered codec can serialize, so every one is downloadable. Keeping
// this derived means a new format appears in the download menu automatically.
export function listDownloadableCodecs(): readonly TableCodec[] {
	return listCodecs();
}

// Narrows the user's chosen values to the ones this format actually promises.
// Formats can share an implementation. CSV and TSV use one serializer, so a
// value left in would be honoured by a format that never offered the choice,
// and unchecking a box under CSV would quietly change a TSV file too.
export function outputOptionsFor(
	codec: TableCodec,
	values: Required<OutputOptions>,
): OutputOptions {
	const declared = codec.outputOptions ?? [];
	return Object.fromEntries(
		declared.map((id) => [id, values[id]]),
	) satisfies OutputOptions;
}

export type {
	CodecId,
	MatrixParseResult,
	OutputOptionId,
	OutputOptions,
	ParsedTable,
	ParseIssue,
	ParseResult,
	TableCodec,
} from "./types";
export { defaultOutputOptions } from "./types";
export { csvCodec, htmlCodec, jiraCodec, jsonCodec, markdownCodec, tsvCodec };
