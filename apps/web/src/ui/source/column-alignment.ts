import {
	type EditorState,
	type Extension,
	type Range,
	StateField,
} from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	EditorView,
	WidgetType,
} from "@codemirror/view";
import { EMPTY_VALUE_PLACEHOLDER } from "@/core/empty-value";
import { displayWidth } from "@/formats/markdown-grammar";
import type { SourceTableRow } from "@/formats/types";
import {
	type EscapeSyntax,
	encodesLineBreak,
	glyphColumns,
	scanEscapes,
} from "./escape-sequences";
import { sourceRowsField } from "./source-rows";

// Column alignment for a source view whose format does not pad its own text
// (#396): CSV, TSV, and Jira. Every column starts at the same horizontal
// position on every row, the way Markdown's padding lines its columns up, but
// only on screen. The padding is a widget drawn between a field and the
// delimiter after it, never a character: the text, the draft, a copy, a
// download, the history, and persistence are byte-identical with it on or off.
//
// Where a column starts is the rows' own answer, from the codec's parse
// (`SourceTableRow.cells`), so a delimiter inside a quoted or escaped value is
// never a column boundary. A draft that does not parse maps no rows, and then
// nothing is padded: the text shows exactly as typed rather than aligned to
// rows it no longer has.
//
// Widths are counted in characters of the editor's monospaced font, as they
// are drawn: a wide character takes two, the empty-value placeholder takes the
// room of its word while that marker is on, and a line-break sequence drawn as
// its one-character glyph takes one. A CSV field holding a line break is
// aligned where it starts; the lines it continues onto are not padded, and
// nothing after it on those lines is either.

// Wrapping turns alignment off. Measured on 2026-09-19 with the roster at two
// 530 px panes and wrapping on: padding is a box that cannot break, so a pad
// wider than what is left of the visual line moves to a line of its own, and
// lines that fitted unaligned started to wrap. CSV went from 8 visual lines to
// 12 over 7 rows and Jira from 9 to 12 over 6, two of the new lines holding
// nothing but padding and one delimiter, while every continuation line stayed
// unaligned anyway. With the columns out of line past the first visual line
// whatever is drawn, wrapped text reads better as typed.
export function showsAlignment(align: boolean, wrap: boolean): boolean {
	return align && !wrap;
}

export interface AlignmentOptions {
	// Whether the empty-value placeholder is drawn, which is what gives an empty
	// field the width of its word.
	readonly emptyValues: boolean;
	// Whether a line-break sequence is drawn as its one-character glyph.
	readonly lineBreaks: boolean;
	// The format's escape grammar, for the formats that have one.
	readonly escapes: EscapeSyntax | null;
}

// One run of padding: `columns` characters wide, drawn at offset `at`. A pad at
// a line's start is drawn before the line's first delimiter, so a caret at the
// start of the line stands against the text; every other pad is drawn after
// the field that ends at `at`, so a caret at the end of a field stands against
// its last character and typing there grows the field before the padding.
export interface AlignmentPad {
	readonly at: number;
	readonly columns: number;
	readonly lineStart: boolean;
}

// How wide the text between two offsets is drawn.
export type DrawnWidth = (from: number, to: number) => number;

interface RowLayout {
	// Where each padded run goes, one per column start on the row's first line:
	// the line's start for the first column, then the end of each field.
	readonly anchors: readonly number[];
	// The drawn width of the delimiter before each column start.
	readonly delimiters: readonly number[];
	// The drawn width of each field that ends on the row's first line.
	readonly fields: readonly number[];
}

// A row's column starts on its first line. A field that continues onto the
// next line is the last column start on the row: nothing after it shares the
// first line. After the last field, a trailing delimiter, such as Jira's
// closing pipe, counts as one more column start, so the closing delimiters
// line up too.
function rowLayout(
	text: string,
	row: SourceTableRow,
	width: DrawnWidth,
): RowLayout | null {
	const firstCell = row.cells[0];
	if (!firstCell) return null;
	const lineStart = text.lastIndexOf("\n", firstCell.from - 1) + 1;
	const found = text.indexOf("\n", lineStart);
	const lineEnd = found === -1 ? text.length : found;

	// A delimiter is never empty-value room: nothing between two offsets is
	// nothing wide.
	const delimiterWidth = (from: number, to: number) =>
		from < to ? width(from, to) : 0;
	const anchors: number[] = [];
	const delimiters: number[] = [];
	const fields: number[] = [];
	let previousEnd = lineStart;
	for (const cell of row.cells) {
		if (cell.from > lineEnd || cell.from < previousEnd) break;
		anchors.push(previousEnd);
		delimiters.push(delimiterWidth(previousEnd, cell.from));
		if (cell.to > lineEnd) return { anchors, delimiters, fields };
		fields.push(width(cell.from, cell.to));
		previousEnd = cell.to;
	}
	if (fields.length === row.cells.length && previousEnd < lineEnd) {
		anchors.push(previousEnd);
		delimiters.push(delimiterWidth(previousEnd, lineEnd));
	}
	return { anchors, delimiters, fields };
}

