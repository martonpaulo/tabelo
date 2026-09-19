import {
	EditorSelection,
	type EditorState,
	Facet,
	RangeSet,
} from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	type EditorView,
	GutterMarker,
	gutterLineClass,
	layer,
	RectangleMarker,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";

// How a source editor paints its selection and its caret.
//
// `drawSelection` stays in the editor: it hides the browser's own selection and
// caret, handles focus, and is what lets several selections show at once, which
// occurrence selection needs. What it draws is replaced here, for two measured
// defects (#268, #359):
//
// - Its selection band measures the text's own box, about half of the 2rem line
//   box a source line sits in, so a one-line selection covered half the line
//   the active-line fill beside it covers whole.
// - Its caret is a 2px border at whatever fractional position the glyphs give,
//   so it blurred across three device pixels mid-line and was clipped under the
//   gutter at column 0.
//
// Both layers below are CodeMirror's public `layer` API. The editor theme hides
// the two layers `drawSelection` would otherwise show.

function shouldRedraw(update: ViewUpdate): boolean {
	return (
		update.docChanged ||
		update.selectionSet ||
		update.viewportChanged ||
		update.geometryChanged
	);
}

// Where the layer's own coordinates start, in client pixels. Markers are placed
// relative to the scroller, which is where both layers are mounted.
export function layerOrigin(view: EditorView): { left: number; top: number } {
	const box = view.scrollDOM.getBoundingClientRect();
	return {
		left: box.left - view.scrollDOM.scrollLeft,
		top: box.top - view.scrollDOM.scrollTop,
	};
}

// The bands for any set of ranges, snapped to the line pitch and drawn from
// the line-height map outside the rendered lines. The selection layer draws
// the selection with it, and the source axes a selected column (#395), so a
// band means the same thing wherever it appears.
export function pitchBands(
	view: EditorView,
	ranges: readonly { readonly from: number; readonly to: number }[],
	className: string,
): RectangleMarker[] {
	const pitch = view.defaultLineHeight;
	const firstLineTop = view.documentTop - layerOrigin(view).top;
	const snap = (edge: number) =>
		firstLineTop + Math.round((edge - firstLineTop) / pitch) * pitch;
	// A range that runs past the rendered viewport is drawn to the content's
	// edge, and the content is padded below its last line (room to click
	// under it, and clear of the floating button). No band may reach into
	// that padding: it ends where the last line does.
	const lastLineBottom =
		firstLineTop + view.lineBlockAt(view.state.doc.length).bottom;
	// CodeMirror measures only the lines it has rendered (its viewport), so
	// the part of a range outside them is drawn here from the line-height
	// map, which holds every line, as full-width bands. A band that depended
	// on the rendered lines alone showed a selection cut off at their edge
	// until something redrew it (owner report, 2026-09-19).
	const content = view.contentDOM.getBoundingClientRect();
	const contentLeft = content.left - layerOrigin(view).left;
	const outside = (from: number, to: number): RectangleMarker[] => {
		const top = firstLineTop + view.lineBlockAt(from).top;
		const bottom = Math.min(
			firstLineTop + view.lineBlockAt(to).bottom,
			lastLineBottom,
		);
		return bottom > top
			? [
					new RectangleMarker(
						className,
						contentLeft,
						top,
						content.width,
						bottom - top,
					),
				]
			: [];
	};
	const { viewport } = view;
	const beyondViewport = (range: {
		readonly from: number;
		readonly to: number;
	}): RectangleMarker[] => [
		...(range.from < viewport.from
			? outside(range.from, Math.max(range.from, viewport.from - 1))
			: []),
		...(range.to > viewport.to
			? outside(Math.min(range.to, viewport.to + 1), range.to)
			: []),
	];

	return ranges.flatMap((range) =>
		range.to <= range.from
			? []
			: [
					...beyondViewport(range),
					...RectangleMarker.forRange(
						view,
						className,
						EditorSelection.range(range.from, range.to),
					),
				].flatMap((band) => {
					const top = snap(band.top);
					const bottom = Math.min(
						Math.max(snap(band.top + band.height), top + pitch),
						lastLineBottom,
					);
					if (bottom <= top) return [];
					return new RectangleMarker(
						className,
						band.left,
						top,
						band.width,
						bottom - top,
					);
				}),
	);
}

// Whether another layer draws the selection in the state, in a shape of its
// own. A selected row or column is drawn as the grid draws one (source-axes.ts),
// and the text band under it would show the ragged shape the axis layer is
// there to replace.
export const selectionDrawnElsewhere = Facet.define<
	(state: EditorState) => boolean,
	(state: EditorState) => boolean
>({
	combine: (values) => (state) => values.some((drawn) => drawn(state)),
});

