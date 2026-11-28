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
import type { EmptySourceField } from "@/formats/types";
import { htmlCells } from "./html-language";

// An empty field is easy to miss in every syntax Tabelo writes: `a,,b`,
// `| a |  | b |`, and `|x||z|` hold a value the user cannot see, `- Price:` ends
// where a value would start, `<td></td>` is a point between two tags, and `""`
// is two quotes. CodeMirror has no concept of a field, so this is the one
// marker the editor draws itself, and it means the same thing in every source
// view (#274).
//
// It is a decoration and nothing else. Drawing over a cell's padding changes
// what that run looks like and never what it is, so the text, the caret, the
// selection, the clipboard, downloads, drafts, history, and persistence are
// byte-identical with the placeholder on and off. This is emphatically not a
// parser: it never produces cells, it never decides what a document contains,
// and where a line's structure is ambiguous it draws nothing rather than
// guessing. See docs/design-system/2-tokens.md, "Syntax and table structure".

// Where a source view's empty fields are, between `from` and `to`, whole
// lines. One reader per view, chosen by capability rather than by a view's
// identity (docs/adr/0005): the codec's own `emptyFields` wherever it declares
// them, so the marker and the parse split a row the same way (#551), and
// otherwise the editor grammar that already parses the text, for the formats
// whose cells only that tree bounds (Markdown, JSON, HTML).
export type EmptyCellReader = (
	state: EditorState,
	from: number,
	to: number,
) => readonly EmptyCell[];

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

// The empty fields a codec reports for the whole text, as cells. The field's
// own text, nothing or the format's spelling of an empty value such as Jira's
// one space, is what the placeholder is drawn instead of, and the caret's one
// stop sits before it. A quoted delimited value may open on a line above the
// range, so the codec reads the whole document rather than the requested
// lines; at the roughly 200-row scale this product targets (AGENTS.md) that is
// a single pass over a few kilobytes of text.
export function codecEmptyCells(
	locate: (text: string) => readonly EmptySourceField[],
): EmptyCellReader {
	return (state, from, to) => {
		const first = state.doc.lineAt(from).from;
		const last = state.doc.lineAt(to).to;
		return locate(state.doc.toString())
			.filter((field) => field.from >= first && field.to <= last)
			.map((field) => ({
				before: field.before,
				cellStart: field.from,
				valueStart: field.from,
				valueEnd: field.to,
				cellEnd: field.to,
				after: field.after,
			}));
	};
}

// Markdown's empty cells, as the padding between one delimiter and the next.
// The GFM grammar parses the table itself, so these boundaries come from the
// same parse that highlights it, and an empty cell produces no `TableCell` node
// at all: what marks it is two delimiters with only padding between them.
export const markdownEmptyCells: EmptyCellReader = (state, from, to) => {
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
};

// JSON's empty strings, read from the JSON grammar the view already parses
// with. Only a `String` value of exactly `""` is marked, never a property name,
// which is a different node, and never `null`, a number, or a boolean: those are
// typed values the document carries, not empty fields (docs/adr/0008). The
// placeholder sits between the two quotes, so the reader still sees that the
// value is a string.
export const jsonEmptyCells: EmptyCellReader = (state, from, to) => {
	const cells: EmptyCell[] = [];
	syntaxTree(state).iterate({
		from,
		to,
		enter: (node) => {
			if (node.name !== "String" || node.to - node.from !== 2) return;
			if (state.doc.sliceString(node.from, node.to) !== '""') return;
			cells.push(pointCell(node.from + 1, 1, node.to));
		},
	});
	return cells;
};

// HTML's empty cells, `<td></td>` and `<th></th>`, from the one walk that owns
// where an HTML cell is. A self-closed `<td/>` has no content position and is
// skipped by that walk. The caret leaves one character at a time, onto the
// tag bracket on either side, because stepping over a whole `</td><td>` would
// be a jump in text that is otherwise edited as markup.
export const htmlEmptyCells: EmptyCellReader = (state, from, to) => {
	const cells: EmptyCell[] = [];
	for (const cell of htmlCells(state)) {
		if (cell.contentTo !== cell.contentFrom) continue;
		const at = cell.contentFrom;
		if (at < from || at > to) continue;
		cells.push(pointCell(at, 1, at + 1));
	}
	return cells;
};

function buildDecorations(
	view: EditorView,
	read: EmptyCellReader,
): DecorationSet {
	const ranges: Range<Decoration>[] = [];
	for (const { from, to } of view.visibleRanges) {
		for (const cell of read(view.state, from, to)) {
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

export function emptyValueMarkers(read: EmptyCellReader) {
	const plugin = ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view, read);
			}

			update(update: ViewUpdate) {
				// Markdown, JSON, and HTML find their fields in the syntax tree,
				// which CodeMirror finishes parsing in the background after the
				// editor opens. A tree that grows with no edit must still redraw,
				// or a field the first, partial parse missed stays unmarked: under
				// load that is the whole visible table (#600).
				if (
					update.docChanged ||
					update.viewportChanged ||
					syntaxTree(update.startState) !== syntaxTree(update.state)
				) {
					this.decorations = buildDecorations(update.view, read);
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
		EditorState.transactionFilter.of((tr) => snapCaret(tr, read)),
	];
}

// Applies the one-stop rule to a lone caret that lands in an empty field. Only a
// selection change does this: an edit places its own caret, and a range the user
// is extending keeps both of its ends where they were put. The caret is pinned
// to the side before the placeholder, which is where typing inserts the value.
function snapCaret(
	tr: Transaction,
	read: EmptyCellReader,
): Transaction | readonly TransactionSpec[] {
	const selection = tr.selection;
	if (!selection || tr.docChanged || selection.ranges.length !== 1) return tr;
	const next = selection.main;
	const state = tr.startState;

	// A double or triple click on a placeholder selects the padding it stands
	// over, which draws a selection around a word nobody typed. A pointer
	// selection that stays inside one empty field is a click on that field, so
	// it becomes the field's one caret stop.
	if (!next.empty) {
		if (!tr.isUserEvent("select.pointer")) return tr;
		const field = read(
			state,
			state.doc.lineAt(next.from).from,
			state.doc.lineAt(next.to).to,
		).find((cell) => next.from >= cell.cellStart && next.to <= cell.cellEnd);
		if (!field) return tr;
		return [
			tr,
			{
				selection: EditorSelection.cursor(field.valueStart, -1),
				sequential: true,
			},
		];
	}

	const line = state.doc.lineAt(next.head);
	const target = snapToEmptyCell(
		read(state, line.from, line.to),
		state.selection.main.head,
		next.head,
	);
	if (target === null || (target === next.head && next.assoc < 0)) return tr;
	return [
		tr,
		{ selection: EditorSelection.cursor(target, -1), sequential: true },
	];
}
