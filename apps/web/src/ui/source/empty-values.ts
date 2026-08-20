import { syntaxTree } from "@codemirror/language";
import type { Range } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	EditorView,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { copy } from "@/copy/copy";
import { isJiraHeaderLine } from "@/formats/jira";
import type { HighlightLanguage } from "@/views/types";

// An empty field is invisible in every delimited syntax: `a,,b`, `| a |  | b |`,
// and `|x||z|` all hold a value the user cannot see. CodeMirror has no concept
// of a field, so this is the one marker the editor draws itself.
//
// It is a decoration and nothing else. Drawing over a cell's padding changes
// what that run looks like and never what it is, so the text, the caret, the
// selection, the clipboard, downloads, drafts, history, and persistence are
// byte-identical with the placeholder on and off. This is emphatically not a
// parser: it never produces cells, it never decides what a document contains,
// and where a line's structure is ambiguous it draws nothing rather than
// guessing. See docs/design-system.md, "Syntax and table structure".

// Which syntax a source view's empty fields follow, derived from registry data
// rather than from a view's identity: see docs/adr/0005.
export type EmptyValueSyntax =
	| { readonly kind: "delimited"; readonly separator: string }
	| { readonly kind: "markdown" }
	| { readonly kind: "jira" };

export function emptyValueSyntax(
	language: HighlightLanguage,
	fieldSeparator: string | undefined,
): EmptyValueSyntax | null {
	switch (language) {
		// CSV and TSV share one highlighting language and differ only by the
		// separator their codec declares. Without one there is no structure to
		// read, so there is nothing to mark.
		case "delimited":
			return fieldSeparator === undefined
				? null
				: { kind: "delimited", separator: fieldSeparator };
		case "markdown":
			return { kind: "markdown" };
		case "jira":
			return { kind: "jira" };
		// JSON and Records spell an empty string out, and HTML has an explicit
		// element pair around every cell. None of them hides an empty value.
		default:
			return null;
	}
}

// The placeholder reads as text: it takes the width of its own word, sits where
// the cell's value would have started, and pushes what follows along exactly as
// a typed value would. What it is not is content. It occupies no document
// position, the caret steps over it rather than into it, and it cannot be
// selected, copied, or typed through.
class EmptyValueWidget extends WidgetType {
	toDOM() {
		const marker = document.createElement("span");
		marker.className = "cm-tabeloEmptyValue";
		// Drawn for the eye only. The accessible text of a source view is its
		// source text, and a word the user did not type must never join it. The
		// word itself is generated content in the editor theme, so it is not a
		// text node at all: it cannot be read out, cannot reach a DOM text
		// extraction, and cannot survive a copy that falls back to the DOM.
		marker.setAttribute("aria-hidden", "true");
		return marker;
	}

	// Every placeholder is the same drawing, so CodeMirror may reuse the DOM
	// rather than rebuilding it as the viewport moves.
	eq() {
		return true;
	}
}

const emptyValueDecoration = Decoration.widget({
	widget: new EmptyValueWidget(),
	side: 1,
});

// Delimited fields, with the quoting rule the delimited codec parses back.
// Quote state carries across lines because RFC 4180 lets a quoted value hold a
// line break, which formats/delimited.ts supports.
interface DelimitedLineScan {
	// Offsets within the line where an empty field sits.
	readonly offsets: readonly number[];
	readonly endsInQuotes: boolean;
}

export function scanDelimitedLine(
	line: string,
	separator: string,
	startsInQuotes: boolean,
): DelimitedLineScan {
	// A line with no separator has no field structure to read. A lone empty
	// line is a legitimate empty row rather than an empty field, and marking it
	// would put a glyph on every blank line in the document.
	if (!startsInQuotes && !line.includes(separator)) {
		return { offsets: [], endsInQuotes: false };
	}

	const offsets: number[] = [];
	let index = 0;
	let fieldStart = 0;
	let quoted = startsInQuotes;
	let inQuotes = startsInQuotes;

	while (index < line.length) {
		if (inQuotes) {
			if (line[index] === '"') {
				// A doubled quote is an escaped quote, not the end of the value.
				if (line[index + 1] === '"') {
					index += 2;
					continue;
				}
				inQuotes = false;
			}
			index += 1;
			continue;
		}

		if (line[index] === '"' && index === fieldStart) {
			inQuotes = true;
			quoted = true;
			index += 1;
			continue;
		}

		if (line.startsWith(separator, index)) {
			// A quoted empty value is written `""`, which the user can already
			// see. Only a field with nothing at all in it is invisible.
			if (!quoted && index === fieldStart) offsets.push(index);
			index += separator.length;
			fieldStart = index;
			quoted = false;
			continue;
		}

		index += 1;
	}

	// The value after the last separator, when the line does not continue into
	// a quoted value on the next one.
	if (!inQuotes && !quoted && fieldStart === line.length && fieldStart > 0) {
		offsets.push(fieldStart);
	}

	return { offsets, endsInQuotes: inQuotes };
}

