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
	ViewPlugin,
} from "@codemirror/view";
import type {
	SourceFieldRange,
	SourceRowRange,
	SourceTableRow,
} from "@/formats/types";
import { pinnedHeaderCovers } from "./pinned-header";
import { sourceRowsField } from "./source-rows";

// A source view's line numbers and column letters as the grid's axes (#395).
// A column letter and the line number of a table row each name one row or
// column of the table through the codec's position mapping (ADR 0005), never
// by counting text lines: Markdown's divider and a line outside the table name
// nothing, and every line of a CSV record with a quoted line break names that
// one record. A click selects what the label names, as the grid's labels do. The menus live in the pane's context menu (source-context-menu.tsx).
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

// The line numbers that name a table row take the label's cursor. Drawn from
// the mapping, never stored.
class RowLabelMarker extends GutterMarker {
	override elementClass = "cm-tabeloRowLabel";
}
const rowLabel = new RowLabelMarker();

const rowLabelClasses = gutterLineClass.compute(
	[sourceRowsField, sourceAxisConfig],
	(state) => {
		const rows = state.field(sourceRowsField, false);
		const config = state.facet(sourceAxisConfig);
		if (!rows || !config) return RangeSet.empty;
		const markers = [];
		for (const row of rows) {
			let at = row.from;
			const { to } = rowSpan(state.doc, row);
			while (at <= to && at <= state.doc.length) {
				const line = state.doc.lineAt(at);
				if (rowAtLine([row], line) !== null) {
					markers.push(rowLabel.range(line.from));
				}
				at = line.to + 1;
			}
		}
		return RangeSet.of(markers, true);
	},
);

class AxisPointer {
	constructor(private readonly view: EditorView) {
		view.dom.addEventListener("pointerdown", this.onPointerDown, true);
	}

	destroy() {
		this.view.dom.removeEventListener("pointerdown", this.onPointerDown, true);
	}

	private readonly onPointerDown = (event: PointerEvent) => {
		const config = this.view.state.facet(sourceAxisConfig);
		if (!config || event.button !== 0) return;
		const hit = labelAt(this.view, event.target, event.clientX, event.clientY);
		if (hit?.kind !== "label") return;
		// The label is not text, so the press never places a caret or starts a
		// text selection under it.
		event.preventDefault();
		event.stopPropagation();
		selectAxis(this.view, hit.target);
	};
}

const axisTheme = EditorView.theme({
	".cm-lineNumbers .cm-gutterElement.cm-tabeloRowLabel": { cursor: "pointer" },
});

// Installed in every source editor; a pane without the configuration, which is
// a pane whose codec maps no rows, offers nothing from its labels.
export const sourceAxes: Extension = [
	rowLabelClasses,
	axisTheme,
	ViewPlugin.fromClass(AxisPointer),
];
