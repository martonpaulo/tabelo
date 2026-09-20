import { cellText, readCell } from "@/core/cell-value";
import { columnLetter } from "@/core/column-letter";
import { isInlineContent } from "@/core/inline-content";
import type { CellValue, Column, TableDocument } from "@/core/types";
import { textlessHeaderRow, toDocumentParseResult } from "./parse";
import type {
	MatrixParseResult,
	ParseIssue,
	PreconditionFailure,
	SourceRowRange,
	SourceTableRow,
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

// JSON's insignificant whitespace between tokens.
// https://www.rfc-editor.org/rfc/rfc8259#section-2
const JSON_SPACE = new Set([" ", "\t", "\n", "\r"]);

function skipJsonSpace(text: string, index: number): number {
	let at = index;
	while (at < text.length && JSON_SPACE.has(text.charAt(at))) at += 1;
	return at;
}

// Just past the string whose opening quote is at `index`.
function jsonStringEnd(text: string, index: number): number {
	for (let at = index + 1; at < text.length; at += 1) {
		const char = text.charAt(at);
		if (char === "\\") {
			at += 1;
			continue;
		}
		if (char === '"') return at + 1;
	}
	return text.length;
}

// Just past the scalar starting at `index`: a string, or a number, `true`,
// `false`, or `null`, none of which holds a delimiter or a space.
function jsonScalarEnd(text: string, index: number): number {
	if (text.charAt(index) === '"') return jsonStringEnd(text, index);
	let at = index;
	while (at < text.length) {
		const char = text.charAt(at);
		if (char === "," || char === "}" || JSON_SPACE.has(char)) break;
		at += 1;
	}
	return at;
}

// Where each record and each of its values sits (#402), read from text that
// JSON.parse has already accepted as an array of flat objects of scalars, so
// this is a position scan over that one shape and not a second grammar: it
// never judges the text, it only finds the tokens the parse read. A record is
// its object from `{` to `}`, wherever the user's formatting put it, and each
// of its lines names it. A value's range is its whole spelling, quotes and
// escapes included. Cells follow the columns, not the text: each is the value
// of the key its column names, the last one when a key repeats, as JSON.parse
// keeps it, up to the first column the record does not spell. The header has
// no text of its own, because its names are the keys inside every record.
function jsonSourceRows(
	text: string,
	headers: readonly string[],
): SourceTableRow[] {
	const rows: SourceTableRow[] = [textlessHeaderRow];
	// Past the array's `[`.
	let at = skipJsonSpace(text, 0) + 1;
	for (;;) {
		at = skipJsonSpace(text, at);
		if (text.charAt(at) === ",") at = skipJsonSpace(text, at + 1);
		if (text.charAt(at) !== "{") break;
		const from = at;
		at += 1;
		const values = new Map<string, SourceRowRange>();
		for (;;) {
			at = skipJsonSpace(text, at);
			if (text.charAt(at) === ",") at = skipJsonSpace(text, at + 1);
			if (at >= text.length || text.charAt(at) === "}") break;
			const keyEnd = jsonStringEnd(text, at);
			const key: unknown = JSON.parse(text.slice(at, keyEnd));
			// Past the `:` and the space on either side of it.
			at = skipJsonSpace(text, skipJsonSpace(text, keyEnd) + 1);
			const valueEnd = jsonScalarEnd(text, at);
			if (typeof key === "string") values.set(key, { from: at, to: valueEnd });
			at = valueEnd;
		}
		const cells: SourceRowRange[] = [];
		for (const header of headers) {
			const cell = values.get(header);
			if (!cell) break;
			cells.push(cell);
		}
		// Past the `}`.
		at += 1;
		rows.push({ from, to: at, cells, lines: "all" });
	}
	return rows;
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
		rows: jsonSourceRows(text, headers),
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
	return document.columns.map((column, index) => {
		const header = cellText(column.header);
		return { column, key: header.trim() ? header : columnLetter(index) };
	});
}

// JSON is the one format whose output is keyed rather than positional, so the
// headers leave the document as object keys instead of as a first row. The
// precondition below is what guarantees they can be.
function serializeJson(document: TableDocument): string {
	if (document.rows.length === 0) return "[]";

	const resolved = resolvedJsonKeys(document);
	const records = document.rows.map((row) => {
		const members = resolved.map(({ column, key }) => {
			// JSON stays a table of JSON scalars: it has no syntax of its own for
			// inline structure, so formatted text leaves as its projection and
			// reconciliation keeps the structure while that text is unchanged.
			const value: CellValue = readCell(row, column.id);
			const scalar = isInlineContent(value) ? cellText(value) : value;
			return `${JSON.stringify(key)}: ${JSON.stringify(scalar)}`;
		});
		// A space after every `:` and `,` that has something to its right, the
		// way JSON is usually written by hand (owner, 2026-09-19). Whitespace
		// between tokens is insignificant to JSON, so the parse is unchanged.
		return `  {${members.join(", ")}}`;
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
		const seen = positions.get(header);
		if (seen) seen.push(index);
		else positions.set(header, [index]);
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
		inlineContent: "unexpressed",
	},
	extension: "json",
	mimeType: "application/json",
	// Each record from its own parse, as a block under no header line (#402).
	mapsSourceRows: true,
	parseMatrix: parseJsonMatrix,
	parse: (text) => toDocumentParseResult(parseJsonMatrix(text)),
	serialize: serializeJson,
	precondition: jsonPrecondition,
	sniffPriority: 5,
	canSniff: (text) => text.trimStart().startsWith("["),
};
