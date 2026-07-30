import { documentToMatrix } from "@/core/document";
import type { TableDocument } from "@/core/types";
import { toDocumentParseResult } from "./parse";
import type {
	MatrixParseResult,
	ParseIssue,
	PreconditionFailure,
	TableCodec,
} from "./types";

function syntaxErrorLine(error: unknown, text: string): number | undefined {
	if (!(error instanceof SyntaxError)) return undefined;
	const position = /position\s+(\d+)/i.exec(error.message)?.[1];
	if (!position) return undefined;
	return text.slice(0, Number(position)).split(/\r?\n/).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonMatrix(text: string): MatrixParseResult {
	if (!text.trim()) {
		return { ok: false, issues: [{ code: "empty-source" }] };
	}

	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch (error) {
		return {
			ok: false,
			issues: [{ code: "json-invalid", line: syntaxErrorLine(error, text) }],
		};
	}

	if (!Array.isArray(value) || value.length === 0) {
		return { ok: false, issues: [{ code: "json-rows-required" }] };
	}
	if (!value.every(isRecord)) {
		return { ok: false, issues: [{ code: "json-row-object-required" }] };
	}

	const records: Record<string, unknown>[] = value;

	// Columns are every key in first-appearance order across every record, not
	// the first record's keys alone. A record that omits a column still keeps
	// it, and a record that introduces one does not have its values dropped.
	const headers: string[] = [];
	const known = new Set<string>();
	for (const record of records) {
		for (const key of Object.keys(record)) {
			if (known.has(key)) continue;
			known.add(key);
			headers.push(key);
		}
	}

	if (headers.length === 0) {
		return { ok: false, issues: [{ code: "json-header-required" }] };
	}
	if (
		records.some((record) =>
			Object.values(record).some((cell) => typeof cell !== "string"),
		)
	) {
		return { ok: false, issues: [{ code: "json-string-cells-required" }] };
	}

	const warnings: ParseIssue[] = [];
	const matrix: string[][] = [headers];
	records.forEach((record, index) => {
		const present = Object.keys(record).length;
		if (present !== headers.length) {
			warnings.push({
				code: "row-column-count",
				row: index + 1,
				actual: present,
				expected: headers.length,
			});
		}
		matrix.push(
			headers.map((header) => {
				const cell = record[header];
				return typeof cell === "string" ? cell : "";
			}),
		);
	});

	return {
		ok: true,
		table: { matrix },
		warnings: warnings.length > 0 ? warnings : undefined,
	};
}

// JSON is the one format whose output is keyed rather than positional, so the
// headers leave the document as object keys instead of as a first row. The
// precondition below is what guarantees they can be.
function serializeJson(document: TableDocument): string {
	const [headers = [], ...rows] = documentToMatrix(document);
	if (rows.length === 0) return "[]";

	const records = rows.map((row) => {
		const record: Record<string, string> = {};
		headers.forEach((header, index) => {
			record[header] = row[index] ?? "";
		});
		return `  ${JSON.stringify(record)}`;
	});
	return `[\n${records.join(",\n")}\n]`;
}

// A property key that is a canonical array index is listed ahead of every other
// key, in ascending numeric order, whatever order it was written in. So a
// header of "2024" would come back from JSON.parse in a different column
// position than it left, silently reordering the table. Refusing it is the same
// refusal as an empty or a duplicate header: the document is perfectly valid,
// this one format just cannot key on it.
// https://tc39.es/ecma262/#sec-ordinaryownpropertykeys
function isArrayIndexKey(header: string): boolean {
	const index = Number(header);
	return (
		Number.isInteger(index) &&
		index >= 0 &&
		index < 2 ** 32 - 1 &&
		String(index) === header
	);
}

function jsonPrecondition(document: TableDocument): PreconditionFailure | null {
	const headers = documentToMatrix(document)[0] ?? [];

	// Emptiness is judged after trimming, because a header that renders as
	// nothing is no more usable as a key than "" is. Everything else is judged
	// on the raw header, because the raw header is exactly what gets written
	// out: "Name" and "Name " are two distinct keys and round-trip as two
	// columns.
	const empty = headers.flatMap((header, index) =>
		header.trim() ? [] : [index],
	);
	if (empty.length > 0) return { code: "json-empty-header", columns: empty };

	const positions = new Map<string, number[]>();
	headers.forEach((header, index) => {
		positions.set(header, [...(positions.get(header) ?? []), index]);
	});
	// Every position of a repeated header, not only the later ones, because the
	// user has to see the pair to know which of the two to rename.
	const duplicate = [...positions.values()]
		.filter((indices) => indices.length > 1)
		.flat()
		.toSorted((left, right) => left - right);
	if (duplicate.length > 0) {
		return { code: "json-duplicate-header", columns: duplicate };
	}

	const numeric = headers.flatMap((header, index) =>
		isArrayIndexKey(header) ? [index] : [],
	);
	if (numeric.length > 0) {
		return { code: "json-numeric-header", columns: numeric };
	}

	return null;
}

export const jsonCodec: TableCodec = {
	id: "json",
	extension: "json",
	mimeType: "application/json",
	parseMatrix: parseJsonMatrix,
	parse: (text) => toDocumentParseResult(parseJsonMatrix(text)),
	serialize: serializeJson,
	precondition: jsonPrecondition,
	sniffPriority: 5,
	canSniff: (text) => text.trimStart().startsWith("["),
};
