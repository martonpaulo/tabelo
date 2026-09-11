import { syntaxTree } from "@codemirror/language";
import {
	EditorSelection,
	EditorState,
	type Range,
	type Transaction,
	type TransactionSpec,
} from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	EditorView,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from "@codemirror/view";
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

// The placeholder reads as text and sits where the cell's value would have
// started. Markdown's serializer reserves the room for it, so the padding it is
// drawn instead of is already at least as wide as the word: taking exactly that
// width is what keeps every row of the column aligned around it, without a
// single character of the file changing. Where a syntax writes no padding at
// all, as `a,,b` does, it takes the width of the word itself.
//
// What it is not is content. It holds no document position, the caret steps
// over it rather than into it, and it can never be selected, copied, or typed
// through.
class EmptyValueWidget extends WidgetType {
	// How wide the run it replaces is, in characters of the editor's monospaced
	// font. Zero where there is no run to replace.
	constructor(readonly columns: number) {
		super();
	}

	toDOM() {
		const marker = document.createElement("span");
		marker.className = "cm-tabeloEmptyValue";
		// Drawn for the eye only. The accessible text of a source view is its
		// source text, and a word the user did not type must never join it. The
		// word itself is generated content in the editor theme, so it is not a
		// text node at all: it cannot be read out, cannot reach a DOM text
		// extraction, and cannot survive a copy that falls back to the DOM.
		marker.setAttribute("aria-hidden", "true");
		// A minimum rather than a width, so a run too narrow to hold the word,
		// which is what a half-typed line looks like, gives way instead of
		// clipping it.
		if (this.columns > 0) marker.style.minWidth = `${this.columns}ch`;
		return marker;
	}

	// Two placeholders of the same width are the same drawing, so CodeMirror
	// may reuse the DOM rather than rebuilding it as the viewport moves.
	eq(other: EmptyValueWidget) {
		return other.columns === this.columns;
	}

	// A widget ignores pointer events by default, which would leave a click on
	// the placeholder mapping to no document position at all and drop the caret
	// at the start of the pane. Clicking a field is how anyone would begin
	// filling it in, so the editor handles the click and puts the caret in the
	// field the placeholder speaks for.
	ignoreEvent() {
		return false;
	}
}

// A field with no room of its own: a point, so every document offset stays
// exactly where it was. A field with padding: that padding, drawn instead of.
function emptyValueRange(from: number, to: number): Range<Decoration> {
	if (to <= from) {
		return Decoration.widget({
			widget: new EmptyValueWidget(0),
			side: 1,
		}).range(from);
	}
	return Decoration.replace({ widget: new EmptyValueWidget(to - from) }).range(
		from,
		to,
	);
}

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

// One empty field, in document offsets, from the start of its opening
// delimiter (`before`) to the end of its closing one (`after`). Between the two
// delimiters it runs from `cellStart` to `cellEnd`, and the placeholder is drawn
// from `valueStart` to `valueEnd`, where the value it stands for would sit. A
// field with no padding of its own has all four inner offsets equal.
export interface EmptyCell {
	readonly before: number;
	readonly cellStart: number;
	readonly valueStart: number;
	readonly valueEnd: number;
	readonly cellEnd: number;
	readonly after: number;
}

function pointCell(at: number, delimiter: number, after: number): EmptyCell {
	return {
		before: at - delimiter,
		cellStart: at,
		valueStart: at,
		valueEnd: at,
		cellEnd: at,
		after,
	};
}

// Markdown's empty cells, as the padding between one delimiter and the next.
// The GFM grammar parses the table itself, so these boundaries come from the
// same parse that highlights it, and an empty cell produces no `TableCell` node
// at all: what marks it is two delimiters with only padding between them.
function markdownEmptyCells(
	state: EditorState,
	from: number,
	to: number,
): readonly EmptyCell[] {
	const cells: EmptyCell[] = [];
	let previous: { from: number; to: number; line: number } | null = null;

	syntaxTree(state).iterate({
		from,
		to,
		enter: (node) => {
			if (node.name !== "TableDelimiter") return;
			const line = state.doc.lineAt(node.from).number;
			const gap =
				previous === null ? "" : state.doc.sliceString(previous.to, node.from);
			if (previous !== null && previous.line === line && gap.trim() === "") {
				// Markdown writes a cell as `| value |`, so the space on each side
				// of the value belongs to the column. Everything between them is
				// the padding the placeholder is drawn instead of, which starts it
				// exactly where the value it stands for would have started.
				const valueStart = gap.startsWith(" ") ? previous.to + 1 : previous.to;
				const valueEnd =
					gap.length > 1 && gap.endsWith(" ") ? node.from - 1 : node.from;
				cells.push({
					before: previous.from,
					cellStart: previous.to,
					valueStart,
					valueEnd: Math.max(valueStart, valueEnd),
					cellEnd: node.from,
					after: node.to,
				});
			}
			previous = { from: node.from, to: node.to, line };
		},
	});

	return cells;
}