// The padding every row needs so that column `j` starts at the same drawn
// position on every row that has it. Column `j` starts at the widest natural
// start of any row once every earlier column is aligned: the column before it,
// that row's field in it, and the delimiter after. Pure over the text, so the
// arithmetic is pinned by unit tests without a browser.
export function alignmentPadding(
	text: string,
	rows: readonly SourceTableRow[],
	width: DrawnWidth,
): AlignmentPad[] {
	const layouts = rows
		.map((row) => rowLayout(text, row, width))
		.filter((layout): layout is RowLayout => layout !== null);

	// The aligned start of every column, left to right.
	const starts: number[] = [];
	for (let column = 0; ; column += 1) {
		let start = -1;
		for (const layout of layouts) {
			const delimiter = layout.delimiters[column];
			if (delimiter === undefined) continue;
			const natural =
				column === 0
					? delimiter
					: (starts[column - 1] ?? 0) +
						(layout.fields[column - 1] ?? 0) +
						delimiter;
			if (natural > start) start = natural;
		}
		if (start < 0) break;
		starts.push(start);
	}

	const pads: AlignmentPad[] = [];
	for (const layout of layouts) {
		layout.anchors.forEach((at, column) => {
			const delimiter = layout.delimiters[column] ?? 0;
			const natural =
				column === 0
					? delimiter
					: (starts[column - 1] ?? 0) +
						(layout.fields[column - 1] ?? 0) +
						delimiter;
			const columns = (starts[column] ?? natural) - natural;
			if (columns > 0) {
				pads.push({ at, columns, lineStart: column === 0 });
			}
		});
	}
	return pads;
}

const PRINTABLE_OR_TAB = /^[\t\x20-\x7e]*$/;

function tabsIn(run: string): number {
	let count = 0;
	for (
		let index = run.indexOf("\t");
		index !== -1;
		index = run.indexOf("\t", index + 1)
	) {
		count += 1;
	}
	return count;
}

// How wide a field is drawn, under the markers the options switch on. An empty
// field is as wide as the placeholder drawn in it.
export function drawnWidth(
	text: string,
	options: AlignmentOptions,
): DrawnWidth {
	return (from, to) => {
		if (from >= to)
			return options.emptyValues ? EMPTY_VALUE_PLACEHOLDER.length : 0;
		const run = text.slice(from, to);
		// A tab takes the room up to the next tab stop, which depends on where it
		// is drawn rather than on the run. Every row draws the tab ending a field
		// at the same aligned position, so counting it as nothing still lines the
		// columns up; skipping the grapheme scan for it also keeps a TSV pane's
		// delimiters, one per field, on the fast path.
		let width = PRINTABLE_OR_TAB.test(run)
			? run.length - tabsIn(run)
			: displayWidth(run);
		if (options.escapes && options.lineBreaks) {
			for (const { match } of scanEscapes(run, options.escapes)) {
				if (encodesLineBreak(match)) {
					width -= displayWidth(match.source) - glyphColumns(match);
				}
			}
		}
		return width;
	};
}

class AlignmentPadWidget extends WidgetType {
	constructor(readonly columns: number) {
		super();
	}

	toDOM() {
		const padding = document.createElement("span");
		padding.className = "cm-tabeloAlignPadding";
		padding.setAttribute("aria-hidden", "true");
		padding.style.width = `${this.columns}ch`;
		return padding;
	}

	eq(other: AlignmentPadWidget) {
		return other.columns === this.columns;
	}

	// A click on the padding puts the caret at the end of the field it follows,
	// rather than mapping to no position at all.
	ignoreEvent() {
		return false;
	}
}

function buildDecorations(
	state: EditorState,
	options: AlignmentOptions,
): DecorationSet {
	const rows = state.field(sourceRowsField, false);
	if (!rows) return Decoration.none;
	const text = state.doc.toString();
	const ranges: Range<Decoration>[] = alignmentPadding(
		text,
		rows,
		drawnWidth(text, options),
	).map(({ at, columns, lineStart }) =>
		Decoration.widget({
			widget: new AlignmentPadWidget(columns),
			// Before the first delimiter at a line's start. After a field, and
			// after an empty-value placeholder standing at the same offset.
			side: lineStart ? -1 : 2,
		}).range(at),
	);
	return Decoration.set(ranges, true);
}

// The padding, as a decoration over the whole text: the widths depend on every
// row, and the rows are the table's own, at most a few hundred of them.
// Requires `sourceRowsField` in the same state.
export function columnAlignment(options: AlignmentOptions): Extension {
	return StateField.define<DecorationSet>({
		create: (state) => buildDecorations(state, options),
		update(decorations, transaction) {
			const before = transaction.startState.field(sourceRowsField, false);
			const after = transaction.state.field(sourceRowsField, false);
			if (!transaction.docChanged && before === after) return decorations;
			return buildDecorations(transaction.state, options);
		},
		provide: (field) => EditorView.decorations.from(field),
	});
}
