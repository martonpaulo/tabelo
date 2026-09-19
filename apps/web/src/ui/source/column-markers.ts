import {
	type EditorState,
	type Extension,
	Facet,
	StateField,
} from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { columnLetter } from "@/core/column-letter";
import type { SourceRowRange } from "@/formats/types";
import { followScrollX, followScrollXStyle } from "./follow-scroll";
import { pinnedHeaderCopy } from "./pinned-header";
import { setSourceRows } from "./source-rows";

// The column markers of a source view (#368): a strip of column letters above
// the text, one over each column, like the grid's column index strip.
//
// Every format whose codec maps where the header row's cells sit
// (`mapsSourceRows`) draws them, and the editor never decides by the view's
// name. Where a letter stands is the header line's answer, never a character
// count: each one sits at the measured position of the header cell the codec's
// parse mapped (`SourceTableRow.cells`), so a wide character, a changed zoom,
// or a longer header name moves it with the text. The markers follow the header
// line even when a body row is out of line with it, as an unpadded CSV row
// always is (owner, 2026-09-18): the header is what names the columns, and
// following the caret's line would make the letters jump sideways on every line
// change. With wrapping on, the letters stand over the header cells that begin
// on the header's first visual line; the strip itself never goes away (owner,
// 2026-09-19).
//
// The strip is an overlay across the top of the editor rather than a line of
// the document, so it is never text: it cannot be selected, copied, downloaded,
// searched, or read out. It is hidden from assistive technology like the line
// numbers, because the accessible source is the text itself, and it takes no
// pointer: the structural commands live in the pane's context menu (#255). It
// floats over the scroller, whose text starts below it, so the scroller and its
// scrollbar run the pane's full height (owner, 2026-09-19); it covers the
// line-number gutter as a dead corner, and the pinned header (#252) stacks
// directly under it.

// Whether the pane shows the strip: the codec maps the header row's cells.
export const columnMarkersEnabled = Facet.define<boolean, boolean>({
	combine: (values) => values.at(-1) ?? false,
});

// The header row's cells in the editor's text, from the latest row mapping.
// Typing between one parse and the next moves them with the text; the next
// parse replaces them, and a draft that does not parse clears them, so no
// letter ever stands at a position the text no longer has. The strip itself
// stays while its letters are gone, so a draft that stops parsing mid-word
// does not move every line of the text by the strip's height.
const headerCells = StateField.define<readonly SourceRowRange[] | null>({
	create: () => null,
	update(cells, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(setSourceRows)) {
				const { rows, length } = effect.value;
				const header = rows[0];
				return header &&
					header.cells.length > 0 &&
					length === transaction.state.doc.length &&
					header.to <= length
					? header.cells
					: null;
			}
		}
		if (!cells || !transaction.docChanged) return cells;
		return cells.map(({ from, to }) => ({
			from: transaction.changes.mapPos(from, -1),
			to: transaction.changes.mapPos(to, 1),
		}));
	},
});

// The header cells the strip labels now, or null when it shows nothing.
export function columnMarkerCells(
	state: EditorState,
): readonly SourceRowRange[] | null {
	if (!state.facet(columnMarkersEnabled)) return null;
	return state.field(headerCells, false) ?? null;
}

// Where a column's text begins inside its cell: past the one space of padding
// the serializer writes after a delimiter, so the letter starts where the
// header name does, as the grid's letter starts where its column's text does.
function columnStart(view: EditorView, cell: SourceRowRange): number {
	const from = Math.min(cell.from, view.state.doc.length);
	return cell.to > from && view.state.sliceDoc(from, from + 1) === " "
		? from + 1
		: from;
}

// Each column's horizontal offset from the start of the text, measured in the
// given view, or null when that view has not drawn the header line. Relative to
// the content box, so the numbers hold at any horizontal scroll. A column whose
// header cell begins below the header's first visual line, which only wrapping
// produces, has no letter: null in its place.
function offsetsIn(
	view: EditorView,
	cells: readonly SourceRowRange[],
): (number | null)[] | null {
	const origin = view.contentDOM.getBoundingClientRect().left;
	const first = cells[0]
		? view.coordsAtPos(columnStart(view, cells[0]), 1)
		: null;
	if (!first) return null;
	const offsets: (number | null)[] = [];
	for (const cell of cells) {
		const coords = view.coordsAtPos(columnStart(view, cell), 1);
		if (!coords) return null;
		offsets.push(coords.top < first.bottom ? coords.left - origin : null);
	}
	return offsets;
}

interface Placement {
	readonly offsets: readonly (number | null)[];
	// Where the text begins when the pane is scrolled fully left, and where the
	// gutter ends, from the strip's own left edge.
	readonly origin: number;
	readonly clip: number;
	// Where the scroller starts inside the editor, and how wide its visible
	// text area is: the strip spans that and leaves the scrollbar uncovered.
	readonly top: number;
	readonly width: number;
}

// The strip's look lives in editor-theme.ts with the other source chrome; what
// is here is what makes it an overlay. The rail holding the letters follows the
// text sideways on the browser's own scroll (follow-scroll.ts), so the letters
// never trail the columns they name. While the strip is shown, the editor
// publishes its height as `--tabelo-source-top-inset`: the scroller's text
// starts that far down, and the pinned header stands that far down.
const stripTheme = EditorView.theme({
	"&.cm-tabeloHasColumnStrip": {
		"--tabelo-source-top-inset": "var(--grid-strip-h)",
	},
	".cm-tabeloColumnRail": {
		position: "absolute",
		inset: "0",
		...followScrollXStyle,
	},
});

