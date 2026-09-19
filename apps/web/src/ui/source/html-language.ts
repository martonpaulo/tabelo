import { StreamLanguage } from "@codemirror/language";
import { html } from "@codemirror/legacy-modes/mode/xml";
import type { EditorState, Range, Text } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	type EditorView,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import { type HtmlCell, htmlSourceCells } from "@/formats/html-source";

// The XML mode from @codemirror/legacy-modes, configured for HTML. It is
// maintained by CodeMirror's author and costs about what the hand-written
// tokenizer it replaced cost, roughly 2 kB gzipped on top of the editor core,
// where @codemirror/lang-html costs nearly 69 kB because it carries whole CSS
// and JavaScript grammars for markup Tabelo never emits. What the replacement
// buys is correctness: it returns `<`, `</`, and `>` as angle brackets and the
// element name on its own, so an opening tag no longer looks like a closing one.
export const htmlLanguage = StreamLanguage.define(html);

// Where each cell's content sits, from the HTML codec's one scan of the
// text's tags (#402), the same scan its position mapping reads rows from, so
// the emphasis, the empty-value placeholder, and the row commands can never
// disagree about where a cell is. The mode's tokens only colour the text.
// Two consumers ask on every caret move, and a document is immutable, so the
// cells of one text are computed once and shared.
const cellsByDoc = new WeakMap<Text, readonly HtmlCell[]>();

export function htmlCells(state: EditorState): readonly HtmlCell[] {
	const known = cellsByDoc.get(state.doc);
	if (known) return known;
	const cells = htmlSourceCells(state.doc.toString());
	cellsByDoc.set(state.doc, cells);
	return cells;
}

// The legacy mode has no notion of a table header, so Tabelo's own emphasis for
// header cells is added here, over the content of every `<th>` the walk found.
export function headerCellRanges(state: EditorState): DecorationSet {
	const ranges: Range<Decoration>[] = [];
	for (const cell of htmlCells(state)) {
		if (!cell.header || cell.contentTo <= cell.contentFrom) continue;
		ranges.push(
			Decoration.mark({ class: "cm-tableHeaderCell" }).range(
				cell.contentFrom,
				cell.contentTo,
			),
		);
	}
	return Decoration.set(ranges, true);
}

export const htmlHeaderCells = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = headerCellRanges(view.state);
		}

		update(update: ViewUpdate) {
			// A header cell's opening tag can sit above the viewport, so the cells
			// come from the whole-tree walk above rather than from what is visible.
			if (update.docChanged || update.viewportChanged) {
				this.decorations = headerCellRanges(update.state);
			}
		}
	},
	{ decorations: (plugin) => plugin.decorations },
);