// Every source line box is the same height, wrapped visual lines included, so a
// band edge belongs on the nearest multiple of that height from the first line's
// top. A band CodeMirror measured from the text sits a quarter of a line in from
// each boundary, which rounding moves out to the boundary; an edge already on
// one stays there.
const selectionLayer = layer({
	above: false,
	class: "cm-tabeloSelectionLayer",
	update: shouldRedraw,
	markers: (view) =>
		view.state.facet(selectionDrawnElsewhere)(view.state)
			? []
			: pitchBands(view, view.state.selection.ranges, "cm-selectionBackground"),
});

// One device pixel is the smallest step a line can move without blurring.
function snapToDevicePixel(value: number): number {
	const ratio = window.devicePixelRatio || 1;
	return Math.round(value * ratio) / ratio;
}

// The caret the product draws: two hairlines wide and placed on whole device
// pixels, so every column shows it at the same width. Every selection
// gets one, at its head, as `drawSelection` does, so several occurrences still
// show where typing will land.
const caretLayer = layer({
	above: true,
	class: "cm-tabeloCaretLayer",
	update(update, dom) {
		// Restart the blink on every selection change, so the caret is visible
		// the moment it moves rather than halfway through an off phase. This is
		// the same two-keyframe swap CodeMirror's own cursor layer performs.
		if (update.transactions.some((transaction) => transaction.selection)) {
			dom.style.animationName =
				dom.style.animationName === "cm-blink" ? "cm-blink2" : "cm-blink";
		}
		return shouldRedraw(update);
	},
	markers(view) {
		const origin = layerOrigin(view);
		const { main } = view.state.selection;
		return view.state.selection.ranges.flatMap((range) => {
			const caret = range.empty
				? range
				: EditorSelection.cursor(
						range.head,
						range.head > range.anchor ? -1 : 1,
					);
			const className =
				range === main
					? "cm-tabeloCaret cm-tabeloCaret-primary"
					: "cm-tabeloCaret cm-tabeloCaret-secondary";
			return RectangleMarker.forRange(view, className, caret).map(
				(marker) =>
					new RectangleMarker(
						className,
						snapToDevicePixel(marker.left + origin.left) - origin.left,
						marker.top,
						null,
						marker.height,
					),
			);
		});
	},
});

// The current line, drawn for the main selection alone. CodeMirror's own
// `highlightActiveLine` tints the line of every range's head, so a selected
// column lit every row it crossed across the whole pane and read as everything
// selected (owner, 2026-09-19). The grid has one focused cell however many
// cells are selected, and a source pane keeps one current line the same way:
// the main selection's, whatever else is selected. Its line number takes the
// same lift; the lines the other ranges reach are marked on the gutter below.
const currentLine = Decoration.line({ class: "cm-activeLine" });

const currentLineHighlight = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		constructor(view: EditorView) {
			this.decorations = this.build(view.state);
		}
		update(update: ViewUpdate) {
			if (update.docChanged || update.selectionSet) {
				this.decorations = this.build(update.state);
			}
		}
		build(state: EditorState): DecorationSet {
			const line = state.doc.lineAt(state.selection.main.head);
			return Decoration.set([currentLine.range(line.from)]);
		}
	},
	{ decorations: (plugin) => plugin.decorations },
);

class LineNumberMark extends GutterMarker {
	constructor(override readonly elementClass: string) {
		super();
	}
	override eq(other: GutterMarker): boolean {
		return (
			other instanceof LineNumberMark &&
			other.elementClass === this.elementClass
		);
	}
}
const currentLineNumber = new LineNumberMark("cm-activeLineGutter");
const reachedLineNumber = new LineNumberMark("cm-tabeloReachedLine");

// The line numbers the selection reaches, as the grid marks the row numbers a
// selected area reaches. A lone caret marks nothing here: its line is the
// current line above. Any other selection marks every line one of its ranges
// touches, an empty range included, which is what a selected column of empty
// cells is made of.
const lineNumberMarks = gutterLineClass.compute(
	["selection", "doc"],
	(state) => {
		const { selection, doc } = state;
		const marks = [
			currentLineNumber.range(doc.lineAt(selection.main.head).from),
		];
		if (selection.ranges.length > 1 || !selection.main.empty) {
			for (const range of selection.ranges) {
				const last = doc.lineAt(range.to).number;
				for (
					let number = doc.lineAt(range.from).number;
					number <= last;
					number += 1
				) {
					marks.push(reachedLineNumber.range(doc.line(number).from));
				}
			}
		}
		return RangeSet.of(marks, true);
	},
);

export const drawnSelection = [
	selectionLayer,
	caretLayer,
	currentLineHighlight,
	lineNumberMarks,
];

// The selection band alone, for the pinned header's copy (#252): it shows the
// editor's selection over the header it pins, and never a caret of its own.
export const drawnSelectionBand = selectionLayer;