// Every empty field the syntax hides between `from` and `to`, whole lines.
export function emptyCells(
	state: EditorState,
	syntax: EmptyValueSyntax,
	from: number,
	to: number,
): readonly EmptyCell[] {
	if (syntax.kind === "markdown") return markdownEmptyCells(state, from, to);

	const firstLine = state.doc.lineAt(from).number;
	const lastLine = state.doc.lineAt(to).number;
	const cells: EmptyCell[] = [];

	if (syntax.kind === "jira") {
		for (let number = firstLine; number <= lastLine; number += 1) {
			const line = state.doc.line(number);
			// A header line's delimiter is a doubled pipe.
			const delimiter = isJiraHeaderLine(line.text) ? 2 : 1;
			for (const offset of jiraEmptyOffsets(line.text)) {
				const at = line.from + offset;
				cells.push(pointCell(at, delimiter, at + delimiter));
			}
		}
		return cells;
	}

	// A quoted value may have opened on a line above the range, so the scan
	// starts at the document rather than at the first requested line. At the
	// roughly 200-row scale this product targets (AGENTS.md) that is a single
	// pass over a few kilobytes of text.
	const width = syntax.separator.length;
	let inQuotes = false;
	for (let number = 1; number <= lastLine; number += 1) {
		const line = state.doc.line(number);
		const scan = scanDelimitedLine(line.text, syntax.separator, inQuotes);
		if (number >= firstLine) {
			for (const offset of scan.offsets) {
				const at = line.from + offset;
				cells.push(pointCell(at, width, Math.min(at + width, line.to)));
			}
		}
		inQuotes = scan.endsInQuotes;
	}
	return cells;
}

function buildDecorations(
	view: EditorView,
	syntax: EmptyValueSyntax,
): DecorationSet {
	const ranges: Range<Decoration>[] = [];
	for (const { from, to } of view.visibleRanges) {
		for (const cell of emptyCells(view.state, syntax, from, to)) {
			ranges.push(emptyValueRange(cell.valueStart, cell.valueEnd));
		}
	}
	return Decoration.set(ranges, true);
}

// Where a lone caret may stand in an empty field: one place, where the value
// would start. The padding around a placeholder offers the caret a stop on
// each side of the word and one inside each space, four places in a field
// that holds nothing, and a caret drawn past the placeholder was measured
// against the word's box instead of the text line. So a caret arriving
// anywhere in an empty field lands at its value start, and a caret leaving
// that stop steps over the whole field, delimiter included, in the direction
// it moved. Returns null where the caret is not in an empty field.
export function snapToEmptyCell(
	cells: readonly EmptyCell[],
	previous: number,
	next: number,
): number | null {
	const cellAt = (offset: number) =>
		cells.find((cell) => offset >= cell.cellStart && offset <= cell.cellEnd);
	const cell = cellAt(next);
	if (!cell) return null;
	// Arriving, from anywhere: the one stop is the value start.
	if (previous !== cell.valueStart) return cell.valueStart;
	if (next === previous) return cell.valueStart;
	// Leaving the stop: past the delimiter in the direction of travel, and
	// straight into the next field's stop when that one is empty too.
	const beyond = next > previous ? cell.after : cell.before;
	return cellAt(beyond)?.valueStart ?? beyond;
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
		EditorState.transactionFilter.of((tr) => snapCaret(tr, syntax)),
	];
}

// Applies the one-stop rule to a lone caret that lands in an empty field. Only a
// selection change does this: an edit places its own caret, and a range the user
// is extending keeps both of its ends where they were put. The caret is pinned
// to the side before the placeholder, which is where typing inserts the value.
function snapCaret(
	tr: Transaction,
	syntax: EmptyValueSyntax,
): Transaction | readonly TransactionSpec[] {
	const selection = tr.selection;
	if (!selection || tr.docChanged || selection.ranges.length !== 1) return tr;
	const next = selection.main;
	if (!next.empty) return tr;

	const state = tr.startState;
	const line = state.doc.lineAt(next.head);
	const target = snapToEmptyCell(
		emptyCells(state, syntax, line.from, line.to),
		state.selection.main.head,
		next.head,
	);
	if (target === null || (target === next.head && next.assoc < 0)) return tr;
	return [
		tr,
		{ selection: EditorSelection.cursor(target, -1), sequential: true },
	];
}
