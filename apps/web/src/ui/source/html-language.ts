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

// The XML mode from @codemirror/legacy-modes, configured for HTML. It is
// maintained by CodeMirror's author and costs about what the hand-written
// tokenizer it replaced cost, roughly 2 kB gzipped on top of the editor core,
// where @codemirror/lang-html costs nearly 69 kB because it carries whole CSS
// and JavaScript grammars for markup Tabelo never emits. What the replacement
// buys is correctness: it returns `<`, `</`, and `>` as angle brackets and the
// element name on its own, so an opening tag no longer looks like a closing one.
export const htmlLanguage = StreamLanguage.define(html);

// The legacy mode has no notion of a table header, so Tabelo's own emphasis for
// header cells is added here. It only marks the span the mode has already
// tokenized as the content of a `<th>` element; it never reads or rewrites the
// source, and it is not a second HTML parser: the element boundaries come from
// the mode's own tokens.
export function headerCellRanges(state: EditorState): DecorationSet {
	const ranges: Range<Decoration>[] = [];
	const { doc } = state;
	// Where the current header cell's content began, or null outside one.
	let contentFrom: number | null = null;
	// Set between reading a `<th` name and reaching the `>` that ends its tag.
	let openingHeader = false;
	let previousBracket: { from: number; to: number; text: string } | null = null;

	syntaxTree(state).iterate({
		enter: (node) => {
			if (node.name === "angleBracket") {
				const text = doc.sliceString(node.from, node.to);
				// One token can carry the end of one tag and the start of the next,
				// as `></` does between two adjacent elements.
				if (openingHeader && text.startsWith(">")) {
					openingHeader = false;
					contentFrom = node.from + 1;
				} else if (openingHeader) {
					// `/>`: a self-closed header cell has no content to emphasise.
					openingHeader = false;
				}
				previousBracket = { from: node.from, to: node.to, text };
				return;
			}
			if (node.name !== "tagName") return;
			if (doc.sliceString(node.from, node.to).toLowerCase() !== "th") return;
			const closing = previousBracket?.text.endsWith("/") === true;
			if (!closing) {
				openingHeader = true;
				return;
			}
			// The header cell ends where its closing tag's `</` starts, so the
			// delimiter keeps its own punctuation treatment.
			const contentTo = previousBracket ? previousBracket.to - 2 : node.from;
			if (contentFrom !== null && contentTo > contentFrom) {
				ranges.push(
					Decoration.mark({ class: "cm-tableHeaderCell" }).range(
						contentFrom,
						contentTo,
					),
				);
			}
			contentFrom = null;
		},
	});

	return Decoration.set(ranges, true);
}

export const htmlHeaderCells = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = headerCellRanges(view.state);
		}

		update(update: ViewUpdate) {
			// The scan walks the whole parsed tree rather than the viewport, because
			// a header cell's opening tag can sit above it. A stream language parses
			// forward from the first character, so the `<th>` elements at the top of
			// the table are covered before anything below them is. At Tabelo's
			// documented scale of roughly 200 rows that is one cheap pass per edit.
			if (update.docChanged || update.viewportChanged) {
				this.decorations = headerCellRanges(update.state);
			}
		}
	},
	{ decorations: (plugin) => plugin.decorations },
);