// Jira splits a row on unescaped pipes, and a header line's doubled pipes are
// one delimiter rather than two: the same rule formats/jira.ts parses by. Only
// the fields between two delimiters are marked, so a malformed row missing its
// outer pipes is left alone instead of being guessed at.
export function jiraEmptyOffsets(line: string): readonly number[] {
	const header = isJiraHeaderLine(line);
	const offsets: number[] = [];
	let index = 0;
	let previousDelimiterEnd: number | null = null;
	let fieldStart = 0;

	while (index < line.length) {
		// `\|` and `\\` are escapes, so the character after a backslash is
		// content whatever it is.
		if (line[index] === "\\" && index + 1 < line.length) {
			index += 2;
			continue;
		}
		if (line[index] !== "|") {
			index += 1;
			continue;
		}

		const doubled = header && line[index + 1] === "|";
		if (previousDelimiterEnd !== null && fieldStart === index) {
			offsets.push(index);
		}
		index += doubled ? 2 : 1;
		previousDelimiterEnd = index;
		fieldStart = index;
	}

	return offsets;
}

// Markdown's cells, per line, as the ranges between one delimiter and the next.
// The GFM grammar parses the table itself, so these boundaries come from the
// same parse that highlights it; the alignment divider is the one row the
// grammar hands over whole, and its own delimiters are read off its text.
interface MarkdownRow {
	readonly divider: boolean;
	readonly cells: readonly { readonly from: number; readonly to: number }[];
}

function markdownRows(
	view: EditorView,
	from: number,
	to: number,
): readonly MarkdownRow[] {
	const byLine = new Map<number, { divider: boolean; edges: number[][] }>();

	syntaxTree(view.state).iterate({
		from,
		to,
		enter: (node) => {
			if (node.name !== "TableDelimiter") return;
			const line = view.state.doc.lineAt(node.from);
			const entry = byLine.get(line.number) ?? { divider: false, edges: [] };
			// One node covering more than a single pipe is the divider row, handed
			// over whole. Its own pipes are the only structure it has.
			if (node.to - node.from > 1) {
				entry.divider = true;
				const text = view.state.doc.sliceString(node.from, node.to);
				for (let index = 0; index < text.length; index += 1) {
					if (text[index] === "|") {
						entry.edges.push([node.from + index, node.from + index + 1]);
					}
				}
			} else {
				entry.edges.push([node.from, node.to]);
			}
			byLine.set(line.number, entry);
		},
	});

	const rows: MarkdownRow[] = [];
	for (const { divider, edges } of byLine.values()) {
		const cells: { from: number; to: number }[] = [];
		for (let index = 0; index + 1 < edges.length; index += 1) {
			const openingEnd = edges[index]?.[1];
			const closingStart = edges[index + 1]?.[0];
			if (openingEnd === undefined || closingStart === undefined) continue;
			cells.push({ from: openingEnd, to: closingStart });
		}
		if (cells.length > 0) rows.push({ divider, cells });
	}
	return rows;
}

// Markdown pads its columns from the values the table holds, and the
// placeholder is not one of them: a row carrying it would otherwise be wider
// than the rows around it and the column would come apart exactly where the
// reader is looking. So the column is widened for every row instead, in the
// editor and never in the file. The spacer holds width and nothing else, except
// on the divider row, where the column is drawn with the dashes it is made of.
class ColumnSpacerWidget extends WidgetType {
	constructor(
		readonly columns: number,
		readonly divider: boolean,
	) {
		super();
	}

	toDOM() {
		const spacer = document.createElement("span");
		spacer.setAttribute("aria-hidden", "true");
		if (this.divider) {
			// Dashes are characters, so they measure themselves: an ordinary
			// inline span of them is exactly as wide as it needs to be, and sits
			// on the line's own baseline like the rule it continues.
			spacer.className = "cm-tabeloDividerSpacer";
			spacer.textContent = "-".repeat(this.columns);
			return spacer;
		}
		spacer.className = "cm-tabeloColumnSpacer";
		spacer.style.width = `${this.columns}ch`;
		return spacer;
	}

