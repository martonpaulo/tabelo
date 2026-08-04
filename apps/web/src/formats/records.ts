import type { TableDocument } from "@/core/types";
import { toDocumentParseResult } from "./parse";
import type {
	MatrixParseResult,
	OutputOptions,
	PreconditionFailure,
	TableCodec,
} from "./types";
import { defaultOutputOptions } from "./types";

// Records renders each row as a title line, `<first column header>: <first
// column value>`, followed by one hyphen bullet per remaining column, with a
// blank line between records. See the issue body for the worked example.
//
// Reversibility per docs/adr/0002 needs exactly three escapes, each scoped to
// the one grammar collision that motivates it:
//  - a header containing `: ` would make the header/value split ambiguous, so
//    headers escape it
//  - any newline would be read as a new line in a line-oriented grammar, so
//    both headers and values escape it
//  - a value beginning `- ` would be read as a bullet marker if it ever
//    started a line, so values escape only that leading pair
// A value containing `: ` needs no escape: the split always takes the first
// separator, so `- Price: Sale: €20` reads back as `Price` / `Sale: €20`.

function escapeHeader(value: string): string {
	let out = "";
	for (let index = 0; index < value.length; index += 1) {
		const char = value[index];
		if (char === "\\") {
			out += "\\\\";
			continue;
		}
		if (char === "\r") {
			if (value[index + 1] === "\n") continue;
			out += "\\n";
			continue;
		}
		if (char === "\n") {
			out += "\\n";
			continue;
		}
		if (char === ":" && value[index + 1] === " ") {
			out += "\\: ";
			index += 1;
			continue;
		}
		out += char;
	}
	return out;
}

function unescapeHeader(value: string): string {
	let out = "";
	for (let index = 0; index < value.length; index += 1) {
		if (value.startsWith("\\: ", index)) {
			out += ": ";
			index += 2;
			continue;
		}
		if (value.startsWith("\\n", index)) {
			out += "\n";
			index += 1;
			continue;
		}
		if (value.startsWith("\\\\", index)) {
			out += "\\";
			index += 1;
			continue;
		}
		out += value[index];
	}
	return out;
}

function escapeValue(value: string): string {
	let out = "";
	for (let index = 0; index < value.length; index += 1) {
		const char = value[index];
		if (char === "\\") {
			out += "\\\\";
			continue;
		}
		if (char === "\r") {
			if (value[index + 1] === "\n") continue;
			out += "\\n";
			continue;
		}
		if (char === "\n") {
			out += "\\n";
			continue;
		}
		out += char;
	}
	return out.startsWith("- ") ? `\\${out}` : out;
}

function unescapeValue(value: string): string {
	const source = value.startsWith("\\- ") ? value.slice(1) : value;
	let out = "";
	for (let index = 0; index < source.length; index += 1) {
		if (source.startsWith("\\n", index)) {
			out += "\n";
			index += 1;
			continue;
		}
		if (source.startsWith("\\\\", index)) {
			out += "\\";
			index += 1;
			continue;
		}
		out += source[index];
	}
	return out;
}

interface HeaderValue {
	readonly header: string;
	readonly value: string;
}

// Splits `<header>: <value>` on the first unescaped colon-space, honouring
// the header's own escape sequences so an escaped `\: ` is never mistaken for
// the boundary. A trailing bare colon means an empty value (rule 4: `- Status:`
// parses to `""`, never a skipped bullet). Returns null when no boundary
// exists at all, which is a malformed line.
function splitHeaderValue(line: string): HeaderValue | null {
	for (let index = 0; index < line.length; index += 1) {
		const char = line[index];
		if (char === "\\" && index + 1 < line.length) {
			index += 1;
			continue;
		}
		if (char === ":" && line[index + 1] === " ") {
			return {
				header: unescapeHeader(line.slice(0, index)),
				value: unescapeValue(line.slice(index + 2)),
			};
		}
		if (char === ":" && index === line.length - 1) {
			return { header: unescapeHeader(line.slice(0, index)), value: "" };
		}
	}
	return null;
}

interface RecordBlock {
	readonly lines: readonly string[];
	// 0-based line index of the block's first line, for locating parse issues.
	readonly start: number;
}

function splitBlocks(text: string): readonly RecordBlock[] {
	const lines = text.split(/\r?\n/);
	const blocks: RecordBlock[] = [];
	let current: string[] = [];
	let start = 0;

	lines.forEach((line, index) => {
		if (line.trim() === "") {
			if (current.length > 0) blocks.push({ lines: current, start });
			current = [];
			return;
		}
		if (current.length === 0) start = index;
		current.push(line);
	});
	if (current.length > 0) blocks.push({ lines: current, start });

	return blocks;
}

