import stringWidth from "string-width";
import { EMPTY_VALUE_PLACEHOLDER } from "@/core/empty-value";
import type { Alignment } from "@/core/types";
import { pipeCellSpans } from "./parse";

// The pieces of Markdown's table grammar that more than one reader needs: the
// parser and serializer in markdown.ts, and the divider assistance in
// markdown-assistance.ts (#297). Keeping them here is what stops the assistance
// from growing a second, slightly different idea of what a divider is or how
// wide a cell looks.

// Splits one table line into raw cells, honouring escaped pipes.
export function splitRow(line: string): string[] {
	return pipeCellSpans(line).map(({ from, to }) => line.slice(from, to).trim());
}

const DELIMITER_CELL = /^:?-+:?$/;

export function isDelimiterCell(cell: string): boolean {
	return DELIMITER_CELL.test(cell);
}

export function isDelimiterRow(cells: readonly string[]): boolean {
	return cells.length > 0 && cells.every(isDelimiterCell);
}

export function alignmentOf(cell: string): Alignment {
	const left = cell.startsWith(":");
	const right = cell.endsWith(":");
	if (left && right) return "center";
	if (right) return "right";
	if (left) return "left";
	return "default";
}

// The fewest dashes a divider cell is written with, and so the narrowest column
// the serializer pads to.
export const MIN_DIVIDER_WIDTH = 3;

export function alignmentMarker(align: Alignment, width: number): string {
	const dashes = "-".repeat(Math.max(MIN_DIVIDER_WIDTH, width));
	switch (align) {
		case "left":
			return `:${dashes.slice(1)}`;
		case "right":
			return `${dashes.slice(1)}:`;
		case "center":
			return `:${dashes.slice(2)}:`;
		default:
			return dashes;
	}
}

// `.length` is the display width only inside printable ASCII. #186 chose
// `string-width` so CJK and emoji align in a monospaced editor, and measuring
// anything outside this range by length would reintroduce that defect while
// looking correct in a Latin fixture.
const ASCII_PRINTABLE = /^[\x20-\x7e]*$/;

export function displayWidth(text: string): number {
	return ASCII_PRINTABLE.test(text) ? text.length : stringWidth(text);
}

// How much of its column one escaped cell claims. An empty cell claims room for
// the empty-value placeholder a source view draws there, which is what keeps
// the column aligned around that word: see core/empty-value.ts.
export function reservedWidth(text: string, width: number): number {
	return text === "" ? EMPTY_VALUE_PLACEHOLDER.length : width;
}
