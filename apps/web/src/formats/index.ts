import type { TableDocument } from "@/core/types";
import { csvCodec } from "./csv";
import { htmlCodec } from "./html";
import { jiraCodec } from "./jira";
import { jsonCodec } from "./json";
import { markdownCodec } from "./markdown";
import { tsvCodec } from "./tsv";
import type {
	CodecId,
	OutputOptions,
	PreconditionFailure,
	TableCodec,
} from "./types";

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

const preconditionCache = new WeakMap<
	TableDocument,
	WeakMap<TableCodec, PreconditionFailure | null>
>();

// Document identity is stable between edits, so render-time consumers share a
// precondition result without making codecs or the UI own another cache.
export function canSerialize(
	codec: TableCodec,
	document: TableDocument,
): PreconditionFailure | null {
	let codecResults = preconditionCache.get(document);
	if (!codecResults) {
		codecResults = new WeakMap();
		preconditionCache.set(document, codecResults);
	}
	if (codecResults.has(codec)) return codecResults.get(codec) ?? null;

	const failure = codec.precondition?.(document) ?? null;
	codecResults.set(codec, failure);
	return failure;
}

// A registered codec is downloadable only when it can represent this document.
export function listDownloadableCodecs(
	document: TableDocument,
): readonly TableCodec[] {
	return filterSerializableCodecs(listCodecs(), document);
}

export function filterSerializableCodecs(
	codecs: readonly TableCodec[],
	document: TableDocument,
): readonly TableCodec[] {
	return codecs.filter((codec) => canSerialize(codec, document) === null);
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
	PreconditionFailure,
	TableCodec,
} from "./types";
export { defaultOutputOptions } from "./types";
export { csvCodec, htmlCodec, jiraCodec, jsonCodec, markdownCodec, tsvCodec };
