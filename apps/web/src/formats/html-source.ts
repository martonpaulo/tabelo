import type { SourceRowRange } from "./types";

// Where HTML source spells its table cells and rows, as offsets into the text
// (#402). The HTML codec reads values with the browser's parser, which knows
// nothing about offsets, so this is the one place that says where a cell's
// content sits: the source view's header-cell emphasis and empty-value
// placeholder read the cells, and the codec's position mapping reads the rows.
// It reads tags and nothing else, it never judges or rewrites the text, and
// the codec trusts its rows only where they agree with what the parser read.

// One table cell, `<td>` or `<th>`, by where its content sits: from just after
// the opening tag's `>` to just before the closing tag's `</`. Equal offsets are
// a cell with nothing in it.
export interface HtmlCell {
	readonly header: boolean;
	readonly contentFrom: number;
	readonly contentTo: number;
}

// One `<tr>` from its `<` to the end of its closing tag, or to the end of its
// last tag when the markup leaves the close implied, with the cells it holds.
export interface HtmlRow extends SourceRowRange {
	readonly cells: readonly HtmlCell[];
}

interface Tag {
	// Lowercase, as the parser folds it.
	readonly name: string;
	readonly closing: boolean;
	readonly selfClosing: boolean;
	readonly from: number;
	readonly to: number;
}

function isLetter(char: string): boolean {
	return (char >= "a" && char <= "z") || (char >= "A" && char <= "Z");
}

// Elements whose content the tokenizer reads as text up to their own end tag,
// so a table spelled inside one is not markup: the raw text and escapable raw
// text elements of the HTML parsing algorithm. `noscript` is not among them
// here, because DOMParser parses with scripting disabled, where its content is
// ordinary markup (#414).
// https://html.spec.whatwg.org/multipage/parsing.html#parsing-html-fragments
const RAW_TEXT = new Set([
	"script",
	"style",
	"textarea",
	"title",
	"xmp",
	"iframe",
	"noembed",
	"noframes",
]);

// Where a comment starting at `at` ends, past its closing `>`, or -1 when it
// runs to the end of the text. The tokenizer also ends one at `--!>`, and an
// abrupt `<!-->` or `<!--->` is an empty comment.
function commentEnd(text: string, at: number): number {
	const body = at + 4;
	if (text.startsWith(">", body)) return body + 1;
	if (text.startsWith("->", body)) return body + 2;
	const plain = text.indexOf("-->", body);
	const bang = text.indexOf("--!>", body);
	if (plain === -1 && bang === -1) return -1;
	if (bang === -1 || (plain !== -1 && plain < bang)) return plain + 3;
	return bang + 4;
}

// Where the raw text an element opened at `from` ends: the start of its own
// end tag, matched without case as the tokenizer does, or -1 when the text
// never closes it.
function rawTextEnd(text: string, name: string, from: number): number {
	const pattern = new RegExp(`</${name}(?=[\\s/>])`, "gi");
	pattern.lastIndex = from;
	return pattern.exec(text)?.index ?? -1;
}

