import {
	type EditorState,
	type Extension,
	Facet,
	StateField,
} from "@codemirror/state";
import {
	EditorView,
	type Panel,
	showPanel,
	type ViewUpdate,
} from "@codemirror/view";
import { columnLetter } from "@/core/column-letter";
import type { SourceRowRange } from "@/formats/types";
import { followScrollX, followScrollXStyle } from "./follow-scroll";
import { pinnedHeaderCopy } from "./pinned-header";
import { setSourceRows } from "./source-rows";

// The column markers of a source view (#368): a strip of column letters above
// the text, one over each column, like the grid's column index strip.
//
// Only a format whose own output sets every column at one horizontal position
// draws them, and the codec says so (`alignsSourceColumns`); the editor never
// decides by the view's name. Where a letter stands is the header line's
// answer, never a character count: each one sits at the measured position of
// the header cell the codec's parse mapped (`SourceTableRow.cells`), so a wide
// character, a changed zoom, or a longer header name moves it with the text.
// The markers follow the header line even when a body row has drifted out of
// line with it after typing (owner, 2026-09-18): the header is what names the
// columns, and following the caret's line would make the letters jump sideways
// on every line change.
//
// The strip is a CodeMirror panel above the scroller rather than a line of the
// document, so it is never text: it cannot be selected, copied, downloaded,
// searched, or read out. It is hidden from assistive technology like the line
// numbers, because the accessible source is the text itself, and it takes no
// pointer: the structural commands live in the pane's context menu (#255).
// Sitting outside the scroller, it covers the line-number gutter as a dead
// corner and pushes nothing into the text, and the pinned header (#252) stacks
// directly under it.

// Whether the pane shows the strip: the codec declares aligned columns and the
// text is not wrapped. A wrapped header line has no single position per column.
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
// the content box, so the numbers hold at any horizontal scroll.
function offsetsIn(
	view: EditorView,
	cells: readonly SourceRowRange[],
): number[] | null {
	const origin = view.contentDOM.getBoundingClientRect().left;
	const offsets: number[] = [];
	for (const cell of cells) {
		const coords = view.coordsAtPos(columnStart(view, cell), 1);
		if (!coords) return null;
		offsets.push(coords.left - origin);
	}
	return offsets;
}

interface Placement {
	readonly offsets: readonly number[];
	// Where the text begins when the pane is scrolled fully left, and where the
	// gutter ends, from the strip's own left edge.
	readonly origin: number;
	readonly clip: number;
}

// The rail holding the letters follows the text sideways on the browser's own
// scroll (follow-scroll.ts), so the letters never trail the columns they name.
const railTheme = EditorView.theme({
	".cm-tabeloColumnRail": {
		position: "absolute",
		inset: "0",
		...followScrollXStyle,
	},
});

class ColumnStrip implements Panel {
	readonly dom: HTMLElement;
	readonly top = true;
	private readonly track: HTMLElement;
	private readonly rail: HTMLElement;
	private letters: HTMLElement[] = [];
	// The last offsets measured while the header line was drawn. CodeMirror
	// draws only the lines near the viewport, so once the header scrolls far
	// enough away neither the editor nor the pinned copy may have it; the
	// header's text cannot change while it is out of reach of the caret except
	// through a new parse, which remeasures as soon as the line is drawn again.
	private known: readonly number[] | null = null;

	constructor(private readonly view: EditorView) {
		this.dom = document.createElement("div");
		this.dom.className = "cm-tabeloColumnStrip";
		this.dom.setAttribute("aria-hidden", "true");
		this.dom.inert = true;
		this.track = document.createElement("div");
		this.track.className = "cm-tabeloColumnTrack";
		this.dom.appendChild(this.track);
		this.rail = document.createElement("div");
		this.rail.className = "cm-tabeloColumnRail";
		this.track.appendChild(this.rail);
	}

	mount() {
		this.schedule();
	}

	update(update: ViewUpdate) {
		if (
			update.docChanged ||
			update.geometryChanged ||
			update.viewportChanged ||
			columnMarkerCells(update.state) !== columnMarkerCells(update.startState)
		) {
			this.schedule();
		}
	}

	private readonly schedule = () => {
		this.view.requestMeasure({
			key: this,
			read: (view) => this.read(view),
			write: (placement) => this.write(placement),
		});
	};

	private read(view: EditorView): Placement | null {
		const cells = columnMarkerCells(view.state);
		if (!cells) return null;
		const copy = pinnedHeaderCopy(view);
		const offsets =
			offsetsIn(view, cells) ??
			(copy ? offsetsIn(copy, cells) : null) ??
			(this.known?.length === cells.length ? this.known : null);
		if (!offsets) return null;
		const left = this.dom.getBoundingClientRect().left;
		const gutters = view.dom.querySelector(".cm-gutters");
		const scroller = view.scrollDOM;
		return {
			offsets,
			origin:
				view.contentDOM.getBoundingClientRect().left -
				left +
				scroller.scrollLeft,
			clip: gutters ? gutters.getBoundingClientRect().right - left : 0,
		};
	}

	// Pixel values straight from the editor's own measurement, applied to the
	// strip and never stored as presentation state.
	private write(placement: Placement | null) {
		const offsets = placement?.offsets ?? [];
		this.known = placement ? offsets : this.known;
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
		if (!placement) return;
		this.track.style.left = `${placement.clip}px`;
		offsets.forEach((offset, index) => {
			const letter = this.letters[index];
			if (letter) {
				letter.style.left = `${placement.origin + offset - placement.clip}px`;
			}
		});
	}
}

function createColumnStrip(view: EditorView): Panel {
	return new ColumnStrip(view);
}

// Installed in every source editor; the facet above decides whether the strip
// is shown, and the row mapping decides whether it has anything to label.
export const columnMarkers: Extension = [
	headerCells,
	followScrollX,
	railTheme,
	showPanel.compute([columnMarkersEnabled], (state) =>
		state.facet(columnMarkersEnabled) ? createColumnStrip : null,
	),
];