function parseRecordsMatrix(text: string): MatrixParseResult {
	if (text.trim() === "") {
		return { ok: false, issues: [{ code: "empty-source" }] };
	}

	const blocks = splitBlocks(text);
	if (blocks.length === 0) {
		return { ok: false, issues: [{ code: "empty-source" }] };
	}

	const [firstBlock, ...restBlocks] = blocks;
	const firstTitle = splitHeaderValue(firstBlock.lines[0]);
	if (!firstTitle) {
		return {
			ok: false,
			issues: [{ code: "records-title-required", line: firstBlock.start + 1 }],
		};
	}

	const bulletHeaders: string[] = [];
	const firstBullets: HeaderValue[] = [];
	for (let index = 1; index < firstBlock.lines.length; index += 1) {
		const line = firstBlock.lines[index];
		const bullet = line.startsWith("- ")
			? splitHeaderValue(line.slice(2))
			: null;
		if (!bullet) {
			return {
				ok: false,
				issues: [
					{
						code: "records-bullet-required",
						line: firstBlock.start + index + 1,
					},
				],
			};
		}
		firstBullets.push(bullet);
		bulletHeaders.push(bullet.header);
	}

	const headers = [firstTitle.header, ...bulletHeaders];
	const matrix: string[][] = [
		headers,
		[firstTitle.value, ...firstBullets.map((bullet) => bullet.value)],
	];

	for (const block of restBlocks) {
		const title = splitHeaderValue(block.lines[0]);
		if (!title) {
			return {
				ok: false,
				issues: [{ code: "records-title-required", line: block.start + 1 }],
			};
		}
		// Editing one record's title prefix must not silently rename the column:
		// the source becomes invalid instead, per the confirmed decision.
		if (title.header !== headers[0]) {
			return {
				ok: false,
				issues: [{ code: "records-title-mismatch", line: block.start + 1 }],
			};
		}

		const row = new Array<string>(headers.length).fill("");
		row[0] = title.value;

		for (let index = 1; index < block.lines.length; index += 1) {
			const line = block.lines[index];
			const bullet = line.startsWith("- ")
				? splitHeaderValue(line.slice(2))
				: null;
			if (!bullet) {
				return {
					ok: false,
					issues: [
						{ code: "records-bullet-required", line: block.start + index + 1 },
					],
				};
			}
			const columnIndex = headers.indexOf(bullet.header);
			if (columnIndex === -1) {
				return {
					ok: false,
					issues: [
						{ code: "records-unknown-column", line: block.start + index + 1 },
					],
				};
			}
			row[columnIndex] = bullet.value;
		}

		matrix.push(row);
	}

	return { ok: true, table: { matrix } };
}

function serializeRecords(
	document: TableDocument,
	options: OutputOptions = {},
): string {
	const includeFirstColumnName =
		options.includeFirstColumnName ??
		defaultOutputOptions.includeFirstColumnName;
	const includeEmptyValues =
		options.includeEmptyValues ?? defaultOutputOptions.includeEmptyValues;

	const [firstColumn, ...restColumns] = document.columns;
	if (!firstColumn) return "";

	const records = document.rows.map((row) => {
		const titleValue = escapeValue(row.cells[firstColumn.id] ?? "");
		const title = includeFirstColumnName
			? `${escapeHeader(firstColumn.header)}: ${titleValue}`
			: titleValue;

		// Rule 8: the first column is never repeated as a bullet.
		const bullets = restColumns.flatMap((column) => {
			const value = row.cells[column.id] ?? "";
			if (!includeEmptyValues && value === "") return [];
			const suffix = value === "" ? "" : ` ${escapeValue(value)}`;
			return [`- ${escapeHeader(column.header)}:${suffix}`];
		});

		return [title, ...bullets].join("\n");
	});

	return records.join("\n\n");
}

// The first column's value titles every record, so it must exist, and it must
// be unique or two records would share one title. The header names that
// value in the title line, so it must exist too. See the issue's
// "Preconditions" section; no fallback name is ever generated.
function recordsPrecondition(
	document: TableDocument,
): PreconditionFailure | null {
	const firstColumn = document.columns[0];
	if (!firstColumn) return null;

	if (firstColumn.header.trim() === "") {
		return { code: "records-empty-first-header", columns: [0] };
	}

	const emptyRows = document.rows.flatMap((row, index) =>
		(row.cells[firstColumn.id] ?? "") === "" ? [index] : [],
	);
	if (emptyRows.length > 0) {
		return { code: "records-empty-first-column", rows: emptyRows };
	}

	const positions = new Map<string, number[]>();
	document.rows.forEach((row, index) => {
		const value = row.cells[firstColumn.id] ?? "";
		positions.set(value, [...(positions.get(value) ?? []), index]);
	});
	const duplicateRows = [...positions.values()]
		.filter((indices) => indices.length > 1)
		.flat()
		.toSorted((left, right) => left - right);
	if (duplicateRows.length > 0) {
		return { code: "records-duplicate-first-column", rows: duplicateRows };
	}

	return null;
}

// Sniffing must lose to Markdown whenever a paste could be read either way,
// per the confirmed decision: a strict `canSniff` (a title line immediately
// followed by a hyphen bullet) plus a sniffPriority that sorts after
// Markdown's 20 achieve that together. formats/records.test.ts asserts the
// ordering rather than the literal constant.
function canSniffRecords(text: string): boolean {
	const lines = text.split(/\r?\n/);
	for (let index = 0; index < lines.length - 1; index += 1) {
		const line = lines[index];
		if (line.trim() === "" || line.startsWith("- ")) continue;
		if (!line.includes(":")) continue;
		const next = lines[index + 1];
		if (next.startsWith("- ") && next.includes(":")) return true;
	}
	return false;
}

export const recordsCodec: TableCodec = {
	id: "records",
	extension: "records.txt",
	mimeType: "text/plain",
	parseMatrix: parseRecordsMatrix,
	parse: (text) => toDocumentParseResult(parseRecordsMatrix(text)),
	serialize: serializeRecords,
	precondition: recordsPrecondition,
	outputOptions: ["includeFirstColumnName", "includeEmptyValues"],
	sniffPriority: 25,
	canSniff: canSniffRecords,
};

export {
	escapeHeader as escapeRecordsHeader,
	escapeValue as escapeRecordsValue,
	unescapeHeader as unescapeRecordsHeader,
	unescapeValue as unescapeRecordsValue,
};