class ColumnStrip {
	private readonly dom: HTMLElement;
	private readonly track: HTMLElement;
	private readonly rail: HTMLElement;
	private letters: HTMLElement[] = [];
	// The strip's height while it is shown, which is how far a caret revealed
	// by scrolling has to stay below the top of the pane to be seen.
	margin = 0;
	// The last offsets measured while the header line was drawn. CodeMirror
	// draws only the lines near the viewport, so once the header scrolls far
	// enough away neither the editor nor the pinned copy may have it; the
	// header's text cannot change while it is out of reach of the caret except
	// through a new parse, which remeasures as soon as the line is drawn again.
	private known: readonly (number | null)[] | null = null;

	constructor(private readonly view: EditorView) {
		this.dom = document.createElement("div");
		this.dom.className = "cm-tabeloColumnStrip";
		this.dom.setAttribute("aria-hidden", "true");
		this.dom.inert = true;
		this.dom.hidden = true;
		this.track = document.createElement("div");
		this.track.className = "cm-tabeloColumnTrack";
		this.dom.appendChild(this.track);
		this.rail = document.createElement("div");
		this.rail.className = "cm-tabeloColumnRail";
		this.track.appendChild(this.rail);
		view.dom.appendChild(this.dom);
		view.scrollDOM.addEventListener("mousedown", this.onPointerDown, true);
		this.schedule();
	}

	update(update: ViewUpdate) {
		if (
			update.docChanged ||
			update.geometryChanged ||
			update.viewportChanged ||
			update.startState.facet(columnMarkersEnabled) !==
				update.state.facet(columnMarkersEnabled) ||
			columnMarkerCells(update.state) !== columnMarkerCells(update.startState)
		) {
			this.schedule();
		}
	}

	destroy() {
		this.view.scrollDOM.removeEventListener(
			"mousedown",
			this.onPointerDown,
			true,
		);
		this.dom.remove();
	}

	private readonly schedule = () => {
		this.view.requestMeasure({
			key: this,
			read: (view) => this.read(view),
			write: (placement) => this.write(placement),
		});
	};

	private read(view: EditorView): Placement | null {
		if (!view.state.facet(columnMarkersEnabled)) return null;
		const scroller = view.scrollDOM;
		const left = view.dom.getBoundingClientRect().left;
		const gutters = view.dom.querySelector(".cm-gutters");
		const cells = columnMarkerCells(view.state);
		const copy = pinnedHeaderCopy(view);
		const offsets = cells
			? (offsetsIn(view, cells) ??
				(copy ? offsetsIn(copy, cells) : null) ??
				(this.known?.length === cells.length ? this.known : null))
			: null;
		return {
			offsets: offsets ?? [],
			origin:
				view.contentDOM.getBoundingClientRect().left -
				left +
				scroller.scrollLeft,
			clip: gutters ? gutters.getBoundingClientRect().right - left : 0,
			top: scroller.offsetTop,
			width: scroller.clientWidth,
		};
	}

	// Pixel values straight from the editor's own measurement, applied to the
	// strip and never stored as presentation state.
	private write(placement: Placement | null) {
		if (!placement) {
			this.dom.hidden = true;
			this.margin = 0;
			return;
		}
		this.dom.hidden = false;
		this.dom.style.top = `${placement.top}px`;
		this.dom.style.width = `${placement.width}px`;
		this.margin = this.dom.offsetHeight;
		const { offsets } = placement;
		if (offsets.length > 0) this.known = offsets;
		while (this.letters.length > offsets.length) this.letters.pop()?.remove();
		while (this.letters.length < offsets.length) {
			const letter = document.createElement("span");
			letter.className = "cm-tabeloColumnMarker";
			// Drawn from the attribute by CSS, so the letter is not even text in
			// the page: find in page, text extraction, and a stray selection all
			// pass it by.
			letter.dataset.letter = columnLetter(this.letters.length);
			this.rail.appendChild(letter);
			this.letters.push(letter);
		}
		this.track.style.left = `${placement.clip}px`;
		offsets.forEach((offset, index) => {
			const letter = this.letters[index];
			if (!letter) return;
			letter.hidden = offset === null;
			if (offset !== null) {
				letter.style.left = `${placement.origin + offset - placement.clip}px`;
			}
		});
	}

	// The strip is not text and holds no control, so a press on it does
	// nothing, rather than reaching the line scrolled underneath it.
	private readonly onPointerDown = (event: MouseEvent) => {
		if (this.dom.hidden || event.button !== 0) return;
		const box = this.dom.getBoundingClientRect();
		if (
			event.clientY < box.top ||
			event.clientY >= box.bottom ||
			event.clientX < box.left ||
			event.clientX >= box.right
		)
			return;
		event.preventDefault();
		event.stopPropagation();
	};
}

const columnStrip = ViewPlugin.fromClass(ColumnStrip, {
	provide: (plugin) =>
		EditorView.scrollMargins.of((view) => {
			const margin = view.plugin(plugin)?.margin ?? 0;
			return margin ? { top: margin } : null;
		}),
});

// Installed in every source editor; the facet above decides whether the strip
// is shown, and the row mapping decides whether it has anything to label.
export const columnMarkers: Extension = [
	headerCells,
	followScrollX,
	stripTheme,
	columnStrip,
	EditorView.editorAttributes.compute(
		[columnMarkersEnabled],
		(state): Record<string, string> =>
			state.facet(columnMarkersEnabled)
				? { class: "cm-tabeloHasColumnStrip" }
				: {},
	),
];