	eq(other: ColumnSpacerWidget) {
		return other.columns === this.columns && other.divider === this.divider;
	}
}

function markdownDecorations(
	view: EditorView,
	from: number,
	to: number,
): readonly Range<Decoration>[] {
	const rows = markdownRows(view, from, to);
	if (rows.length === 0) return [];

	const isEmpty = (cell: { from: number; to: number }) =>
		view.state.doc.sliceString(cell.from, cell.to).trim() === "";
	// What a cell ends up looking like: its own characters, plus the
	// placeholder's word where one is drawn on top of them.
	const drawnWidth = (
		row: MarkdownRow,
		cell: { from: number; to: number },
	): number =>
		cell.to -
		cell.from +
		(!row.divider && isEmpty(cell) ? copy.source.emptyValue.length : 0);

	// What each column has to be worth: the widest thing drawn in it.
	const widths: number[] = [];
	for (const row of rows) {
		for (const [index, cell] of row.cells.entries()) {
			widths[index] = Math.max(widths[index] ?? 0, drawnWidth(row, cell));
		}
	}

	const ranges: Range<Decoration>[] = [];
	for (const row of rows) {
		for (const [index, cell] of row.cells.entries()) {
			if (!row.divider && isEmpty(cell)) {
				// Markdown writes a cell as `| value |`, so the space after the
				// delimiter belongs to the column. Starting after it puts the
				// placeholder exactly where the value it stands for would have
				// started.
				const opensWithSpace =
					view.state.doc.sliceString(cell.from, cell.from + 1) === " ";
				ranges.push(
					emptyValueDecoration.range(
						opensWithSpace ? cell.from + 1 : cell.from,
					),
				);
			}
			const missing = (widths[index] ?? 0) - drawnWidth(row, cell);
			if (missing > 0) {
				// At the end of the cell, which is where Markdown's own padding
				// sits. The divider's added dashes go one character earlier, inside
				// the space that row keeps before its closing delimiter, so the
				// rule they continue stays unbroken.
				const closesWithSpace =
					view.state.doc.sliceString(cell.to - 1, cell.to) === " ";
				const at =
					row.divider && closesWithSpace && cell.to - 1 > cell.from
						? cell.to - 1
						: cell.to;
				ranges.push(
					Decoration.widget({
						widget: new ColumnSpacerWidget(missing, row.divider),
						side: -1,
					}).range(at),
				);
			}
		}
	}
	return ranges;
}

function buildDecorations(
	view: EditorView,
	syntax: EmptyValueSyntax,
): DecorationSet {
	const ranges: Range<Decoration>[] = [];

	for (const { from, to } of view.visibleRanges) {
		if (syntax.kind === "markdown") {
			ranges.push(...markdownDecorations(view, from, to));
			continue;
		}

		const firstLine = view.state.doc.lineAt(from).number;
		const lastLine = view.state.doc.lineAt(to).number;

		if (syntax.kind === "jira") {
			for (let number = firstLine; number <= lastLine; number += 1) {
				const line = view.state.doc.line(number);
				for (const offset of jiraEmptyOffsets(line.text)) {
					ranges.push(emptyValueDecoration.range(line.from + offset));
				}
			}
			continue;
		}

		// A quoted value may have opened on a line above the viewport, so the
		// scan starts at the document rather than at the first visible line. At
		// the roughly 200-row scale this product targets (AGENTS.md) that is a
		// single pass over a few kilobytes of text.
		let inQuotes = false;
		for (let number = 1; number <= lastLine; number += 1) {
			const line = view.state.doc.line(number);
			const scan = scanDelimitedLine(line.text, syntax.separator, inQuotes);
			if (number >= firstLine) {
				for (const offset of scan.offsets) {
					ranges.push(emptyValueDecoration.range(line.from + offset));
				}
			}
			inQuotes = scan.endsInQuotes;
		}
	}

	return Decoration.set(ranges, true);
}

export function emptyValueMarkers(syntax: EmptyValueSyntax) {
	const plugin = ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view, syntax);
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged) {
					this.decorations = buildDecorations(update.view, syntax);
				}
			}
		},
		{ decorations: (instance) => instance.decorations },
	);

	// The placeholder is drawn, not typed, so the caret has no business inside
	// it: cursor motion steps over the whole thing, and a selection dragged
	// across it takes the field as one piece rather than landing between two
	// characters of a word nobody wrote.
	return [
		plugin,
		EditorView.atomicRanges.of(
			(view) => view.plugin(plugin)?.decorations ?? Decoration.none,
		),
	];
}
