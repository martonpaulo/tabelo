import type { Alignment } from "@/core/types";
import {
	alignmentMarker,
	alignmentOf,
	displayWidth,
	isDelimiterCell,
	isDelimiterRow,
	MIN_DIVIDER_WIDTH,
	reservedWidth,
	splitRow,
} from "./markdown-grammar";
import { minimalChange } from "./minimal-change";
import { firstLineBlock, lineSpans, pipeCellSpans } from "./parse";
import { markdownRowStartAssistance } from "./row-start-assistance";
import type {
	AssistanceEdit,
	SourceEdit,
	SourceRowRange,
	StructuralAssistance,
} from "./types";

// Markdown's divider assistance (#297): keeping the alignment
// divider in step with the table above and below it while the user edits the
// source. The contract is in AGENTS.md, "Source text is free; structural
// assistance is narrow": everything here is read from the draft before and
// after one user edit, only the divider line is ever rewritten, and anything
// the draft does not settle leaves the text exactly as the user typed it.

interface TableBlock {
	readonly lines: readonly string[];
	readonly spans: readonly SourceRowRange[];
	// Line indices of the first block of non-blank lines, `end` exclusive, the
	// same block the parser reads its table from.
	readonly start: number;
	readonly end: number;
}

// The divider is the block's second line, so a block needs two lines to have
// one at all.
function tableBlock(text: string): TableBlock | null {
	const lines = text.split(/\r?\n/);
	const found = firstLineBlock(lines);
	if (!found || found.end - found.start < 2) return null;
	return { lines, spans: lineSpans(text), start: found.start, end: found.end };
}

function lineAt(block: TableBlock, index: number): string {
	return block.lines[index] ?? "";
}

function spanAt(block: TableBlock, index: number): SourceRowRange {
	const span = block.spans[index];
	if (!span) throw new Error("Markdown line span is missing.");
	return span;
}

// How many cells two header rows share at the front and at the back, without
// counting a cell twice. Where they differ is where a column was inserted or
// removed.
function sharedEnds(
	before: readonly string[],
	after: readonly string[],
): { readonly prefix: number; readonly suffix: number } {
	const shorter = Math.min(before.length, after.length);
	let prefix = 0;
	while (prefix < shorter && before[prefix] === after[prefix]) prefix += 1;
	let suffix = 0;
	while (
		suffix < shorter - prefix &&
		before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
	) {
		suffix += 1;
	}
	return { prefix, suffix };
}

// The alignment of each column after a header edit added or removed columns.
// A new column starts unmarked; a removed one takes its marker with it.
function reshapeAlignments(
	alignments: readonly Alignment[],
	headerBefore: readonly string[],
	headerAfter: readonly string[],
): Alignment[] {
	const { prefix, suffix } = sharedEnds(headerBefore, headerAfter);
	const next = [...alignments];
	const added = headerAfter.length - alignments.length;
	if (added > 0) {
		const at = Math.min(
			Math.max(prefix, headerAfter.length - suffix - added),
			next.length,
		);
		next.splice(at, 0, ...Array<Alignment>(added).fill("default"));
	} else {
		const removed = -added;
		next.splice(Math.min(prefix, next.length - removed), removed);
	}
	return next;
}

// The widest cell of every column, measured the way the serializer measures
// it, so a table the serializer wrote is already what this would produce.
function columnWidths(block: TableBlock, columns: number): number[] {
	const widths = Array<number>(columns).fill(MIN_DIVIDER_WIDTH);
	const measure = (line: string) => {
		const cells = splitRow(line);
		for (let index = 0; index < columns; index += 1) {
			const cell = cells[index];
			if (cell === undefined) break;
			const width = reservedWidth(cell, displayWidth(cell));
			if (width > (widths[index] ?? 0)) widths[index] = width;
		}
	};
	measure(lineAt(block, block.start));
	for (let index = block.start + 2; index < block.end; index += 1) {
		measure(lineAt(block, index));
	}
	return widths;
}

// The divider line with each cell's marker replaced in place, so the spacing
// and pipes the user wrote around the markers survive. Only possible when the
// line already has one cell per column; otherwise it is written the way the
// serializer writes it, behind whatever indentation the line had.
function rewriteDivider(line: string, markers: readonly string[]): string {
	const spans = pipeCellSpans(line);
	if (spans.length !== markers.length) {
		const indent = line.slice(0, line.length - line.trimStart().length);
		return `${indent}| ${markers.join(" | ")} |`;
	}
	let out = "";
	let cursor = 0;
	spans.forEach((span, index) => {
		const marker = markers[index] ?? "";
		const cell = line.slice(span.from, span.to);
		const trimmed = cell.trim();
		if (trimmed === "") {
			out += `${line.slice(cursor, span.from)} ${marker} `;
		} else {
			const from = span.from + (cell.length - cell.trimStart().length);
			out += `${line.slice(cursor, from)}${marker}`;
			cursor = from + trimmed.length;
			return;
		}
		cursor = span.to;
	});
	return out + line.slice(cursor);
}

