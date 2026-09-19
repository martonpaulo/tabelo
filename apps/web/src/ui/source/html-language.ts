import { StreamLanguage, syntaxTree } from "@codemirror/language";
import { html } from "@codemirror/legacy-modes/mode/xml";
import type { EditorState, Range } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	type EditorView,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";

type Tree = ReturnType<typeof syntaxTree>;

// The XML mode from @codemirror/legacy-modes, configured for HTML. It is
// maintained by CodeMirror's author and costs about what the hand-written
// tokenizer it replaced cost, roughly 2 kB gzipped on top of the editor core,
// where @codemirror/lang-html costs nearly 69 kB because it carries whole CSS
// and JavaScript grammars for markup Tabelo never emits. What the replacement
// buys is correctness: it returns `<`, `</`, and `>` as angle brackets and the
// element name on its own, so an opening tag no longer looks like a closing one.
export const htmlLanguage = StreamLanguage.define(html);

// One table cell, `<td>` or `<th>`, by where its content sits: from just after
// the opening tag's `>` to just before the closing tag's `</`. Equal offsets are
// a cell with nothing in it.
export interface HtmlCell {
	readonly header: boolean;
	readonly contentFrom: number;
	readonly contentTo: number;
}

function cellName(name: string): "td" | "th" | null {
	const lower = name.toLowerCase();
	return lower === "td" || lower === "th" ? lower : null;
}

// Two consumers read the same walk: the header-cell emphasis below and the
// empty-value placeholder, which also asks on every caret move. A parse result
// is immutable, so the cells of one tree are computed once and shared.
const cellsByTree = new WeakMap<Tree, readonly HtmlCell[]>();

// The legacy mode has no notion of a table cell, so this is the one place that
// reads where a cell's content is. It only reads spans the mode has already
// tokenized; it never reads or rewrites the source, and it is not a second HTML
// parser: the element boundaries come from the mode's own tokens.
//
// It walks the whole parsed tree rather than the viewport, because a cell's
// opening tag can sit above it. A stream language parses forward from the first
// character, so the cells at the top of the table are covered before anything
// below them is. At Tabelo's documented scale of roughly 200 rows that is one
// cheap pass per parse.
export function htmlCells(state: EditorState): readonly HtmlCell[] {
	const tree = syntaxTree(state);
	const known = cellsByTree.get(tree);
	if (known) return known;

	const cells: HtmlCell[] = [];
	const { doc } = state;
	// The cell whose content is open, or null outside one.
	let open: { name: "td" | "th"; contentFrom: number } | null = null;
	// Set between reading a `<td` or `<th` name and reaching the `>` that ends
	// its tag.
	let opening: "td" | "th" | null = null;
	let previousBracket: { from: number; to: number; text: string } | null = null;

	tree.iterate({
		enter: (node) => {
			if (node.name === "angleBracket") {
				const text = doc.sliceString(node.from, node.to);
				// One token can carry the end of one tag and the start of the next,
				// as `></` does between two adjacent elements.
				if (opening && text.startsWith(">")) {
					open = { name: opening, contentFrom: node.from + 1 };
					opening = null;
				} else if (opening) {
					// `/>`: a self-closed cell has no content position at all.
					opening = null;
				}
				previousBracket = { from: node.from, to: node.to, text };
				return;
			}
			if (node.name !== "tagName") return;
			const name = cellName(doc.sliceString(node.from, node.to));
			if (!name) return;
			const closing = previousBracket?.text.endsWith("/") === true;
			if (!closing) {
				opening = name;
				return;
			}
			// The cell ends where its closing tag's `</` starts, so the delimiter
			// keeps its own punctuation treatment.
			const contentTo = previousBracket ? previousBracket.to - 2 : node.from;
			const current: { name: "td" | "th"; contentFrom: number } | null = open;
			if (
				current !== null &&
				current.name === name &&
				contentTo >= current.contentFrom
			) {
				cells.push({
					header: name === "th",
					contentFrom: current.contentFrom,
					contentTo,
				});
			}
			open = null;
		},
	});

	cellsByTree.set(tree, cells);
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
