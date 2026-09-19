import {
	EditorSelection,
	type EditorState,
	type Extension,
	Facet,
	RangeSet,
	type Text,
} from "@codemirror/state";
import {
	EditorView,
	GutterMarker,
	gutterLineClass,
	layer,
	RectangleMarker,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import { blockMoveOffset } from "@/core/operations";
import type {
	SourceFieldRange,
	SourceRowRange,
	SourceTableRow,
} from "@/formats/types";
import { layerOrigin, selectionDrawnElsewhere } from "./drawn-selection";
import { pinnedHeaderCovers } from "./pinned-header";
import { sourceRowsField } from "./source-rows";

// A source view's line numbers and column letters as the grid's axes (#395).
// A column letter and the line number of a table row each name one row or
// column of the table through the codec's position mapping (ADR 0005), never
// by counting text lines: Markdown's divider and a line outside the table name
// nothing, and every line of a CSV record with a quoted line break names that
// one record. A click selects what the label names, the selection then tells
// a press that picks the row or column up from one that selects it, exactly
// as the grid's labels do (#288), and a drag drops it into the gap a line
// marks. The menus live in the pane's context menu (source-context-menu.tsx).
//
// Nothing here edits the text or the document itself: a selection is only a
// selection, and a drop hands the move to the pane, which runs it as the same
// single document step as the menu's move.

export type SourceAxis = "row" | "column";

// One row or column, as the mapping counts it: row 0 is the header row.
export interface SourceAxisTarget {
	readonly axis: SourceAxis;
	readonly index: number;
}

export interface SourceAxisConfig {
	// Where typing into each field begins and ends, from the codec's own
	// grammar: inside a quoted field's quotes, past a Markdown cell's padding.
	// Absent where the codec reads no fields, and a cell's whole span serves.
	readonly fields?: (text: string) => readonly SourceFieldRange[];
	// Whether the pane runs structural commands now. A read-only pane selects
	// from its labels but never picks anything up.
	readonly movable: () => boolean;
	// Runs the reorder a drop asked for. `at` is an offset inside the dragged
	// row or column's header cell, which names it as the menu's commands are
	// named, and `offset` is how far it goes.
	readonly reorder: (
		view: EditorView,
		axis: SourceAxis,
		at: number,
		offset: number,
	) => void;
}

export const sourceAxisConfig = Facet.define<
	SourceAxisConfig,
	SourceAxisConfig | null
>({
	combine: (values) => values.at(-1) ?? null,
});

// The table row a text line belongs to, or null when the line holds no cell
// of any row: a Markdown divider, a blank line, text outside the table. A row
// owns every line one of its cells reaches, so each line of a quoted CSV
// record names that record.
export function rowAtLine(
	rows: readonly SourceTableRow[],
	line: SourceRowRange,
): number | null {
	const index = rows.findIndex(
		(row) => line.from <= row.to && line.to >= row.from,
	);
	const row = rows[index];
	if (!row) return null;
	return row.cells.some((cell) => cell.from <= line.to && cell.to >= line.from)
		? index
		: null;
}

// A row's own text: from its start to the end of the line holding its last
// cell, so a Markdown header stops before the divider the codec counts as
// part of it, as the pinned header does.
export function rowSpan(doc: Text, row: SourceTableRow): SourceRowRange {
	const last = row.cells.at(-1);
	if (!last || last.to > doc.length) return { from: row.from, to: row.to };
	return { from: row.from, to: Math.min(row.to, doc.lineAt(last.to).to) };
}

// Every cell of one column, header first, as where typing into it begins and
// ends. A row spelling fewer cells than the column needs, which only a ragged
// draft can, simply has none.
export function columnRanges(
	rows: readonly SourceTableRow[],
	column: number,
	fields?: readonly SourceFieldRange[],
): SourceRowRange[] {
	const ranges: SourceRowRange[] = [];
	let next = 0;
	for (const row of rows) {
		const cell = row.cells[column];
		if (!cell) continue;
		// Fields are ordered and never overlap, so one pass finds each cell's.
		while (
			next < (fields?.length ?? 0) &&
			(fields?.[next]?.to ?? 0) < cell.from
		)
			next += 1;
		const field = fields?.[next];
		ranges.push(
			field && field.from >= cell.from && field.to <= cell.to ? field : cell,
		);
	}
	return ranges;
}

function fieldsOf(state: EditorState): readonly SourceFieldRange[] | undefined {
	return state.facet(sourceAxisConfig)?.fields?.(state.doc.toString());
}

// The selection a label's click makes: the row's text, or every cell of the
// column as one range each, the header's first, so typing edits them all.
export function axisSelection(
	state: EditorState,
	target: SourceAxisTarget,
): EditorSelection | null {
	const rows = state.field(sourceRowsField, false);
	if (!rows) return null;
	if (target.axis === "row") {
		const row = rows[target.index];
		if (!row) return null;
		const span = rowSpan(state.doc, row);
		return EditorSelection.single(span.from, span.to);
	}
	const ranges = columnRanges(rows, target.index, fieldsOf(state));
	if (ranges.length === 0) return null;
	return EditorSelection.create(
		ranges.map((range) => EditorSelection.range(range.from, range.to)),
		0,
	);
}

function sameRanges(a: EditorSelection, b: EditorSelection): boolean {
	if (a.ranges.length !== b.ranges.length) return false;
	return a.ranges.every((range, index) => {
		const other = b.ranges[index];
		return (
			other !== undefined && range.from === other.from && range.to === other.to
		);
	});
}

// The row the selection is exactly, as its line number's click leaves it.
function selectedSourceRow(state: EditorState): number | null {
	const rows = state.field(sourceRowsField, false);
	const { selection } = state;
	const main = selection.main;
	if (!rows || selection.ranges.length !== 1 || main.empty) return null;
	const index = rows.findIndex((row) => {
		const span = rowSpan(state.doc, row);
		return (
			main.from === span.from &&
			// A whole line selected with its line break names the row too.
			(main.to === span.to ||
				(main.to === span.to + 1 &&
					state.doc.sliceString(span.to, main.to) === "\n"))
		);
	});
	return index === -1 ? null : index;
}

// The row or column the selection is exactly, as a label's click leaves it,
// or null. This is what a keyboard-opened menu reads, as the grid's does
// (#288): a selected row offers the row menu, a selected column the column
// menu, and anything else the text menu. It is also what tells a press on a
// label that picks its row or column up from one that selects it.
export function selectedSourceAxis(
	state: EditorState,
): SourceAxisTarget | null {
	const row = selectedSourceRow(state);
	if (row !== null) return { axis: "row", index: row };
	const rows = state.field(sourceRowsField, false);
	if (!rows) return null;
	const { selection } = state;
	// A column's first range in reading order is its header cell's.
	const first = selection.ranges[0];
	const column =
		first === undefined
			? -1
			: (rows[0]?.cells.findIndex(
					(cell) => first.from >= cell.from && first.to <= cell.to,
				) ?? -1);
	if (column === -1) return null;
	const expected = axisSelection(state, { axis: "column", index: column });
	return expected && sameRanges(expected, selection)
		? { axis: "column", index: column }
		: null;
}

// Where a command names a row or column: inside its first cell, which the
// codec's mapping resolves back to it.
export function axisAnchor(
	state: EditorState,
	target: SourceAxisTarget,
): number | null {
	const rows = state.field(sourceRowsField, false);
	if (!rows) return null;
	if (target.axis === "row") {
		const row = rows[target.index];
		return row ? (row.cells[0]?.from ?? row.from) : null;
	}
	return rows[0]?.cells[target.index]?.from ?? null;
}

// What a pointer on a label names. A letter carries its column; a line number
// names the row of its line, and on the pinned header, which is inert and lets
// the press through to whatever is scrolled under it, the header row.
export type SourceLabelHit =
	| { readonly kind: "label"; readonly target: SourceAxisTarget }
	// A label that names no table row: the divider, a blank line.
	| { readonly kind: "nothing" }
	// A label whose row cannot be known because the text has no mapping now.
	| { readonly kind: "unmapped" };

export function labelAt(
	view: EditorView,
	element: EventTarget | null,
	x: number,
	y: number,
): SourceLabelHit | null {
	if (!(element instanceof Element) || !view.dom.contains(element)) return null;
	const letter = element.closest<HTMLElement>(".cm-tabeloColumnMarker");
	if (letter) {
		const column = Number(letter.dataset.column);
		return Number.isInteger(column)
			? { kind: "label", target: { axis: "column", index: column } }
			: null;
	}
	if (!element.closest(".cm-lineNumbers .cm-gutterElement")) return null;
	const rows = view.state.field(sourceRowsField, false);
	if (!rows) return { kind: "unmapped" };
	if (pinnedHeaderCovers(view, x, y)) {
		return { kind: "label", target: { axis: "row", index: 0 } };
	}
	const line = view.lineBlockAtHeight(y - view.documentTop);
	const row = rowAtLine(rows, line);
	return row === null
		? { kind: "nothing" }
		: { kind: "label", target: { axis: "row", index: row } };
}

// Selects what a label names and hands the keyboard to the text, so typing
// edits the selected cells.
export function selectAxis(
	view: EditorView,
	target: SourceAxisTarget,
): boolean {
	const selection = axisSelection(view.state, target);
	if (!selection) return false;
	view.dispatch({ selection, userEvent: "select.pointer" });
	view.focus();
	return true;
}

// The line numbers that name a table row take the label's cursor, and the
// ones whose row is selected the grab cursor, since a press there picks the
// row up. Drawn from the mapping and the selection, never stored.
class RowLabelMarker extends GutterMarker {
	constructor(override readonly elementClass: string) {
		super();
	}
	override eq(other: GutterMarker): boolean {
		return (
			other instanceof RowLabelMarker &&
			other.elementClass === this.elementClass
		);
	}
}
const rowLabel = new RowLabelMarker("cm-tabeloRowLabel");
const movableRowLabel = new RowLabelMarker(
	"cm-tabeloRowLabel cm-tabeloMovableLabel",
);

const rowLabelClasses = gutterLineClass.compute(
	[sourceRowsField, "selection", sourceAxisConfig],
	(state) => {
		const rows = state.field(sourceRowsField, false);
		const config = state.facet(sourceAxisConfig);
		if (!rows || !config) return RangeSet.empty;
		const selected = selectedSourceRow(state);
		const markers = [];
		for (const [index, row] of rows.entries()) {
			const movable = selected === index && index > 0;
			let at = row.from;
			const { to } = rowSpan(state.doc, row);
			while (at <= to && at <= state.doc.length) {
				const line = state.doc.lineAt(at);
				if (rowAtLine([row], line) !== null) {
					markers.push((movable ? movableRowLabel : rowLabel).range(line.from));
				}
				at = line.to + 1;
			}
		}
		return RangeSet.of(markers, true);
	},
);

// How far the pointer travels along the axis before a press on a selected
// label becomes a reorder, as in the grid (use-axis-reorder.ts).
const THRESHOLD_REM = 0.25;

interface Drag {
	readonly pointerId: number;
	readonly target: SourceAxisTarget;
	readonly at: number;
	readonly origin: number;
	dragging: boolean;
	// The gap the pointer last named, counted in the rows or columns that stay
	// before the dragged one: data rows for a row, columns for a column.
	boundary: number | null;
}

// The visible letters of the strip, left to right.
function letters(view: EditorView): HTMLElement[] {
	return Array.from(
		view.dom.querySelectorAll<HTMLElement>(
			":scope > .cm-tabeloColumnStrip .cm-tabeloColumnMarker:not([hidden])",
		),
	);
}

class AxisPointer {
	private drag: Drag | null = null;
	private readonly indicator: HTMLElement;

	constructor(private readonly view: EditorView) {
		this.indicator = document.createElement("div");
		this.indicator.className = "cm-tabeloDropIndicator";
		this.indicator.setAttribute("aria-hidden", "true");
		this.indicator.hidden = true;
		view.dom.appendChild(this.indicator);
		view.dom.addEventListener("pointerdown", this.onPointerDown, true);
	}

	update(update: ViewUpdate) {
		// A drop would name a row by where it stood when the drag began, so a
		// text that changes underneath the drag ends it.
		if (update.docChanged && this.drag) this.end();
	}

	destroy() {
		this.end();
		this.view.dom.removeEventListener("pointerdown", this.onPointerDown, true);
		this.indicator.remove();
	}

	private readonly onPointerDown = (event: PointerEvent) => {
		const config = this.view.state.facet(sourceAxisConfig);
		if (!config || event.button !== 0 || this.drag) return;
		const hit = labelAt(this.view, event.target, event.clientX, event.clientY);
		if (hit?.kind !== "label") return;
		// The label is not text, so the press never places a caret or starts a
		// text selection under it.
		event.preventDefault();
		event.stopPropagation();
		const { target } = hit;
		const selected = selectedSourceAxis(this.view.state);
		const at = axisAnchor(this.view.state, target);
		const picksUp =
			event.pointerType !== "touch" &&
			!event.shiftKey &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.altKey &&
			config.movable() &&
			at !== null &&
			selected?.axis === target.axis &&
			selected.index === target.index &&
			// Every table keeps its one header row first, so it never moves.
			!(target.axis === "row" && target.index === 0);
		if (!picksUp || at === null) {
			selectAxis(this.view, target);
			return;
		}
		this.view.focus();
		this.drag = {
			pointerId: event.pointerId,
			target,
			at,
			origin: target.axis === "row" ? event.clientY : event.clientX,
			dragging: false,
			boundary: null,
		};
		const win = this.view.dom.ownerDocument.defaultView ?? window;
		win.addEventListener("pointermove", this.onPointerMove);
		win.addEventListener("pointerup", this.onPointerUp);
		win.addEventListener("pointercancel", this.onCancel);
		win.addEventListener("blur", this.end);
		// Capture, so the editor's own Escape, which leaves the pane, never
		// runs while a drag is being cancelled.
		win.addEventListener("keydown", this.onKeyDown, true);
	};

	private readonly onPointerMove = (event: PointerEvent) => {
		const drag = this.drag;
		if (!drag || event.pointerId !== drag.pointerId) return;
		const position = drag.target.axis === "row" ? event.clientY : event.clientX;
		if (!drag.dragging) {
			const rootFontSize = Number.parseFloat(
				getComputedStyle(this.view.dom.ownerDocument.documentElement).fontSize,
			);
			if (Math.abs(position - drag.origin) < rootFontSize * THRESHOLD_REM)
				return;
			drag.dragging = true;
			this.view.dom.classList.add("cm-tabeloAxisDragging");
		}
		// Past the text's edge along the dragged axis, the text scrolls by as
		// far as the pointer went past it, so a row or column can be carried
		// to a gap out of view. Driven by the pointer's own moves, with no timer.
		const box = this.view.scrollDOM.getBoundingClientRect();
		const [low, high] =
			drag.target.axis === "row"
				? [box.top, box.bottom]
				: [box.left, box.right];
		const past =
			position < low ? position - low : position > high ? position - high : 0;
		if (past !== 0) {
			this.view.scrollDOM.scrollBy(
				drag.target.axis === "row" ? { top: past } : { left: past },
			);
		}
		const boundary =
			drag.target.axis === "row"
				? this.rowBoundary(event.clientY)
				: this.columnBoundary(event.clientX);
		if (boundary !== null) drag.boundary = boundary;
		this.paint(drag);
	};

	private readonly onPointerUp = (event: PointerEvent) => {
		const drag = this.drag;
		if (!drag || event.pointerId !== drag.pointerId) return;
		this.end();
		if (!drag.dragging) {
			// A click on a selected label selects that row or column alone.
			selectAxis(this.view, drag.target);
			return;
		}
		if (drag.boundary === null) return;
		const from =
			drag.target.axis === "row" ? drag.target.index - 1 : drag.target.index;
		const offset = blockMoveOffset(drag.boundary, { from, count: 1 });
		// A drop back where the row or column already stands changes nothing.
		if (offset === 0) return;
		this.view.state
			.facet(sourceAxisConfig)
			?.reorder(this.view, drag.target.axis, drag.at, offset);
	};

	private readonly onCancel = (event: PointerEvent) => {
		if (event.pointerId === this.drag?.pointerId) this.end();
	};

	private readonly onKeyDown = (event: KeyboardEvent) => {
		if (event.key !== "Escape" || !this.drag) return;
		event.preventDefault();
		event.stopPropagation();
		this.end();
	};

	// Every ending runs through here, and none of them touches the document.
	private readonly end = () => {
		this.drag = null;
		this.indicator.hidden = true;
		delete this.indicator.dataset.dropIndicator;
		this.view.dom.classList.remove("cm-tabeloAxisDragging");
		const win = this.view.dom.ownerDocument.defaultView ?? window;
		win.removeEventListener("pointermove", this.onPointerMove);
		win.removeEventListener("pointerup", this.onPointerUp);
		win.removeEventListener("pointercancel", this.onCancel);
		win.removeEventListener("blur", this.end);
		win.removeEventListener("keydown", this.onKeyDown, true);
	};

	// The data rows whose middle lies above the pointer: the gap it names.
	private rowBoundary(y: number): number | null {
		const { state } = this.view;
		const rows = state.field(sourceRowsField, false);
		if (!rows) return null;
		const height = y - this.view.documentTop;
		let boundary = 0;
		for (const row of rows.slice(1)) {
			const span = rowSpan(state.doc, row);
			const top = this.view.lineBlockAt(span.from).top;
			const bottom = this.view.lineBlockAt(span.to).bottom;
			if (height < (top + bottom) / 2) break;
			boundary += 1;
		}
		return boundary;
	}

	// The letters whose middle lies left of the pointer: the gap it names.
	private columnBoundary(x: number): number | null {
		const visible = letters(this.view);
		if (visible.length === 0) return null;
		let boundary = 0;
		for (const letter of visible) {
			const box = letter.getBoundingClientRect();
			if (x < (box.left + box.right) / 2) break;
			boundary = Number(letter.dataset.column) + 1;
		}
		return boundary;
	}

	// Pixel values straight from the editor's own measurement, applied to the
	// line and never stored as presentation state, as the column strip's are.
	private paint(drag: Drag) {
		const { view, indicator } = this;
		const boundary = drag.boundary;
		if (boundary === null) return;
		const frame = view.dom.getBoundingClientRect();
		const scroller = view.scrollDOM.getBoundingClientRect();
		const gutters = view.dom.querySelector(".cm-gutters");
		const textLeft = gutters
			? gutters.getBoundingClientRect().right
			: scroller.left;
		const textRight = scroller.left + view.scrollDOM.clientWidth;
		let style: Partial<Record<"top" | "left" | "width" | "height", number>>;
		if (drag.target.axis === "row") {
			const rows = view.state.field(sourceRowsField, false);
			if (!rows) return;
			const next = rows[boundary + 1];
			const last = rows.at(-1);
			const edge = next
				? view.lineBlockAt(next.from).top
				: last
					? view.lineBlockAt(rowSpan(view.state.doc, last).to).bottom
					: null;
			if (edge === null) return;
			style = {
				top: edge + view.documentTop - frame.top,
				left: textLeft - frame.left,
				width: Math.max(0, textRight - textLeft),
			};
		} else {
			const visible = letters(view);
			const at = visible.find(
				(letter) => Number(letter.dataset.column) === boundary,
			);
			const box = (at ?? visible.at(-1))?.getBoundingClientRect();
			if (!box) return;
			style = {
				left: (at ? box.left : box.right) - frame.left,
				top: scroller.top - frame.top,
				height: view.scrollDOM.clientHeight,
			};
		}
		indicator.dataset.dropIndicator = drag.target.axis;
		indicator.hidden = false;
		indicator.style.top = style.top === undefined ? "" : `${style.top}px`;
		indicator.style.left = style.left === undefined ? "" : `${style.left}px`;
		indicator.style.width = style.width === undefined ? "" : `${style.width}px`;
		indicator.style.height =
			style.height === undefined ? "" : `${style.height}px`;
	}
}

// The line a drop will land in, in the grid's drop colour and thickness,
// centred on the gap it names so it reads as a gap rather than an edge.
const axisTheme = EditorView.theme({
	".cm-tabeloDropIndicator": {
		position: "absolute",
		zIndex: "3",
		pointerEvents: "none",
		backgroundColor: "var(--selection-edge)",
	},
	".cm-tabeloDropIndicator[data-drop-indicator='row']": {
		height: "0.125rem",
		transform: "translateY(-50%)",
	},
	".cm-tabeloDropIndicator[data-drop-indicator='column']": {
		width: "0.125rem",
		transform: "translateX(-50%)",
	},
	".cm-lineNumbers .cm-gutterElement.cm-tabeloRowLabel": { cursor: "pointer" },
	".cm-lineNumbers .cm-gutterElement.cm-tabeloMovableLabel": { cursor: "grab" },
	"&.cm-tabeloAxisDragging, &.cm-tabeloAxisDragging *": {
		cursor: "grabbing !important",
	},
});

// A selected row or column drawn as the grid draws one (owner, 2026-09-19:
// every view's selection looks like the Visual Table's). The selection itself
// stays on the text typing replaces, which in an empty cell is a single point
// and in a row is text of every shape; what is drawn is the table's shape:
//
// - A column is one band per text line, from the delimiter before its cell to
//   the delimiter after it, padding and aligned room included. Every line from
//   the header's to the last row's takes it, so the band has no gap: a line
//   inside a row that holds no cell of the column (a CSV record's quoted line
//   break) takes its row's slot, and a line between two rows (Markdown's
//   divider) takes the slot of the row above.
// - A row is one band per text line of the row, from its first cell's opening
//   delimiter to its last cell's closing one.
// - Nothing is drawn over the band. The grid marks one cell as focused because
//   a grid cell is where editing goes; in a source view typing goes to every
//   selected cell at once, through its carets, so a focus mark on one cell
//   named a target that is not there (owner, 2026-09-19).
//
// Each band line names the row and the cells whose slot it spans, as pure data
// over the mapping, so the geometry's decisions are pinned by unit tests; only
// the conversion to pixels needs a browser.
export interface AxisBandLine {
	// A 1-based line number.
	readonly line: number;
	readonly row: number;
	// The cells whose slots bound the band: its left edge is `from`'s, its
	// right edge `to`'s. One cell for a column, the first and last for a row.
	readonly from: SourceRowRange;
	readonly to: SourceRowRange;
	// A line between two rows, such as Markdown's divider, which only carries
	// the band on to the next row.
	readonly between: boolean;
}

export function axisBandLines(
	doc: Text,
	rows: readonly SourceTableRow[],
	target: SourceAxisTarget,
): AxisBandLine[] {
	const linesOf = (row: SourceTableRow) => {
		const span = rowSpan(doc, row);
		return {
			first: doc.lineAt(Math.min(span.from, doc.length)).number,
			last: doc.lineAt(Math.min(span.to, doc.length)).number,
		};
	};
	const bands: AxisBandLine[] = [];
	if (target.axis === "row") {
		const row = rows[target.index];
		const from = row?.cells[0];
		const to = row?.cells.at(-1);
		if (!row || !from || !to) return bands;
		const { first, last } = linesOf(row);
		for (let line = first; line <= last; line += 1) {
			bands.push({ line, row: target.index, from, to, between: false });
		}
		return bands;
	}
	let above: { row: number; cell: SourceRowRange; last: number } | null = null;
	for (const [index, row] of rows.entries()) {
		const cell = row.cells[target.index];
		// A ragged row without the column breaks the band, as a missing cell
		// would in the grid; the draft that has one is already flagged.
		if (!cell) {
			above = null;
			continue;
		}
		const { first, last } = linesOf(row);
		if (above) {
			for (let line = above.last + 1; line < first; line += 1) {
				bands.push({
					line,
					row: above.row,
					from: above.cell,
					to: above.cell,
					between: true,
				});
			}
		}
		for (let line = first; line <= last; line += 1) {
			bands.push({ line, row: index, from: cell, to: cell, between: false });
		}
		above = { row: index, cell, last };
	}
	return bands;
}

// The right edge of what a line draws: its text and every widget on it, the
// alignment padding and empty-value placeholders included.
function drawnLineRight(view: EditorView, from: number): number | null {
	const { node } = view.domAtPos(from);
	const element = node instanceof Element ? node : node.parentElement;
	const line = element?.closest(".cm-line");
	if (!line) return null;
	const range = line.ownerDocument.createRange();
	range.selectNodeContents(line);
	return range.getBoundingClientRect().right;
}

// Where a cell's slot starts and ends on screen, from the delimiter before it
// to the delimiter after it, on the line holding its start. A delimiter is
// measured as a character, because a position next to one stands before any
// padding or placeholder drawn there. Null while that line is not drawn.
function cellSlot(
	view: EditorView,
	cell: SourceRowRange,
): { readonly left: number; readonly right: number } | null {
	const line = view.state.doc.lineAt(cell.from);
	const left =
		cell.from > line.from
			? view.coordsForChar(cell.from - 1)?.right
			: view.coordsAtPos(line.from, -1)?.left;
	const right =
		cell.to < line.to
			? view.coordsForChar(cell.to)?.left
			: drawnLineRight(view, line.from);
	if (left === undefined || right === undefined || right === null) return null;
	return { left, right: Math.max(left, right) };
}

// The selected row's or column's bands, in the layer's coordinates. Only lines
// the editor has drawn are measured.
function axisBands(view: EditorView): RectangleMarker[] {
	const axis = selectedSourceAxis(view.state);
	const rows = view.state.field(sourceRowsField, false);
	if (!axis || !rows) return [];
	const { doc } = view.state;
	const origin = layerOrigin(view);
	const firstLineTop = view.documentTop - origin.top;
	const { viewport } = view;
	const slots = new Map<SourceRowRange, ReturnType<typeof cellSlot>>();
	const slotOf = (cell: SourceRowRange) => {
		if (!slots.has(cell)) slots.set(cell, cellSlot(view, cell));
		return slots.get(cell) ?? null;
	};
	const bands: RectangleMarker[] = [];
	for (const band of axisBandLines(doc, rows, axis)) {
		const line = doc.line(band.line);
		if (line.to < viewport.from || line.from > viewport.to) continue;
		const from = slotOf(band.from);
		const to = slotOf(band.to);
		if (!from || !to) continue;
		const block = view.lineBlockAt(line.from);
		bands.push(
			new RectangleMarker(
				"cm-selectionBackground",
				from.left - origin.left,
				firstLineTop + block.top,
				to.right - from.left,
				block.bottom - block.top,
			),
		);
	}
	return bands;
}

// The bands, under the text as the selection band is, in its colour.
const axisBandLayer = layer({
	above: false,
	class: "cm-tabeloAxisSelectionLayer",
	update: (update) =>
		update.selectionSet ||
		update.docChanged ||
		update.viewportChanged ||
		update.geometryChanged ||
		update.startState.field(sourceRowsField, false) !==
			update.state.field(sourceRowsField, false),
	markers: axisBands,
});

// Installed in every source editor; a pane without the configuration, which is
// a pane whose codec maps no rows, offers nothing from its labels.
export const sourceAxes: Extension = [
	axisBandLayer,
	// The text band would draw the selection a second time, in the ragged
	// shape of the text it holds.
	selectionDrawnElsewhere.of((state) => selectedSourceAxis(state) !== null),
	rowLabelClasses,
	axisTheme,
	ViewPlugin.fromClass(AxisPointer),
];
