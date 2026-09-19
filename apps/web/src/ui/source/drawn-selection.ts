import { EditorSelection, type SelectionRange } from "@codemirror/state";
import {
	type EditorView,
	layer,
	RectangleMarker,
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
function layerOrigin(view: EditorView): { left: number; top: number } {
	const box = view.scrollDOM.getBoundingClientRect();
	return {
		left: box.left - view.scrollDOM.scrollLeft,
		top: box.top - view.scrollDOM.scrollTop,
	};
}

// Every source line box is the same height, wrapped visual lines included, so a
// band edge belongs on the nearest multiple of that height from the first line's
// top. A band CodeMirror measured from the text sits a quarter of a line in from
// each boundary, which rounding moves out to the boundary; an edge already on
// one stays there.
const selectionLayer = layer({
	above: false,
	class: "cm-tabeloSelectionLayer",
	update: shouldRedraw,
	markers(view) {
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
							"cm-selectionBackground",
							contentLeft,
							top,
							content.width,
							bottom - top,
						),
					]
				: [];
		};
		const { viewport } = view;
		const beyondViewport = (range: SelectionRange): RectangleMarker[] => [
			...(range.from < viewport.from
				? outside(range.from, Math.max(range.from, viewport.from - 1))
				: []),
			...(range.to > viewport.to
				? outside(Math.min(range.to, viewport.to + 1), range.to)
				: []),
		];

		return view.state.selection.ranges.flatMap((range) =>
			range.empty
				? []
				: [
						...beyondViewport(range),
						...RectangleMarker.forRange(view, "cm-selectionBackground", range),
					].flatMap((band) => {
						const top = snap(band.top);
						const bottom = Math.min(
							Math.max(snap(band.top + band.height), top + pitch),
							lastLineBottom,
						);
						if (bottom <= top) return [];
						return new RectangleMarker(
							"cm-selectionBackground",
							band.left,
							top,
							band.width,
							bottom - top,
						);
					}),
		);
	},
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

export const drawnSelection = [selectionLayer, caretLayer];

// The selection band alone, for the pinned header's copy (#252): it shows the
// editor's selection over the header it pins, and never a caret of its own.
export const drawnSelectionBand = selectionLayer;