export const markdownDividerAssistance: StructuralAssistance = (
	before,
	after,
	changed,
) => {
	const table = tableBlock(after);
	if (!table) return null;

	// Only an edit to the table itself is a trigger. Typing anywhere else leaves
	// even an inconsistent divider alone, so re-enabling the feature, or editing
	// text below the table, never rewrites a line the user was not near.
	const blockFrom = spanAt(table, table.start).from;
	const blockTo = spanAt(table, table.end - 1).to;
	if (!changed.some(({ from, to }) => from <= blockTo && to >= blockFrom)) {
		return null;
	}

	const header = splitRow(lineAt(table, table.start));
	const columns = header.length;
	if (columns === 0) return null;

	const dividerIndex = table.start + 1;
	const dividerSpan = spanAt(table, dividerIndex);
	const dividerLine = lineAt(table, dividerIndex);
	const divider = splitRow(dividerLine);

	// A second line reading as a divider right under the first leaves it unclear
	// which one the table means.
	const third = table.lines[table.start + 2];
	if (
		table.start + 2 < table.end &&
		third !== undefined &&
		isDelimiterRow(splitRow(third))
	) {
		return null;
	}

	// The draft before the edit, when it had a well-formed divider of its own.
	// It is consulted only to recover what the triggering edit just disturbed.
	const previous = tableBlock(before);
	const previousDivider = previous
		? splitRow(lineAt(previous, previous.start + 1))
		: [];
	const previousHeader = previous
		? splitRow(lineAt(previous, previous.start))
		: [];
	const previousValid =
		previous !== null &&
		isDelimiterRow(previousDivider) &&
		previousDivider.length === previousHeader.length;
	// Whether the edit changed the divider line and nothing else, which is what
	// makes a malformed divider still recognisably the one that was there.
	const previousSpan = previous
		? spanAt(previous, previous.start + 1)
		: undefined;
	const dividerOnly =
		previousValid &&
		previousSpan !== undefined &&
		before.slice(0, previousSpan.from) === after.slice(0, dividerSpan.from) &&
		before.slice(previousSpan.to) === after.slice(dividerSpan.to);

	// A malformed cell is still a marker the user is editing while it keeps a
	// dash, such as `:-x--`. One with none left is text that replaced the
	// marker, and replacing the divider with text is the user's call: the
	// invalid draft stays exactly as typed.
	const stillMarkers =
		divider.length > 0 &&
		divider.every((cell) => isDelimiterCell(cell) || cell.includes("-"));

	let alignments: Alignment[];
	if (isDelimiterRow(divider)) {
		alignments = divider.map(alignmentOf);
	} else if (!stillMarkers) {
		return null;
	} else if (dividerOnly && divider.length === previousDivider.length) {
		// A marker the edit made malformed keeps the column's previous one.
		alignments = divider.map((cell, index) =>
			alignmentOf(
				isDelimiterCell(cell) ? cell : (previousDivider[index] ?? ""),
			),
		);
	} else if (dividerOnly) {
		alignments = previousDivider.map(alignmentOf);
	} else {
		return null;
	}

	if (alignments.length !== columns) {
		if (dividerOnly) {
			// The edit took cells out of, or put extra ones into, the divider
			// alone. The header still owns the column count, so the previous
			// markers come back.
			alignments = previousDivider.map(alignmentOf);
		} else if (
			previousValid &&
			previousHeader.length !== columns &&
			alignments.length === previousHeader.length
		) {
			// The header gained or lost columns in this edit.
			alignments = reshapeAlignments(alignments, previousHeader, header);
		} else {
			// The mismatch was already there before this edit, and nothing in the
			// draft says which column it is about.
			return null;
		}
	}

	const widths = columnWidths(table, columns);
	const markers = alignments.map((align, index) =>
		alignmentMarker(align, widths[index] ?? MIN_DIVIDER_WIDTH),
	);
	if (
		divider.length === columns &&
		divider.every((cell, index) => cell === markers[index])
	) {
		return null;
	}

	const change = minimalChange(
		dividerLine,
		rewriteDivider(dividerLine, markers),
	);
	if (!change) return null;
	return [shifted(change, dividerSpan.from)];
};

function shifted(edit: SourceEdit, by: number): SourceEdit {
	return { from: edit.from + by, to: edit.to + by, insert: edit.insert };
}

