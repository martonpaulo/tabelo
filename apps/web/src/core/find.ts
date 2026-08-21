import { cellTextAt } from "./cell-value";
import { setCell, setHeader } from "./operations";
import { HEADER_ROW } from "./selection";
import type { TableDocument } from "./types";

// Literal text matching over the canonical table, and the replacement that
// acts on what it found. Framework-free and free of every view: the grid, the
// find bar, and the tests all read the same list.
//
// Two rules shape everything here. A cell value is an opaque string for
// matching purposes: nothing is trimmed, normalized, unescaped, or read as a
// type, so a value holding `|` or a newline matches exactly those characters
// and never the syntax some format would wrap them in. And an offset is always
// an offset into the cell's own text projection, which is what lets the grid
// mark the exact characters that matched.

// One occurrence, addressed the way every grid operation addresses a cell.
//
// Coordinates rather than stable ids: a match list is recomputed from the
// document on every change rather than patched, so it never outlives the
// snapshot it was taken from, and an id would only be resolved back to an
// index at each use. `row` is `HEADER_ROW` for a header cell, which is also
// what sorts the header ahead of the body in document order.
export interface CellMatch {
	readonly row: number;
	readonly column: number;
	// Half-open, in UTF-16 code units of the cell's text projection.
	readonly start: number;
	readonly end: number;
}

// Where a replacement left off, so the next occurrence can be found from there
// rather than from the start of the table.
export interface MatchPosition {
	readonly row: number;
	readonly column: number;
	readonly offset: number;
}

// Every occurrence in document order: the header row first, then each data row,
// left to right within both. Matches never overlap, because the scan resumes at
// the end of the one it just took.
//
// An empty query matches nothing. Every position in every cell would otherwise
// be an occurrence, which is a count nobody can navigate and a "replace all"
// that would rewrite the table.
export function findMatches(
	document: TableDocument,
	query: string,
	caseSensitive: boolean,
): readonly CellMatch[] {
	if (query === "") return [];

	const matches: CellMatch[] = [];
	document.columns.forEach((column, index) => {
		collectMatches(
			matches,
			column.header,
			HEADER_ROW,
			index,
			query,
			caseSensitive,
		);
	});
	document.rows.forEach((row, rowIndex) => {
		document.columns.forEach((column, columnIndex) => {
			collectMatches(
				matches,
				cellTextAt(row, column.id),
				rowIndex,
				columnIndex,
				query,
				caseSensitive,
			);
		});
	});
	return matches;
}

// Applies every given range, writing the replacement text into the cells that
// hold them. One document comes back, so a caller that hands over the whole
// match list gets one change and therefore one history step.
//
// A range that does not fit the value it names is a stale list, and nothing is
// written: a partial rewrite would be worse than none. Through the product this
// cannot happen, because the match list is recomputed from the document it is
// about to be applied to.
export function replaceMatches(
	document: TableDocument,
	matches: readonly CellMatch[],
	replacement: string,
): TableDocument {
	if (matches.length === 0) return document;

	const byCell = new Map<string, CellMatch[]>();
	for (const match of matches) {
		const key = `${match.row}:${match.column}`;
		const existing = byCell.get(key);
		if (existing) existing.push(match);
		else byCell.set(key, [match]);
	}

	let next = document;
	for (const cellMatches of byCell.values()) {
		const first = cellMatches[0];
		if (!first) continue;
		const current = textAt(document, first.row, first.column);
		if (current === null) return document;

		// From the end backwards, so an earlier range keeps addressing the same
		// characters however much the replacement changes the length after it.
		const ordered = [...cellMatches].sort((a, b) => b.start - a.start);
		let value = current;
		for (const match of ordered) {
			if (
				match.start < 0 ||
				match.end > value.length ||
				match.start > match.end
			)
				return document;
			value =
				value.slice(0, match.start) + replacement + value.slice(match.end);
		}

		// An unchanged projection leaves the cell exactly as it was, native type
		// included: replacing a value with itself is not an instruction to turn a
		// number into the string that looks like it. See docs/adr/0008.
		if (value === current) continue;
		next =
			first.row === HEADER_ROW
				? setHeader(next, first.column, value)
				: setCell(next, first.row, first.column, value);
	}
	return next;
}

// Where the scan should resume after one match was replaced: past the text that
// was just written, so a replacement containing the query does not put the next
// Replace back on top of itself.
export function positionAfterReplacement(
	match: CellMatch,
	replacement: string,
): MatchPosition {
	return {
		row: match.row,
		column: match.column,
		offset: match.start + replacement.length,
	};
}

// The index of the first match at or after a position, in document order.
// Nothing left after it wraps to the beginning, exactly as stepping past the
// last match does. An empty list has no index at all and reports `-1`.
export function matchIndexFrom(
	matches: readonly CellMatch[],
	position: MatchPosition,
): number {
	if (matches.length === 0) return -1;
	const found = matches.findIndex(
		(match) =>
			match.row > position.row ||
			(match.row === position.row &&
				(match.column > position.column ||
					(match.column === position.column &&
						match.start >= position.offset))),
	);
	return found === -1 ? 0 : found;
}

function textAt(
	document: TableDocument,
	row: number,
	column: number,
): string | null {
	const target = document.columns[column];
	if (!target) return null;
	if (row === HEADER_ROW) return target.header;
	const dataRow = document.rows[row];
	return dataRow ? cellTextAt(dataRow, target.id) : null;
}

function collectMatches(
	target: CellMatch[],
	text: string,
	row: number,
	column: number,
	query: string,
	caseSensitive: boolean,
): void {
	const last = text.length - query.length;
	for (let at = 0; at <= last; at += 1) {
		if (!matchesAt(text, query, at, caseSensitive)) continue;
		target.push({ row, column, start: at, end: at + query.length });
		at += query.length - 1;
	}
}

// Whether the query sits at exactly this offset.
//
// Case folding compares one code unit against one code unit rather than folding
// the two strings first. Folding is not length-preserving in JavaScript: `İ`
// lowercases to two code units, so an offset taken in the folded text would not
// address the value the cell holds, and the grid would mark the wrong
// characters. The cost of that safety is that such a character matches only
// itself, which is a narrower answer rather than a wrong one.
// https://tc39.es/ecma262/#sec-string.prototype.tolowercase
function matchesAt(
	text: string,
	query: string,
	at: number,
	caseSensitive: boolean,
): boolean {
	if (caseSensitive) return text.startsWith(query, at);
	for (let index = 0; index < query.length; index += 1) {
		const left = text[at + index];
		const right = query[index];
		if (left === right) continue;
		if (left === undefined || right === undefined) return false;
		if (left.toLowerCase() !== right.toLowerCase()) return false;
	}
	return true;
}
