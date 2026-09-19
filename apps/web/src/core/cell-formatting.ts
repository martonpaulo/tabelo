import { cellText, readCell } from "./cell-value";
import {
	inlineImages,
	inlineLength,
	inlineLinks,
	isTextContent,
	type MarkState,
	markState,
	normalizeInline,
	replaceRange,
	setLink,
	setMark,
	sliceInline,
} from "./inline-content";
import { type CellRect, rectContains, rectCoversHeader } from "./selection";
import type {
	CellValue,
	InlineMark,
	TableDocument,
	TextContent,
} from "./types";

// Formatting as a document command (#306): a mark applied to the grid
// selection, and a link or an image applied to a range of one cell's text. The
// Visual Table's menu, its shortcuts, and its rich cell editor all come here,
// so what a command means is decided once, next to the range operations it is
// built from. See docs/adr/0011.

// What a mark command would do to the selection. `no-text` means the selection
// holds no text to format at all: only numbers, booleans, or `null`, which
// formatting never converts (docs/adr/0008), or only empty cells.
export type SelectionMarkState = MarkState | "no-text";

// Why a selection holds nothing to format, so the refusal can say which step
// comes first: changing a typed value to text, or typing some.
export type NoTextReason = "typed" | "empty";

interface FormatTarget {
	// The data row, or -1 for the header row.
	readonly row: number;
	readonly column: number;
	readonly value: CellValue;
}

// Every selected header and data cell once, in document order, however many
// selected areas cover it: overlapping rectangles never format a cell twice.
function selectedCells(
	document: TableDocument,
	rects: readonly CellRect[],
): FormatTarget[] {
	const targets: FormatTarget[] = [];
	document.columns.forEach((column, columnIndex) => {
		const header = rects.some(
			(rect) =>
				rectCoversHeader(rect) &&
				columnIndex >= rect.left &&
				columnIndex <= rect.right,
		);
		if (header) {
			targets.push({ row: -1, column: columnIndex, value: column.header });
		}
	});
	document.rows.forEach((row, rowIndex) => {
		document.columns.forEach((column, columnIndex) => {
			if (rects.some((rect) => rectContains(rect, rowIndex, columnIndex))) {
				targets.push({
					row: rowIndex,
					column: columnIndex,
					value: readCell(row, column.id),
				});
			}
		});
	});
	return targets;
}

// The textual, non-empty cells a mark can reach, with each one's own state.
function markable(targets: readonly FormatTarget[], mark: InlineMark) {
	return targets.flatMap((target) => {
		if (!isTextContent(target.value)) return [];
		const length = inlineLength(target.value);
		if (length === 0) return [];
		return [
			{
				target,
				value: target.value,
				state: markState(target.value, 0, length, mark),
			},
		];
	});
}

export function selectionMarkState(
	document: TableDocument,
	rects: readonly CellRect[],
	mark: InlineMark,
): SelectionMarkState {
	const cells = markable(selectedCells(document, rects), mark);
	if (cells.length === 0) return "no-text";
	const states = new Set(
		cells.map((cell) => cell.state).filter((state) => state !== "unavailable"),
	);
	if (states.size === 0) return "unavailable";
	if (states.has("mixed") || (states.has("on") && states.has("off"))) {
		return "mixed";
	}
	return states.has("on") ? "on" : "off";
}

export function noTextReason(
	document: TableDocument,
	rects: readonly CellRect[],
): NoTextReason {
	return selectedCells(document, rects).some(
		(target) => !isTextContent(target.value),
	)
		? "typed"
		: "empty";
}

function writeTargets(
	document: TableDocument,
	changes: ReadonlyMap<string, TextContent>,
): TableDocument {
	if (changes.size === 0) return document;
	const columns = document.columns.map((column, columnIndex) => {
		const next = changes.get(`-1:${columnIndex}`);
		return next === undefined ? column : { ...column, header: next };
	});
	const rows = document.rows.map((row, rowIndex) => {
		let cells: Record<string, CellValue> | null = null;
		document.columns.forEach((column, columnIndex) => {
			const next = changes.get(`${rowIndex}:${columnIndex}`);
			if (next === undefined) return;
			cells ??= { ...row.cells };
			cells[column.id] = next;
		});
		return cells ? { ...row, cells } : row;
	});
	return { columns, rows };
}

// The mark command over the grid selection: the complete text of each selected
// textual header and data cell, once. It removes the mark when every cell it
// can reach already has it, and adds it everywhere otherwise, so one command
// is one document change and one history step. Numbers, booleans, and `null`
// are left exactly as they are.
export function toggleMarkInCells(
	document: TableDocument,
	rects: readonly CellRect[],
	mark: InlineMark,
): TableDocument {
	const state = selectionMarkState(document, rects, mark);
	if (state === "no-text" || state === "unavailable") return document;
	const enabled = state !== "on";
	const changes = new Map<string, TextContent>();
	for (const cell of markable(selectedCells(document, rects), mark)) {
		const next = setMark(
			cell.value,
			0,
			inlineLength(cell.value),
			mark,
			enabled,
		);
		if (next !== cell.value) {
			changes.set(`${cell.target.row}:${cell.target.column}`, next);
		}
	}
	return writeTargets(document, changes);
}

// What the link dialog starts from for a range of one cell's text: the text it
// reads as, the address of the link it touches, and whether an image makes a
// link impossible there.
export interface LinkDraft {
	readonly text: string;
	readonly url: string;
	readonly linked: boolean;
	readonly holdsImage: boolean;
}

export function linkDraft(
	value: TextContent,
	start: number,
	end: number,
): LinkDraft {
	const [from, to] = linkRange(value, start, end);
	const link = inlineLinks(value).find((each) =>
		from === to
			? each.start <= from && from <= each.end
			: each.start < to && from < each.end,
	);
	const slice = sliceInline(value, from, to);
	return {
		text: cellText(slice),
		url: link?.url ?? "",
		linked: link !== undefined,
		holdsImage: inlineImages(slice).length > 0,
	};
}

// The range a link command acts on: a caret inside a link means that link.
export function linkRange(
	value: TextContent,
	start: number,
	end: number,
): readonly [number, number] {
	const from = Math.min(start, end);
	const to = Math.max(start, end);
	if (from !== to) return [from, to];
	const link = inlineLinks(value).find(
		(each) => each.start <= from && from <= each.end,
	);
	return link ? [link.start, link.end] : [from, to];
}

// Links a range to an address with the label the user gave it. The label keeps
// the formatting of the text it replaces when it is unchanged, and takes the
// formatting of the first replaced text otherwise, as typing over it would.
// Null when the label is empty, the address is empty, or the range holds an
// image, which a link cannot contain.
export function applyLink(
	value: TextContent,
	start: number,
	end: number,
	text: string,
	url: string,
): TextContent | null {
	if (text === "" || url === "") return null;
	const [from, to] = linkRange(value, start, end);
	const current = cellText(sliceInline(value, from, to));
	const relabeled =
		current === text ? value : replaceRange(value, from, to, text);
	return setLink(relabeled, from, from + text.length, url);
}

// Puts an image in place of a range. Null when the address or the alternative
// text is missing: an image always carries both (#306).
export function insertImage(
	value: TextContent,
	start: number,
	end: number,
	url: string,
	alt: string,
): TextContent | null {
	if (url === "" || alt.trim() === "") return null;
	return replaceRange(
		value,
		start,
		end,
		normalizeInline([{ kind: "image", url, alt }]),
	);
}