// The whitespace edits that pad one cell the way the serializer writes it: one
// space after its opening pipe, then the content, then enough spaces to fill
// the column, then one before its closing pipe. Only the blank runs between
// the content and the pipes are ever rewritten, and each run only where it
// differs, at its end, so a caret inside it stays put. A side with no pipe has
// nothing to line up against and is left as it is.
function cellPadding(
	line: string,
	cell: SourceRowRange,
	width: number,
): SourceEdit[] {
	const text = line.slice(cell.from, cell.to);
	const content = text.trim();
	const opened = line[cell.from - 1] === "|";
	const closed = line[cell.to] === "|";
	const edits: SourceEdit[] = [];
	const pad = (from: number, current: string, next: string) => {
		const change = minimalChange(current, next);
		if (change) edits.push(shifted(change, from));
	};
	if (content === "") {
		// An empty cell holds the room the serializer reserves for it.
		if (opened && closed) pad(cell.from, text, " ".repeat(width + 2));
		return edits;
	}
	const lead = text.length - text.trimStart().length;
	const trail = text.length - text.trimEnd().length;
	if (opened) pad(cell.from, text.slice(0, lead), " ");
	if (closed) {
		const fill = Math.max(0, width - displayWidth(content));
		pad(cell.to - trail, text.slice(text.length - trail), " ".repeat(fill + 1));
	}
	return edits;
}

// Column padding assistance (#401): the column being typed in keeps every row
// padded to its widest cell, in the text itself, so the source stays aligned
// the way the serializer writes it. A named structural-assistance feature
// under "Source text is free; structural assistance is narrow" in AGENTS.md:
//
// - Syntax: a cell of the header or of a body row of a table block whose
//   alignment divider is valid and has one cell per header cell, which is a
//   draft that parses.
// - Trigger: one edit that stays inside one cell of such a line, adding or
//   removing no line and no delimiter.
// - Change: the padding of that column's cell in every row, measured the way
//   the serializer measures it (`columnWidths`), wide characters by display
//   width and escapes as written. Content, escapes, alignment markers, and
//   every other column are untouched, and the divider follows through the
//   divider assistance (#297). A row too short to have the column is skipped.
//
// Anything else, including several carets, a pasted block, a new pipe, or a
// draft that does not parse, stays exactly as typed.
export const markdownColumnPaddingAssistance: StructuralAssistance = (
	before,
	after,
	changed,
) => {
	const [edit, ...others] = changed;
	if (!edit || others.length > 0) return null;
	const table = tableBlock(after);
	if (!table) return null;
	const header = splitRow(lineAt(table, table.start));
	const divider = splitRow(lineAt(table, table.start + 1));
	if (!isDelimiterRow(divider) || divider.length !== header.length) {
		return null;
	}

	// The edit stays on one line, which is the same line before and after it.
	const beforeLines = before.split(/\r?\n/);
	if (beforeLines.length !== table.lines.length) return null;
	const lineIndex = table.spans.findIndex(
		({ from, to }) => from <= edit.from && edit.to <= to,
	);
	if (
		lineIndex < table.start ||
		lineIndex >= table.end ||
		lineIndex === table.start + 1
	) {
		return null;
	}
	const cells = pipeCellSpans(lineAt(table, lineIndex));
	if (cells.length !== pipeCellSpans(beforeLines[lineIndex] ?? "").length) {
		return null;
	}
	const lineFrom = spanAt(table, lineIndex).from;
	const column = cells.findIndex(
		({ from, to }) => lineFrom + from <= edit.from && edit.to <= lineFrom + to,
	);
	if (column === -1 || column >= header.length) return null;

	const width = columnWidths(table, header.length)[column] ?? MIN_DIVIDER_WIDTH;
	const edits: SourceEdit[] = [];
	for (let index = table.start; index < table.end; index += 1) {
		if (index === table.start + 1) continue;
		const line = lineAt(table, index);
		const cell = pipeCellSpans(line)[column];
		if (!cell) continue;
		const from = spanAt(table, index).from;
		for (const change of cellPadding(line, cell, width)) {
			edits.push(shifted(change, from));
		}
	}
	return edits.length > 0 ? edits : null;
};

// Markdown's structural assistance: a new row's opening delimiter on Enter
// (#391), otherwise the column's padding (#401) together with the divider
// (#297). The row-start feature acts only on a line break at the end of a row
// below the divider, an edit that never calls for padding or a divider
// change, so it never competes with the other two. Those two can act on the
// same edit, and never on the same line: padding skips the divider, which is
// the only line the divider feature rewrites.
export const markdownAssistance: StructuralAssistance = (
	before,
	after,
	changed,
) => {
	const opened = markdownRowStartAssistance(before, after, changed);
	if (opened) return opened;
	const edits: AssistanceEdit[] = [
		...(markdownColumnPaddingAssistance(before, after, changed) ?? []),
		...(markdownDividerAssistance(before, after, changed) ?? []),
	].sort((a, b) => a.from - b.from);
	return edits.length > 0 ? edits : null;
};