// Every tag in reading order that reaches the document the parser builds. A
// comment, a doctype, or a processing instruction is skipped whole, a quoted
// attribute value may hold `>`, and a `<` that starts no tag is text. The
// content of a raw text element is text, `plaintext` makes the rest of the
// text text, and what a `<template>` holds goes to a fragment of its own that
// the parser's table lookup never reaches, so none of them yields a tag
// (#414). A tag or comment left open at the end of the text ends the scan,
// since nothing after it is markup yet.
function tags(text: string): Tag[] {
	const found: Tag[] = [];
	let template = 0;
	let at = text.indexOf("<");
	while (at !== -1 && at < text.length) {
		if (text.startsWith("<!--", at)) {
			const end = commentEnd(text, at);
			if (end === -1) break;
			at = text.indexOf("<", end);
			continue;
		}
		const next = text.charAt(at + 1);
		if (next === "!" || next === "?") {
			const end = text.indexOf(">", at);
			if (end === -1) break;
			at = text.indexOf("<", end + 1);
			continue;
		}
		const closing = next === "/";
		const nameFrom = closing ? at + 2 : at + 1;
		if (!isLetter(text.charAt(nameFrom))) {
			at = text.indexOf("<", at + 1);
			continue;
		}
		let nameTo = nameFrom;
		while (nameTo < text.length && !/[\s/>]/.test(text.charAt(nameTo))) {
			nameTo += 1;
		}
		let end = nameTo;
		let quote = "";
		for (; end < text.length; end += 1) {
			const char = text.charAt(end);
			if (quote) {
				if (char === quote) quote = "";
				continue;
			}
			if (char === '"' || char === "'") quote = char;
			else if (char === ">") break;
		}
		if (end >= text.length) break;
		const name = text.slice(nameFrom, nameTo).toLowerCase();
		if (name === "template") {
			if (!closing) template += 1;
			else if (template > 0) template -= 1;
		} else if (template === 0) {
			found.push({
				name,
				closing,
				selfClosing: !closing && text.charAt(end - 1) === "/",
				from: at,
				to: end + 1,
			});
		}
		if (!closing && name === "plaintext") break;
		if (!closing && RAW_TEXT.has(name)) {
			const close = rawTextEnd(text, name, end + 1);
			if (close === -1) break;
			at = close;
			continue;
		}
		at = text.indexOf("<", end + 1);
	}
	return found;
}

function isCell(name: string): name is "td" | "th" {
	return name === "td" || name === "th";
}

// Reads cells tag by tag: a cell opens at its opening tag's `>` and is found
// when a closing tag of the same name ends it. A self-closed `<td/>` has no
// content position, and a cell another cell's tag interrupts before it closes
// is not found, because where its content ends is the parser's guess, not
// something the text spells.
class CellReader {
	private open: { name: "td" | "th"; contentFrom: number } | null = null;

	// A row's end ends any cell still open in it.
	reset() {
		this.open = null;
	}

	// The cell a closing tag completes, if it completes one.
	read(tag: Tag): HtmlCell | null {
		if (!isCell(tag.name)) return null;
		if (!tag.closing) {
			this.open = tag.selfClosing
				? null
				: { name: tag.name, contentFrom: tag.to };
			return null;
		}
		const open = this.open;
		this.open = null;
		if (open?.name !== tag.name) return null;
		return {
			header: tag.name === "th",
			contentFrom: open.contentFrom,
			contentTo: tag.from,
		};
	}
}

// Every cell the text spells, anywhere in it, in reading order.
export function htmlSourceCells(text: string): HtmlCell[] {
	const reader = new CellReader();
	const cells: HtmlCell[] = [];
	for (const tag of tags(text)) {
		const cell = reader.read(tag);
		if (cell) cells.push(cell);
	}
	return cells;
}

// The tags that end a row the markup leaves open.
const ROW_BOUNDARIES = new Set(["tr", "thead", "tbody", "tfoot", "table"]);

// The rows of the first table, in reading order, or null when the text does
// not spell them plainly enough to bound: a table inside the table, or a cell
// outside any `<tr>`, which the parser would wrap in a row of its own guessing.
export function htmlSourceRows(text: string): HtmlRow[] | null {
	const all = tags(text);
	const start = all.findIndex((tag) => tag.name === "table" && !tag.closing);
	if (start === -1) return null;
	const reader = new CellReader();
	const rows: HtmlRow[] = [];
	let row: { from: number; to: number; cells: HtmlCell[] } | null = null;
	const close = (to: number) => {
		if (row) rows.push({ ...row, to });
		row = null;
		reader.reset();
	};
	for (const tag of all.slice(start + 1)) {
		if (tag.name === "table") {
			if (!tag.closing) return null;
			close(row?.to ?? tag.from);
			return rows;
		}
		if (tag.name === "tr" && tag.closing) {
			close(tag.to);
			continue;
		}
		if (ROW_BOUNDARIES.has(tag.name)) {
			close(row?.to ?? tag.from);
			if (tag.name === "tr") row = { from: tag.from, to: tag.to, cells: [] };
			continue;
		}
		if (!isCell(tag.name)) {
			if (row) row.to = tag.to;
			continue;
		}
		if (!row) return null;
		row.to = tag.to;
		const cell = reader.read(tag);
		if (cell) row.cells.push(cell);
	}
	close(row?.to ?? text.length);
	return rows;
}
