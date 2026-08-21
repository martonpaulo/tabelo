import { readCell } from "@/core/cell-value";
import { columnLetter } from "@/core/column-letter";
import type { CellValue, Column, TableDocument } from "@/core/types";
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

function isJsonScalar(value: unknown): value is CellValue {
	return (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	);
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
			Object.values(record).some((cell) => !isJsonScalar(cell)),
		)
	) {
		return { ok: false, issues: [{ code: "json-scalar-cells-required" }] };
	}

	const warnings: ParseIssue[] = [];
	const matrix: CellValue[][] = [headers];
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
				if (!Object.hasOwn(record, header)) return "";
				const cell = record[header];
				return isJsonScalar(cell) ? cell : "";
			}),
		);
	});

	return {
		ok: true,
		table: { matrix, headerRow: true },
		warnings: warnings.length > 0 ? warnings : undefined,
	};
}

// The key every column is written under. A named column keys on its header
// exactly as typed, because the raw header is what round-trips back: "Name" and
// "Name " are two distinct keys and two distinct columns. A column the user has
// not named keys on its column letter, which is the identity that column
// already has on the index strip and in its accessible name, so JSON borrows it
// rather than inventing anything.
//
// The fallback is format-local and writes nothing to the document: the header
// stays empty, and no other format ever sees a letter. The cost is that the
// round trip stops being symmetric in one direction. A document whose column D
// is unnamed serializes to {"D": ...}, and parsing that back produces a column
// whose header IS the string "D". JSON to document to JSON is still exact;
// document to JSON to document is not, for an unnamed column. That asymmetry is
// the decided price of the view opening at all (#145), not an oversight.
//
// The precondition and the serializer both read these keys, so a collision can
// never slip through one path and not the other.
function resolvedJsonKeys(
	document: TableDocument,
): { readonly column: Column; readonly key: string }[] {
	// Blankness is judged after trimming, because a header that renders as
	// nothing is no more usable as a key than "" is. Nothing else about the
	// header is trimmed: the fallback is chosen by blankness, and a named
	// header is written out untouched.
	return document.columns.map((column, index) => ({
		column,
		key: column.header.trim() ? column.header : columnLetter(index),
	}));
}

// JSON is the one format whose output is keyed rather than positional, so the
// headers leave the document as object keys instead of as a first row. The
// precondition below is what guarantees they can be.
function serializeJson(document: TableDocument): string {
	if (document.rows.length === 0) return "[]";

	const resolved = resolvedJsonKeys(document);
	const records = document.rows.map((row) => {
		const record: Record<string, CellValue> = {};
		for (const { column, key } of resolved) {
			record[key] = readCell(row, column.id);
		}
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
	// Both remaining refusals are judged on the resolved keys, not the raw
	// headers, because the resolved keys are what actually gets written. A
	// column named "D" sitting beside an unnamed fourth column is a duplicate,
	// and must be refused rather than collapsing two columns into one key.
	const keys = resolvedJsonKeys(document).map(({ key }) => key);

	const positions = new Map<string, number[]>();
	keys.forEach((header, index) => {
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

	const numeric = keys.flatMap((header, index) =>
		isArrayIndexKey(header) ? [index] : [],
	);
	if (numeric.length > 0) {
		return { code: "json-numeric-header", columns: numeric };
	}

	return null;
}

export const jsonCodec: TableCodec = {
	id: "json",
	// JSON has native scalar syntax even though accepting it is delivered by
	// the typed JSON issue. Do not apply text-only preservation here.
	reconciliation: {
		cellValues: "typed",
		columnAlignment: "unexpressed",
	},
	extension: "json",
	mimeType: "application/json",
	parseMatrix: parseJsonMatrix,
	parse: (text) => toDocumentParseResult(parseJsonMatrix(text)),
	serialize: serializeJson,
	precondition: jsonPrecondition,
	sniffPriority: 5,
	canSniff: (text) => text.trimStart().startsWith("["),
};
