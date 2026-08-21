import { cn } from "@tabelo/ui/lib/utils";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { selectionClipboardPayload } from "@/clipboard/serialize";
import { copy } from "@/copy/copy";
import { cellText, readCell } from "@/core/cell-value";
import {
	activeRange,
	type CellPosition,
	type CellRect,
	HEADER_ROW,
	rectContains,
	replaceActiveRange,
	selectionFillRefusal,
	selectionRect,
	selectionRects,
} from "@/core/selection";
import { parseExpectedValue } from "@/core/typed-input";
import type {
	Alignment,
	Column,
	ColumnId,
	ExpectedColumnType,
	Row,
} from "@/core/types";
import {
	currentMatch,
	type PasteRefusal,
	type StructureDeletionRefusal,
	useTabeloStore,
} from "@/state/store";
import { usePaneEntered } from "@/ui/workspace/use-pane-entry";
import {
	atMaximumColumnWidth,
	atMinimumColumnWidth,
	clampColumnWidth,
	fitColumnWidth,
	resolveColumnWidth,
	stepColumnWidth,
} from "@/workspace/column-width";
import { AxisDropIndicator } from "./axis-drop-indicator";
import {
	type AxisMenuHandle,
	AxisMenuPopupHost,
	AxisMenuTrigger,
	createAxisMenuHandle,
} from "./axis-menu";
import { AxisReorderGrip } from "./axis-reorder-grip";
import { CellEditor, type EditorExit } from "./cell-editor";
import {
	cellTypeDiverges,
	cellValueType,
	expectedCellValueType,
} from "./cell-type";
import { CellTypeMark } from "./cell-type-mark";
import { FillHandle } from "./fill-handle";
import { FillPreview, type FillPreviewSetter } from "./fill-preview";
import { GridContextMenu } from "./grid-context-menu";
import { autoscrollAxisOf, type GridDragKind, gridTargetAt } from "./grid-drag";
import { revealGridCell } from "./reveal-cell";
import {
	fillRefusalMessage,
	moveRefusalMessage,
	runFillDirection,
} from "./table-actions";
import {
	type TypedCellDecision,
	TypedCellDecisionDialog,
} from "./typed-cell-decision-dialog";
import {
	type AxisReorderController,
	type DropIndicatorSetter,
	useAxisReorder,
} from "./use-axis-reorder";
import { useFillDrag } from "./use-fill-drag";
import {
	type GridAutoscrollPoint,
	useGridAutoscroll,
} from "./use-grid-autoscroll";

const alignClass: Record<Alignment, string> = {
	default: "text-left",
	left: "text-left",
	center: "text-center",
	right: "text-right",
};

// "No column of this row is focused, selected, or being edited." Any value
// below zero works, because a column index is never negative; naming it keeps
// the row's props readable at the call site.
const NO_COLUMN = -1;

// Which sides of a cell lie on the boundary of the copied range. Only those are
// drawn, so the range reads as one outline rather than a grid of dashes.
interface ClipboardEdges {
	readonly top: boolean;
	readonly right: boolean;
	readonly bottom: boolean;
	readonly left: boolean;
}

// The mark showing which cells the clipboard was last filled from. It is drawn
// by the cells themselves rather than by one floating rectangle over the table:
// the cells already resolve per-pane zoom, column resizing, wrapped row
// heights, and the two sticky chrome layers, and a measured overlay would have
// to reproduce all four and keep them in step.
//
// Static, never animated. Grid geometry and cell selection do not animate, and
// static status does not pulse: see docs/design-system.md §7. The dash pattern,
// not the colour, is what distinguishes it from the solid focus outline, so the
// mark does not depend on colour alone.
function ClipboardSourceEdge({ top, right, bottom, left }: ClipboardEdges) {
	return (
		<span
			aria-hidden
			// The technical contract the browser suite reads: which cells carry the
			// mark, and which of them own an edge of it. There is no ARIA state for
			// "the clipboard came from here", and inventing one on a gridcell would
			// replace the cell's name with it. See docs/design-system.md §9.
			data-clipboard-source={
				[top && "top", right && "right", bottom && "bottom", left && "left"]
					.filter(Boolean)
					.join(" ") || "inside"
			}
			className={cn(
				// Preflight leaves every border at zero width, so naming the style
				// once and then only the sides that exist draws exactly those sides.
				"pointer-events-none absolute inset-0 z-10 border-selection-edge border-dashed",
				top && "border-t-2",
				right && "border-r-2",
				bottom && "border-b-2",
				left && "border-l-2",
			)}
		/>
	);
}

// The half-open range of one cell's text the current find match covers, or
// nothing. Passed to a row as three primitives for the same reason the copied
// areas are: the memo boundary compares by value, and only the row holding the
// current match may re-render when the user steps to it.
const NO_MARK = 0;

// The current find occurrence, drawn inside the value the cell already shows.
//
// Three spans carrying exactly the characters the cell carries, so the
// accessible name, the native tooltip, and every copy path still see one
// unbroken value: nothing is inserted, replaced, or hidden. Presentation only,
// and deliberately not a `<mark>`: its implicit semantics would announce a
// highlight, and which occurrence this is belongs to the written count in the
// find bar rather than to the cell. See docs/design-system.md §9.
function markedValue(value: string, start: number, end: number) {
	if (start >= end) return value;
	return (
		<>
			{value.slice(0, start)}
			<span data-find-current className="bg-primary text-primary-foreground">
				{value.slice(start, end)}
			</span>
			{value.slice(end)}
		</>
	);
}

// One cell's edges on the boundary of the copied region, or nothing when the
// cell is not copied at all. A side is drawn only when the cell across it is
// not copied too, so the mark reads as one outline rather than a grid of
// dashes: that is the contract, and it is why this asks about neighbours
// instead of comparing the cell against one area's own edges.
//
// Areas may overlap or sit side by side, and both cases are the reason. Asking
// each area separately would draw its own border through the middle of the
// region the clipboard actually holds; asking the neighbours gives one outline
// around whatever shape the areas add up to, in every arrangement.
function clipboardEdgesAt(
	copied: (row: number, column: number) => boolean,
	row: number,
	column: number,
): ClipboardEdges | null {
	if (!copied(row, column)) return null;
	return {
		top: !copied(row - 1, column),
		right: !copied(row, column + 1),
		bottom: !copied(row + 1, column),
		left: !copied(row, column - 1),
	};
}

// Why a structural delete was refused. Keyed by the store's refusal so a new
// reason cannot be added without a message to show for it.
const structureRefusalMessage: Record<StructureDeletionRefusal, string> = {
	"last-row": copy.disabled.lastRemainingRow,
	"last-column": copy.disabled.lastRemainingColumn,
};

const pasteRefusalMessage: Record<PasteRefusal, string> = {
	"single-area": copy.disabled.singleAreaRequired,
};

// What a pointer gesture on a select handle or a cell means. "replace" is a
// plain click, "extend" is Shift, and "toggle" is the platform modifier adding
// a region to the selection or taking one away.
type SelectIntent = "replace" | "extend" | "toggle";

function selectIntentOf(event: {
	shiftKey: boolean;
	metaKey: boolean;
	ctrlKey: boolean;
}): SelectIntent {
	// Shift wins over the modifier, so Mod+Shift+click extends the region the
	// modifier most recently added rather than starting another one. That is
	// what makes a modifier click and a following Shift click compose.
	if (event.shiftKey) return "extend";
	return event.metaKey || event.ctrlKey ? "toggle" : "replace";
}

// The selected column spans of one row, encoded so it can cross the memo
// boundary below as a primitive. A row may sit inside several regions at once,
// and an array of them would be a new object on every render of the grid.
function spansOf(rects: readonly CellRect[], row: number): string {
	return rects
		.filter((rect) => row >= rect.top && row <= rect.bottom)
		.map((rect) => `${rect.left}:${rect.right}`)
		.join(",");
}

function coveredBySpans(spans: string, column: number): boolean {
	if (spans === "") return false;
	return spans.split(",").some((span) => {
		const [left, right] = span.split(":").map(Number);
		return left !== undefined && right !== undefined
			? column >= left && column <= right
			: false;
	});
}

// Whether a rect list covers one cell. The header cells ask this directly; a
// data row asks it of the three span strings it was given, because it cannot
// see the rects from behind the memo boundary.
function coveredByRects(
	rects: readonly CellRect[],
	row: number,
	column: number,
): boolean {
	return rects.some((rect) => rectContains(rect, row, column));
}

// The next cell in reading order, or nothing when there is none. This is how
// Tab knows it has reached an edge and should let focus leave the grid.
//
// Reading order starts at the header row, so the walk is offset by one row: a
// grid of N data rows exposes N + 1 rows of cells.
function adjacentCell(
	from: CellPosition,
	direction: 1 | -1,
	rows: number,
	columns: number,
): CellPosition {
	const total = (rows + 1) * columns;
	const index =
		((from.row - HEADER_ROW) * columns + from.column + direction + total) %
		total;
	return {
		row: Math.floor(index / columns) + HEADER_ROW,
		column: index % columns,
	};
}

function moveAfterCellEdit(position: CellPosition, exit: EditorExit) {
	const store = useTabeloStore.getState();
	if (exit === "next-row") {
		store.selectCell({
			row: Math.min(position.row + 1, store.document.rows.length - 1),
			column: position.column,
		});
	} else if (exit === "next-column") {
		store.selectCell({
			row: position.row,
			column: Math.min(position.column + 1, store.document.columns.length - 1),
		});
	} else if (exit === "previous-column") {
		store.selectCell({
			row: position.row,
			column: Math.max(position.column - 1, 0),
		});
	}
}

export function TableGrid({ zoom }: { readonly zoom: number }) {
	const document = useTabeloStore((state) => state.document);
	const selection = useTabeloStore((state) => state.selection);
	const editing = useTabeloStore((state) => state.editing);
	const editingSeed = useTabeloStore((state) => state.editingSeed);
	const editingHeader = useTabeloStore((state) => state.editingHeader);
	const copiedRanges = useTabeloStore((state) => state.copiedRanges);
	const match = useTabeloStore((state) => currentMatch(state.find));
	const copiedAt = (row: number, column: number) =>
		coveredByRects(copiedRanges, row, column);
	const wrappedColumns = useTabeloStore(
		(state) => state.workspace.wrappedColumns,
	);
	const columnWidths = useTabeloStore((state) => state.workspace.columnWidths);
	const entered = usePaneEntered();

	const gridRef = useRef<HTMLTableElement>(null);
	const wrapperRef = useRef<HTMLDivElement>(null);
	const draggingRef = useRef<GridDragKind | null>(null);
	// Written by the drop indicator when it mounts, so a reorder drag repaints
	// one element rather than the whole table on every pointer move.
	const setIndicatorRef = useRef<DropIndicatorSetter | null>(null);
	const setFillPreviewRef = useRef<FillPreviewSetter | null>(null);
	// One handle for the whole grid: every gutter trigger opens the single root
	// mounted below, because only one axis menu can be open at a time.
	const [axisMenuHandle] = useState(createAxisMenuHandle);
	const [typedDecision, setTypedDecision] = useState<TypedCellDecision | null>(
		null,
	);
	const [typedDialogOpen, setTypedDialogOpen] = useState(false);
	// The synchronous mirror lets pointer capture know that blurring an editor
	// opened a modal before React has committed the state update. The pointer
	// must not also select whatever happened to be underneath that dialog.
	const typedDecisionRef = useRef<TypedCellDecision | null>(null);
	const typedDecisionOutcomeRef = useRef<"keep-editing" | "resolved" | null>(
		null,
	);

	// Everything the user selected, which is what gets painted.
	const rects = selectionRects(
		selection,
		document.rows.length,
		document.columns.length,
	);
	const focus = activeRange(selection).focus;
	const fillSource = selectionFillRefusal(
		selection,
		document.rows.length,
		document.columns.length,
	)
		? null
		: selectionRect(selection, document.rows.length, document.columns.length);
	// Tracks the edit that just ended, so focus can be handed back to the grid
	// when the cell editor unmounts and drops it on <body>.
	const wasEditingRef = useRef(false);

	// Keep DOM focus on the focused cell, but never steal it from the source
	// panel or a menu: follow the selection only when focus is already inside
	// the grid, or when an edit just finished and left focus with nobody.
	useEffect(() => {
		const isEditing = editing !== null || editingHeader !== null;
		const justFinishedEditing = wasEditingRef.current && !isEditing;
		wasEditingRef.current = isEditing;
		if (isEditing) return;

		const grid = gridRef.current;
		if (!grid) return;
		if (!grid.contains(window.document.activeElement) && !justFinishedEditing)
			return;

		const target = grid.querySelector<HTMLElement>(
			`[data-cell="${focus.row}:${focus.column}"]`,
		);
		if (!target) return;
		// The grid scrolls the cell into view itself, so focus is told not to:
		// letting both run would scroll twice, and the browser's own attempt is
		// the one that leaves the cell under the sticky gutter.
		target.focus({ preventScroll: true });
		revealGridCell(grid, target, focus.row);
	}, [focus.row, focus.column, editing, editingHeader]);

	// Stepping to a match moves the selection while the find bar keeps the
	// caret, so the effect above stands down: focus is not in the grid. The
	// match still has to be brought into view, and clear of the sticky chrome
	// rather than merely on screen, which is the contract #141 established.
	useEffect(() => {
		const grid = gridRef.current;
		if (!grid || !match) return;
		const target = grid.querySelector<HTMLElement>(
			`[data-cell="${match.row}:${match.column}"]`,
		);
		if (target) revealGridCell(grid, target, match.row);
	}, [match]);

	// A column selection starts on the header row, because a column is its header
	// plus its cells.
	const selectColumn = useCallback((column: number, intent: SelectIntent) => {
		const store = useTabeloStore.getState();
		if (intent === "replace") {
			store.selectCell({ row: HEADER_ROW, column }, "column");
			return;
		}
		if (intent === "toggle") {
			store.toggleSelectionRegion({ row: HEADER_ROW, column }, "column");
			return;
		}

		// Extending replaces the active region rather than moving its focus: the
		// region may have been a cell or a row before this, and Shift+clicking a
		// column letter means "columns from there to here" either way.
		const active = activeRange(store.selection);
		const anchorColumn =
			active.mode === "column" ? active.anchor.column : active.focus.column;
		store.setSelection(
			replaceActiveRange(store.selection, {
				anchor: { row: HEADER_ROW, column: anchorColumn },
				focus: { row: HEADER_ROW, column },
				mode: "column",
			}),
		);
	}, []);

	// Mirrors selectColumn's anchor rule verbatim: extend from the existing
	// anchor when already in row mode, otherwise from the focus.
	const selectRow = useCallback((row: number, intent: SelectIntent) => {
		const store = useTabeloStore.getState();
		if (intent === "replace") {
			store.selectCell({ row, column: 0 }, "row");
			return;
		}
		if (intent === "toggle") {
			store.toggleSelectionRegion({ row, column: 0 }, "row");
			return;
		}

		const active = activeRange(store.selection);
		const anchorRow =
			active.mode === "row" ? active.anchor.row : active.focus.row;
		store.setSelection(
			replaceActiveRange(store.selection, {
				anchor: { row: anchorRow, column: 0 },
				focus: { row, column: 0 },
				mode: "row",
			}),
		);
	}, []);

	const reorder = useAxisReorder({
		gridRef,
		wrapperRef,
		draggingRef,
		setIndicatorRef,
	});
	const fill = useFillDrag({
		gridRef,
		wrapperRef,
		draggingRef,
		setPreviewRef: setFillPreviewRef,
	});
	const extendAutoscrolledDrag = useCallback(
		(
			drag: GridDragKind,
			point: GridAutoscrollPoint,
			grid: HTMLTableElement,
		) => {
			// A reorder drag has nothing to extend. It re-resolves the gap the
			// pointer names, so scrolling past the edge keeps moving the line
			// through content the pointer itself never travelled over.
			if (drag === "row-reorder" || drag === "column-reorder") {
				reorder.trackReorder(point, grid);
				return;
			}
			if (drag === "fill-row" || drag === "fill-column") {
				fill.trackFill(point, grid);
				return;
			}

			if (drag === "column") {
				const stripCell = grid.querySelector<HTMLElement>(
					"[data-column-header]",
				);
				if (!stripCell) return;
				const stripBox = stripCell.getBoundingClientRect();
				const target = gridTargetAt(
					grid,
					{ x: point.x, y: (stripBox.top + stripBox.bottom) / 2 },
					"[data-column-header]",
				);
				if (!target) return;
				const column = Number(target.dataset.columnHeader);
				if (Number.isInteger(column)) selectColumn(column, "extend");
				return;
			}

			if (drag === "row") {
				const gutterCell = grid.querySelector<HTMLElement>("[data-row-header]");
				if (!gutterCell) return;
				const gutterBox = gutterCell.getBoundingClientRect();
				const target = gridTargetAt(
					grid,
					{ x: (gutterBox.left + gutterBox.right) / 2, y: point.y },
					"[data-row-header]",
				);
				if (!target) return;
				const row = Number(target.dataset.rowHeader);
				if (Number.isInteger(row)) selectRow(row, "extend");
				return;
			}

			const headerCell = grid.querySelector<HTMLElement>('[data-cell="-1:0"]');
			const gutterCell = grid.querySelector<HTMLElement>("[data-row-header]");
			if (!headerCell || !gutterCell) return;
			const headerBox = headerCell.getBoundingClientRect();
			const gutterBox = gutterCell.getBoundingClientRect();
			const target = gridTargetAt(
				grid,
				{
					x: Math.max(point.x, gutterBox.right + 1),
					y: Math.max(point.y, headerBox.bottom + 1),
				},
				"[data-cell]",
			);
			if (!target) return;
			const [row, column] = target.dataset.cell?.split(":").map(Number) ?? [];
			if (
				row === undefined ||
				column === undefined ||
				!Number.isInteger(row) ||
				!Number.isInteger(column)
			)
				return;
			useTabeloStore.getState().extendSelection({ row, column });
		},
		[fill, reorder, selectColumn, selectRow],
	);

	useGridAutoscroll({
		gridRef,
		draggingRef,
		axisOf: autoscrollAxisOf,
		onScroll: extendAutoscrolledDrag,
	});

	const moveFocus = useCallback(
		(rowDelta: number, columnDelta: number, intent: SelectIntent) => {
			const store = useTabeloStore.getState();
			const from = activeRange(store.selection).focus;
			const next = {
				// The floor is the header row: arrows and Shift+arrows reach it, and
				// stop there rather than wrapping or escaping the grid.
				row: Math.max(
					HEADER_ROW,
					Math.min(from.row + rowDelta, store.document.rows.length - 1),
				),
				column: Math.max(
					0,
					Math.min(
						from.column + columnDelta,
						store.document.columns.length - 1,
					),
				),
			};
			if (intent === "extend") store.extendSelection(next);
			else if (intent === "toggle") store.moveFocusKeepingRegions(next);
			else store.selectCell(next);
		},
		[],
	);

	// Editing a header cell is editing the header, but from the keyboard's point
	// of view it is the same gesture as editing any cell: Enter, F2, or just
	// typing. One entry point keeps the two rows behaving alike.
	const beginEditing = useCallback((at: CellPosition, seed?: string) => {
		const store = useTabeloStore.getState();
		if (at.row === HEADER_ROW) store.setEditingHeader(at.column, seed);
		else store.setEditing(at, seed);
	}, []);

	const finishCellEdit = useCallback(
		(
			position: CellPosition,
			next: string,
			exit: EditorExit,
			wasSeeded: boolean,
		) => {
			const store = useTabeloStore.getState();
			if (exit === "cancel") {
				store.setEditing(null);
				return;
			}

			const column = store.document.columns[position.column];
			const row = store.document.rows[position.row];
			if (!column || !row) {
				store.setEditing(null);
				return;
			}

			const current = readCell(row, column.id);
			// Merely opening and committing an unchanged native value is not an
			// instruction to change its type. A printable-key seed is different: it
			// replaced the cell, even when its projection happens to look the same.
			if (!wasSeeded && next === cellText(current)) {
				store.setEditing(null);
				moveAfterCellEdit(position, exit);
				return;
			}

			const parsed = parseExpectedValue(next, column.expectedType);
			if (parsed.kind === "lossy-choice" || parsed.kind === "invalid") {
				const decision: TypedCellDecision = {
					position,
					draft: next,
					expectedType: parsed.expectedType,
					result: parsed,
				};
				store.setEditing(null);
				typedDecisionOutcomeRef.current = null;
				typedDecisionRef.current = decision;
				setTypedDecision(decision);
				setTypedDialogOpen(true);
				return;
			}

			store.editCell(position.row, position.column, parsed.value);
			store.setEditing(null);
			moveAfterCellEdit(position, exit);
		},
		[],
	);

	const handleKeyDown = (event: React.KeyboardEvent<HTMLTableElement>) => {
		const store = useTabeloStore.getState();
		if (store.editing || store.editingHeader !== null) return;

		// The grid's keyboard model belongs to its cells. The chrome around them
		// holds real controls: the row and column select handles and their menu
		// triggers, and a key pressed on one of those is that control's own.
		// Without this the printable-character branch below would swallow Space
		// and the handles could never be activated from the keyboard.
		const target = event.target as HTMLElement | null;
		const targetCell = target?.closest<HTMLElement>("[data-cell]");
		if (target && !targetCell) return;

		const mod = event.metaKey || event.ctrlKey;
		const active = activeRange(selection);

		// Find opens from the grid surface and nowhere else. The early return
		// above already stood the whole handler down while a cell or header
		// editor is open, and a source editor never routes its keys through
		// here, so both keep whatever find behaviour they have. Taken from the
		// browser deliberately: its own find would search the rendered chrome
		// rather than the table, and would miss every value scrolled out of the
		// DOM's view.
		if (mod && event.key.toLowerCase() === "f") {
			event.preventDefault();
			store.openFind();
			return;
		}

		// Shift distinguishes keyboard resizing from the existing Alt+arrow reorder
		// path. The focused column owns the gesture even when the selection spans
		// several cells, matching the pointer handle's exact target.
		if (
			event.altKey &&
			event.shiftKey &&
			(event.key === "ArrowLeft" || event.key === "ArrowRight")
		) {
			event.preventDefault();
			const focusedColumn = Number(
				targetCell?.dataset.cell?.split(":")[1] ?? focus.column,
			);
			const column = store.document.columns[focusedColumn];
			if (!column) return;
			const width = store.workspace.columnWidths[column.id];
			const letter = copy.a11y.columnLetter(focusedColumn);
			if (event.key === "ArrowLeft" && atMinimumColumnWidth(width)) {
				store.announceStatus(copy.status.columnWidthMinimum(letter));
				return;
			}
			if (event.key === "ArrowRight" && atMaximumColumnWidth(width)) {
				store.announceStatus(copy.status.columnWidthMaximum(letter));
				return;
			}
			const next = stepColumnWidth(width, event.key === "ArrowLeft" ? -1 : 1);
			store.resizeColumn(focusedColumn, next, "column");
			store.announceStatus(copy.status.columnWidth(letter, next));
			return;
		}

		if (
			mod &&
			event.altKey &&
			!event.shiftKey &&
			(event.key === "ArrowUp" ||
				event.key === "ArrowDown" ||
				event.key === "ArrowLeft" ||
				event.key === "ArrowRight")
		) {
			event.preventDefault();
			const direction =
				event.key === "ArrowUp"
					? "up"
					: event.key === "ArrowDown"
						? "down"
						: event.key === "ArrowLeft"
							? "left"
							: "right";
			const refusal = runFillDirection(direction);
			if (refusal) {
				store.pushNotice({
					severity: "warning",
					message: fillRefusalMessage[refusal],
				});
			}
			return;
		}

		// Reordering shares the arrow keys with navigation, behind Alt. Keeping
		// it on the keyboard means drag is never the only way to reorder.
		if (event.altKey) {
			if (event.key === "ArrowUp" || event.key === "ArrowDown") {
				event.preventDefault();
				const refusal = store.moveSelectedRow(event.key === "ArrowUp" ? -1 : 1);
				if (refusal) {
					store.pushNotice({
						severity: "warning",
						message: moveRefusalMessage[refusal],
					});
				}
				return;
			}
			if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
				event.preventDefault();
				const refusal = store.moveSelectedColumn(
					event.key === "ArrowLeft" ? -1 : 1,
				);
				if (refusal) {
					store.pushNotice({
						severity: "warning",
						message: moveRefusalMessage[refusal],
					});
				}
				return;
			}
		}

		// Shift extends the active area, the modifier moves the focus without
		// discarding the areas already selected, and a plain arrow replaces them.
		const arrowIntent = selectIntentOf(event);

		switch (event.key) {
			case "ArrowUp":
				event.preventDefault();
				moveFocus(-1, 0, arrowIntent);
				return;
			case "ArrowDown":
				event.preventDefault();
				moveFocus(1, 0, arrowIntent);
				return;
			case "ArrowLeft":
				event.preventDefault();
				moveFocus(0, -1, arrowIntent);
				return;
			case "ArrowRight":
				event.preventDefault();
				moveFocus(0, 1, arrowIntent);
				return;
			case "Tab": {
				const next = adjacentCell(
					focus,
					event.shiftKey ? -1 : 1,
					store.document.rows.length,
					store.document.columns.length,
				);
				event.preventDefault();
				store.selectCell(next);
				return;
			}
			case "Home":
				event.preventDefault();
				store.selectCell({
					row: mod ? HEADER_ROW : focus.row,
					column: 0,
				});
				return;
			case "End":
				event.preventDefault();
				store.selectCell({
					row: mod ? store.document.rows.length - 1 : focus.row,
					column: store.document.columns.length - 1,
				});
				return;
			case "Enter":
				event.preventDefault();
				if (mod) store.addRowBelow();
				else beginEditing(focus);
				return;
			case "F2":
				event.preventDefault();
				beginEditing(focus);
				return;
			case " ":
				// The keyboard equal of a modifier click: add the focused cell's
				// column, or its row with Shift, to the selection, or take it away
				// when it is already there. Ctrl rather than Cmd is what reaches the
				// page on macOS, and the modifier check already accepts both.
				//
				// The focused cell itself is passed through rather than the axis's
				// own origin, because a row or column area spans the other axis
				// whatever its anchor says. That is what leaves the focus where the
				// user left it instead of jumping it to the header row.
				if (!mod) break;
				event.preventDefault();
				store.toggleSelectionRegion(focus, event.shiftKey ? "row" : "column");
				return;
			case "Escape":
				// Close the innermost thing first. The clipboard mark is the most
				// transient thing on screen, so it goes before the selection
				// collapses and long before the pane exits.
				if (store.copiedRanges.length > 0) {
					event.preventDefault();
					store.clearCopiedRanges();
					return;
				}
				// If the selection holds more than one area, or spans multiple
				// cells, collapse it. If it is already a single cell, let the event
				// bubble so the pane frame can exit.
				if (
					selection.ranges.length > 1 ||
					active.anchor.row !== active.focus.row ||
					active.anchor.column !== active.focus.column
				) {
					event.preventDefault();
					store.selectCell(focus);
				}
				return;
			case "Delete":
			case "Backspace":
				// Backspace clears what is in the cells; the modifier removes the
				// rows or columns themselves. Both are prevented from reaching the
				// browser, which historically treated Backspace as "go back".
				event.preventDefault();
				if (mod) {
					const refusal = store.deleteSelectedStructure();
					if (refusal) {
						store.pushNotice({
							severity: "warning",
							message: structureRefusalMessage[refusal],
						});
					}
				} else store.clearSelection();
				return;
			default:
				break;
		}

		// Select-all covers every column, and a column includes its header, so the
		// highlight and the next keystroke agree about the header row.
		if (mod && event.key.toLowerCase() === "a") {
			event.preventDefault();
			store.setSelection({
				ranges: [
					{
						anchor: { row: HEADER_ROW, column: 0 },
						focus: {
							row: HEADER_ROW,
							column: store.document.columns.length - 1,
						},
						mode: "column",
					},
				],
				activeIndex: 0,
			});
			return;
		}

		// A printable character replaces the cell and drops straight into the
		// editor, the way a spreadsheet does: it is the fastest path to typing.
		if (!mod && !event.altKey && event.key.length === 1) {
			event.preventDefault();
			beginEditing(focus, event.key);
		}
	};

	const writeClipboard = (event: React.ClipboardEvent) => {
		const payload = selectionClipboardPayload(
			useTabeloStore.getState().clipboardSelection(),
		);
		event.clipboardData.setData("text/plain", payload.text);
		event.clipboardData.setData("text/html", payload.html);
		event.preventDefault();
	};
	const contentWidth = document.columns.reduce(
		(total, column) => total + resolveColumnWidth(columnWidths[column.id]),
		0,
	);
	const keepTypedEditing = () => {
		typedDecisionOutcomeRef.current = "keep-editing";
		setTypedDialogOpen(false);
	};
	const resolveTypedDecision = (kind: "text" | "typed") => {
		const decision = typedDecisionRef.current;
		if (!decision) return;
		const value =
			kind === "typed" && decision.result.kind === "lossy-choice"
				? decision.result.typedValue
				: decision.draft;
		useTabeloStore
			.getState()
			.editCell(decision.position.row, decision.position.column, value);
		typedDecisionOutcomeRef.current = "resolved";
		setTypedDialogOpen(false);
	};
	const typedDecisionCell = () => {
		const position = typedDecisionRef.current?.position;
		if (!position) return null;
		return (
			gridRef.current?.querySelector<HTMLElement>(
				`[data-cell="${position.row}:${position.column}"]`,
			) ?? null
		);
	};
	const finishTypedDialogTransition = (open: boolean) => {
		if (open) return;
		const decision = typedDecisionRef.current;
		const outcome = typedDecisionOutcomeRef.current;
		typedDecisionRef.current = null;
		typedDecisionOutcomeRef.current = null;
		setTypedDecision(null);
		if (decision && outcome === "keep-editing") {
			useTabeloStore.getState().setEditing(decision.position, decision.draft);
		}
	};

	return (
		<GridContextMenu wrapperRef={wrapperRef}>
			<table
				ref={gridRef}
				// Automatic table layout treats column widths as minimums and lets
				// long content expand them. Fixed layout plus an explicit total makes
				// the colgroup authoritative while preserving per-pane zoom.
				style={{
					width: `calc(var(--grid-gutter-w) + ${contentWidth * zoom}rem)`,
				}}
				// Grid semantics, not document-table semantics: this is an editable
				// widget with its own keyboard model, so assistive technology should
				// treat it that way. `<table role="grid">` is the ARIA Authoring
				// Practices pattern for exactly this; the lint rule is a heuristic that
				// does not model it. See docs/design-system.md §9.
				// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: see above
				role="grid"
				aria-label={copy.a11y.grid}
				aria-rowcount={document.rows.length + 1}
				aria-colcount={document.columns.length}
				className="table-fixed border-separate border-spacing-0 text-content"
				onPointerDownCapture={(event) => {
					const activeEditor = event.currentTarget.ownerDocument.activeElement;
					if (!(activeEditor instanceof HTMLTextAreaElement)) return;
					if (!event.currentTarget.contains(activeEditor)) return;
					if (event.target === activeEditor) return;

					// Cell, header, and axis handlers may cancel pointerdown before the
					// browser can move focus. Drain the editor's one commit owner first,
					// while it is still mounted, then let the receiving handler continue.
					activeEditor.blur();
					if (typedDecisionRef.current) {
						event.preventDefault();
						event.stopPropagation();
					}
				}}
				onKeyDown={handleKeyDown}
				onCopy={(event) => {
					if (useTabeloStore.getState().editing) return;
					writeClipboard(event);
					// The browser performs this write itself, so unlike the menu's
					// permission-gated path there is no outcome to wait for.
					useTabeloStore.getState().markCopiedRanges();
				}}
				onCut={(event) => {
					if (useTabeloStore.getState().editing) return;
					writeClipboard(event);
					// Cut takes the cells away now rather than on paste, so it marks
					// nothing and drops whatever an earlier copy left. Stated here
					// rather than left to the clear below, because clearing cells that
					// are already empty changes no document and so clears no mark.
					useTabeloStore.getState().clearCopiedRanges();
					useTabeloStore.getState().clearSelection();
				}}
				onPaste={(event) => {
					const store = useTabeloStore.getState();
					if (store.editing) return;
					event.preventDefault();
					const refusal = store.pasteClipboard({
						text: event.clipboardData.getData("text/plain"),
						html: event.clipboardData.getData("text/html"),
					});
					if (refusal) {
						store.pushNotice({
							severity: "warning",
							message: pasteRefusalMessage[refusal],
						});
					}
				}}
			>
				<colgroup>
					{/* The gutter holds row numbers and menu affordances rather than
					    table content, so it keeps its size at every zoom level. */}
					<col style={{ width: "var(--grid-gutter-w)" }} />
					{document.columns.map((column) => (
						<col
							key={column.id}
							style={{
								width: `${resolveColumnWidth(columnWidths[column.id]) * zoom}rem`,
							}}
						/>
					))}
				</colgroup>

				<thead>
					{/* The column index strip. It is chrome, like the row-number gutter
					    it mirrors, so role="presentation" keeps it out of the grid's row
					    semantics: it must not count toward aria-rowcount or shift
					    aria-rowindex. Presentation rather than aria-hidden, because the
					    controls it holds have to stay reachable: aria-hidden would remove
					    its descendants from the tree, taking column selection and the
					    column menu with them. The lint rule reads a <tr> inside
					    role="grid" as interactive; removing a chrome row from the row
					    semantics is what role="presentation" is for. See §9. */}
					{/* biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: see above */}
					<tr role="presentation">
						{/* Where the letters meet the row numbers is a dead corner, not a
						    control. */}
						<td
							role="presentation"
							className="sticky top-0 left-0 z-30 h-grid-strip border-line-strong border-r border-b bg-surface-header"
						/>
						{document.columns.map((column, columnIndex) => (
							<ColumnIndexCell
								key={column.id}
								axisMenuHandle={axisMenuHandle}
								columnIndex={columnIndex}
								header={column.header}
								expectedType={column.expectedType}
								focused={focus.column === columnIndex}
								width={resolveColumnWidth(columnWidths[column.id])}
								zoom={zoom}
								onSelect={(intent) => selectColumn(columnIndex, intent)}
								onDragStart={() => {
									draggingRef.current = "column";
								}}
								onDragEnter={() => {
									if (draggingRef.current !== "column") return;
									selectColumn(columnIndex, "extend");
								}}
								onGripPointerDown={reorder.onGripPointerDown}
							/>
						))}
					</tr>

					<tr
						// biome-ignore lint/a11y/noRedundantRoles: see the tbody rows
						role="row"
						aria-rowindex={1}
						className="group/row h-content-line-box"
					>
						<th
							scope="row"
							// biome-ignore lint/a11y/noRedundantRoles: see the tbody rows
							role="rowheader"
							aria-label={copy.a11y.headerRow}
							// Right-clicking row 1 offers row actions like any other row.
							// Before the strip existed this lookup found nothing and the
							// menu fell through to cell actions on a non-cell.
							data-row-header={HEADER_ROW}
							className="sticky top-grid-strip left-0 z-30 border-line-strong border-r border-b border-b-line-subtle bg-surface-gutter px-1 text-right align-top font-index font-normal text-muted-foreground text-xs tabular-nums"
							onPointerEnter={() => {
								if (draggingRef.current !== "row") return;
								selectRow(HEADER_ROW, "extend");
							}}
						>
							<div className="grid h-content-line-box grid-cols-[1.25rem_minmax(0,1fr)_1.25rem] items-center gap-1">
								{/* No reorder grip: every table keeps exactly one header row
								    and it is always the first, so there is nowhere for it to
								    go. The track stays so its number lines up with every
								    other one. */}
								<span aria-hidden="true" />
								<button
									type="button"
									tabIndex={entered ? 0 : -1}
									aria-label={`${copy.actions.selectRow}: ${copy.a11y.headerRow}`}
									className="min-w-0 cursor-pointer justify-self-end rounded-interactive px-1 text-right hover:text-foreground"
									onPointerDown={(event) => {
										if (event.button !== 0) return;
										draggingRef.current = "row";
										selectRow(HEADER_ROW, selectIntentOf(event));
									}}
									onClick={(event) => {
										// A keyboard-generated click has no pointer detail.
										if (event.detail === 0)
											selectRow(HEADER_ROW, selectIntentOf(event));
									}}
								>
									1
								</button>
								<AxisMenuTrigger
									handle={axisMenuHandle}
									axis="row"
									index={HEADER_ROW}
									revealed={focus.row === HEADER_ROW}
								/>
							</div>
						</th>
						{document.columns.map((column, columnIndex) => (
							<HeaderCell
								key={column.id}
								columnIndex={columnIndex}
								header={column.header}
								align={column.align}
								wrapped={wrappedColumns.includes(column.id)}
								selected={rects.some((candidate) =>
									rectContains(candidate, HEADER_ROW, columnIndex),
								)}
								copiedEdges={clipboardEdgesAt(
									copiedAt,
									HEADER_ROW,
									columnIndex,
								)}
								focus={focus.row === HEADER_ROW && focus.column === columnIndex}
								editing={editingHeader === columnIndex}
								seed={editingSeed}
								markStart={
									match?.row === HEADER_ROW && match.column === columnIndex
										? match.start
										: NO_MARK
								}
								markEnd={
									match?.row === HEADER_ROW && match.column === columnIndex
										? match.end
										: NO_MARK
								}
							/>
						))}
					</tr>
				</thead>

				<tbody>
					{document.rows.map((row, rowIndex) => (
						// Every selection prop is narrowed to this row's own membership
						// before it crosses the memo boundary. Passing the shared focus
						// and the regions instead would change all 200 rows' props on
						// every arrow key, which is the case the boundary exists to skip:
						// a row outside the selection keeps the same empty spans and is
						// reconciled away.
						<DataRow
							key={row.id}
							row={row}
							rowIndex={rowIndex}
							columns={document.columns}
							axisMenuHandle={axisMenuHandle}
							focused={focus.row === rowIndex}
							focusColumn={focus.row === rowIndex ? focus.column : NO_COLUMN}
							selectedSpans={spansOf(rects, rowIndex)}
							// Narrowed for the same reason, and to primitives for the
							// same reason: the copied areas outlive the selection, so a
							// row outside them must keep props that do not change.
							//
							// Three rows' worth, because a cell's top and bottom edges
							// come from whether the cell above or below it is copied
							// too, and a row cannot see its neighbours from behind the
							// memo boundary.
							copiedSpans={spansOf(copiedRanges, rowIndex)}
							copiedSpansAbove={spansOf(copiedRanges, rowIndex - 1)}
							copiedSpansBelow={spansOf(copiedRanges, rowIndex + 1)}
							// The current find match, narrowed to this row: at most one
							// row in the table carries it, so every other row keeps the
							// same three values and is reconciled away.
							markColumn={match?.row === rowIndex ? match.column : NO_COLUMN}
							markStart={match?.row === rowIndex ? match.start : NO_MARK}
							markEnd={match?.row === rowIndex ? match.end : NO_MARK}
							editingColumn={
								editing?.row === rowIndex ? editing.column : NO_COLUMN
							}
							editingSeed={editing?.row === rowIndex ? editingSeed : null}
							wrappedColumns={wrappedColumns}
							selectRow={selectRow}
							onFinishCellEdit={finishCellEdit}
							draggingRef={draggingRef}
							onGripPointerDown={reorder.onGripPointerDown}
						/>
					))}
				</tbody>
			</table>

			{fillSource ? (
				<FillHandle
					gridRef={gridRef}
					wrapperRef={wrapperRef}
					source={fillSource}
					corner={focus}
					onPointerDown={fill.onHandlePointerDown}
				/>
			) : null}
			<FillPreview setterRef={setFillPreviewRef} />

			{/* Drawn against the positioned wrapper rather than the table, because a
			    table cannot hold a non-table child. It scrolls with the table, so
			    the geometry needs no scroll arithmetic of its own. */}
			<AxisDropIndicator setterRef={setIndicatorRef} />

			{/* The one root behind every gutter trigger above. It sits outside the
			    table so it is never a child of a <tr>, and it portals its popup
			    anyway, so its position in the tree carries no layout. */}
			<AxisMenuPopupHost handle={axisMenuHandle} />
			<TypedCellDecisionDialog
				decision={typedDecision}
				open={typedDialogOpen}
				finalFocus={typedDecisionCell}
				onKeepEditing={keepTypedEditing}
				onKeepText={() => resolveTypedDecision("text")}
				onConvert={() => resolveTypedDecision("typed")}
				onOpenChangeComplete={finishTypedDialogTransition}
			/>
		</GridContextMenu>
	);
}

// One data row, behind a memo boundary. `TableGrid` re-renders on every parse
// commit, and without this React reconciled all 200 rows to discover that 199
// of them were identical. Every prop is a primitive, a stable callback, a ref,
// or an object `reconcileDocument` preserves the identity of, so the default
// shallow comparator is enough and no custom `areEqual` can drift out of sync
// with what this actually reads.
//
// The selection arrives already narrowed to this row: the column spans this row
// covers rather than the whole set of regions, and this row's focused and
// editing columns rather than the grid's. That is what makes an arrow key
// re-render two rows instead of two hundred.
interface DataRowProps {
	readonly row: Row;
	readonly rowIndex: number;
	readonly columns: readonly Column[];
	readonly axisMenuHandle: AxisMenuHandle;
	readonly focused: boolean;
	// This row's focused and editing columns, or NO_COLUMN.
	readonly focusColumn: number;
	// This row's selected column spans, as "left:right" pairs. A string rather
	// than an array because it has to compare by value at the memo boundary, and
	// a row can sit inside several areas at once.
	readonly selectedSpans: string;
	// The copied areas in the same encoding, for this row and for the two either
	// side of it. Primitives for the same reason as the line above, and three of
	// them because a cell's top and bottom edges are drawn from whether its
	// neighbour there is copied too, which this row cannot see for itself.
	readonly copiedSpans: string;
	readonly copiedSpansAbove: string;
	readonly copiedSpansBelow: string;
	// The column holding the current find match, or NO_COLUMN, and the half-open
	// range of that cell's text it covers.
	readonly markColumn: number;
	readonly markStart: number;
	readonly markEnd: number;
	readonly editingColumn: number;
	// The character that opened the editor, when typing is what opened it.
	readonly editingSeed: string | null;
	readonly wrappedColumns: readonly ColumnId[];
	readonly selectRow: (row: number, intent: SelectIntent) => void;
	readonly onFinishCellEdit: (
		position: CellPosition,
		value: string,
		exit: EditorExit,
		wasSeeded: boolean,
	) => void;
	readonly draggingRef: React.RefObject<GridDragKind | null>;
	readonly onGripPointerDown: AxisReorderController["onGripPointerDown"];
}

const DataRow = memo(function DataRow({
	row,
	rowIndex,
	columns,
	axisMenuHandle,
	focused,
	focusColumn,
	selectedSpans,
	copiedSpans,
	copiedSpansAbove,
	copiedSpansBelow,
	markColumn,
	markStart,
	markEnd,
	editingColumn,
	editingSeed,
	wrappedColumns,
	selectRow,
	onFinishCellEdit,
	draggingRef,
	onGripPointerDown,
}: DataRowProps) {
	// Read here rather than threaded down, matching ColumnIndexCell and
	// HeaderCell, and preserving today's behaviour of every row reacting
	// together when pane entry changes.
	const entered = usePaneEntered();

	// The copied region as far as this row can see it, which is exactly as far
	// as the edge rule ever asks: the cell itself and its four neighbours.
	const copiedAt = (row: number, column: number) => {
		if (row === rowIndex) return coveredBySpans(copiedSpans, column);
		if (row === rowIndex - 1) return coveredBySpans(copiedSpansAbove, column);
		if (row === rowIndex + 1) return coveredBySpans(copiedSpansBelow, column);
		return false;
	};

	return (
		// Explicit despite looking redundant: with role="grid" on the
		// table, browsers do not reliably expose implicit row and cell
		// roles: the computed tree came back as "generic" without these.
		<tr
			// biome-ignore lint/a11y/noRedundantRoles: see above
			role="row"
			// The header row is row 1, so the body starts at 2. This is
			// what makes the declared aria-rowcount add up.
			aria-rowindex={rowIndex + 2}
			className="group/row"
		>
			<th
				scope="row"
				// biome-ignore lint/a11y/noRedundantRoles: see above
				role="rowheader"
				// The heading a screen reader reads as the row context for
				// every cell beside it, so it names the row rather than
				// concatenating the two controls it contains.
				aria-label={copy.a11y.rowNumber(rowIndex)}
				data-row-header={rowIndex}
				className={cn(
					"sticky left-0 z-10 border-line-subtle border-r border-b bg-surface-gutter align-top",
					"px-1 text-right font-index font-normal text-muted-foreground text-xs tabular-nums",
				)}
				onPointerEnter={() => {
					if (draggingRef.current !== "row") return;
					selectRow(rowIndex, "extend");
				}}
			>
				<div className="grid h-content-line-box grid-cols-[1.25rem_minmax(0,1fr)_1.25rem] items-center gap-1">
					<AxisReorderGrip
						axis="row"
						index={rowIndex}
						revealed={focused}
						onPointerDown={onGripPointerDown}
					/>
					<button
						type="button"
						tabIndex={entered ? 0 : -1}
						aria-label={`${copy.actions.selectRow}: ${copy.a11y.rowNumber(rowIndex)}`}
						className="min-w-0 cursor-pointer justify-self-end rounded-interactive px-1 text-right hover:text-foreground"
						onPointerDown={(event) => {
							if (event.button !== 0) return;
							draggingRef.current = "row";
							selectRow(rowIndex, selectIntentOf(event));
						}}
						onClick={(event) => {
							// A keyboard-generated click has no pointer detail.
							if (event.detail === 0)
								selectRow(rowIndex, selectIntentOf(event));
						}}
					>
						{rowIndex + 2}
					</button>
					<span className="inline-flex">
						<AxisMenuTrigger
							handle={axisMenuHandle}
							axis="row"
							index={rowIndex}
							revealed={focused}
						/>
					</span>
				</div>
			</th>

			{columns.map((column, columnIndex) => {
				const isFocus = columnIndex === focusColumn;
				const inSelection = coveredBySpans(selectedSpans, columnIndex);
				const copiedEdges = clipboardEdgesAt(copiedAt, rowIndex, columnIndex);
				const cellValue = readCell(row, column.id);
				const value = cellText(cellValue);
				const type = cellValueType(cellValue);
				const divergent = cellTypeDiverges(cellValue, column.expectedType);
				const describesType = type !== "string" || divergent;
				const isEditing = columnIndex === editingColumn;
				const wrapped = wrappedColumns.includes(column.id);

				return (
					// gridcell is stated rather than left implicit, for the same
					// reason as the row role above: without it the computed
					// accessibility tree reported these cells as "generic".
					<td
						key={column.id}
						// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: see above
						role="gridcell"
						data-cell={`${rowIndex}:${columnIndex}`}
						data-cell-type={type}
						data-cell-type-divergent={divergent ? "true" : undefined}
						data-grid-active={isFocus ? "true" : undefined}
						tabIndex={isFocus && entered ? 0 : -1}
						aria-selected={inSelection}
						aria-colindex={columnIndex + 1}
						// Deliberately unlabelled: the cell's name is its value,
						// and the row and column headers supply the rest. An
						// aria-label here would replace the content with
						// coordinates and repeat them on every arrow key.
						//
						// The one native tooltip the product keeps. A cell shows
						// a clipped value, and the browser's own tooltip reveals
						// the rest without mounting a floating layer per cell
						// across a 200-row table. See docs/design-system.md §3.
						title={value || undefined}
						className={cn(
							"relative border-line-subtle border-r border-b px-2 align-top",
							"cursor-cell select-none",
							// A cell being edited overrides the column's own clipping so
							// its editor can grow and wrap over the rows below it while
							// the value is too long for the column, without touching
							// the wrap preference or any other row's height.
							isEditing ? "z-20 overflow-visible" : "overflow-hidden",
							alignClass[column.align],
							inSelection ? "bg-selection-fill" : "bg-background",
							isFocus && "outline-2 outline-selection-edge -outline-offset-2",
						)}
						onPointerDown={(event) => {
							if (event.button !== 0) return;
							// Without this, the browser's own mousedown handling runs
							// after ours and moves focus to <body>, because a <td> is
							// not focusable by default. The cell would look selected
							// but ignore every keystroke.
							event.preventDefault();
							draggingRef.current = "cell";
							const store = useTabeloStore.getState();
							const at = { row: rowIndex, column: columnIndex };
							const intent = selectIntentOf(event);
							if (intent === "extend") store.extendSelection(at);
							else if (intent === "toggle")
								store.toggleSelectionRegion(at, "cell");
							else store.selectCell(at);
							event.currentTarget.focus();
						}}
						onPointerEnter={() => {
							if (draggingRef.current !== "cell") return;
							useTabeloStore.getState().extendSelection({
								row: rowIndex,
								column: columnIndex,
							});
						}}
						onDoubleClick={() =>
							useTabeloStore
								.getState()
								.setEditing({ row: rowIndex, column: columnIndex })
						}
					>
						{isEditing ? (
							<CellEditor
								initialValue={editingSeed ?? value}
								align={alignClass[column.align]}
								ariaLabel={`${copy.a11y.cellEditor(rowIndex, columnIndex)}${describesType ? `, ${copy.a11y.realCellType(type)}` : ""}`}
								monospace={type !== "string"}
								onFinish={(next, exit) =>
									onFinishCellEdit(
										{ row: rowIndex, column: columnIndex },
										next,
										exit,
										editingSeed !== null,
									)
								}
							/>
						) : (
							<span
								data-column-content={columnIndex}
								className={cn(
									"grid grid-cols-[minmax(0,1fr)_auto] items-start gap-1 leading-content-line-box",
									wrapped
										? "min-h-grid-row"
										: "h-content-line-box overflow-hidden",
								)}
							>
								<span
									data-cell-value
									className={cn(
										"min-w-0",
										wrapped
											? "whitespace-pre-wrap break-words"
											: "overflow-hidden whitespace-pre",
										type !== "string" && "font-value",
									)}
								>
									{columnIndex === markColumn
										? markedValue(value, markStart, markEnd)
										: value}
									{describesType ? (
										<span className="sr-only">
											{`, ${copy.a11y.realCellType(type)}`}
										</span>
									) : null}
								</span>
								{divergent ? <CellTypeMark type={type} context="cell" /> : null}
							</span>
						)}
						{copiedEdges ? <ClipboardSourceEdge {...copiedEdges} /> : null}
					</td>
				);
			})}
		</tr>
	);
});

// One cell of the column index strip. It carries the column's positional
// letter, which for an unnamed column is the only identity it has, and it owns
// every affordance that used to crowd the header text: selection, the column
// menu, and the resize handle.
interface ColumnIndexCellProps {
	readonly axisMenuHandle: AxisMenuHandle;
	readonly columnIndex: number;
	readonly header: string;
	readonly expectedType: ExpectedColumnType;
	// The column the user is working in, which is where its actions appear.
	readonly focused: boolean;
	// The stored width is in rem. Zoom scales what is rendered, so the drag
	// gesture converts viewport pixels back before writing a width down.
	readonly width: number;
	readonly zoom: number;
	readonly onSelect: (intent: SelectIntent) => void;
	readonly onDragStart: () => void;
	readonly onDragEnter: () => void;
	readonly onGripPointerDown: AxisReorderController["onGripPointerDown"];
}

function zoomNormalizedNaturalWidth(
	element: HTMLElement,
	zoom: number,
): number {
	const style = getComputedStyle(element);
	const clone = element.cloneNode(true) as HTMLElement;
	clone.removeAttribute("data-column-content");
	Object.assign(clone.style, {
		position: "fixed",
		top: "0",
		left: "-10000px",
		visibility: "hidden",
		pointerEvents: "none",
		width: "max-content",
		maxWidth: "none",
		height: "auto",
		overflow: "visible",
		whiteSpace: "pre",
		fontFamily: style.fontFamily,
		fontSize: `${Number.parseFloat(style.fontSize) / zoom}px`,
		fontStyle: style.fontStyle,
		fontWeight: style.fontWeight,
		fontStretch: style.fontStretch,
		fontKerning: style.fontKerning,
		fontFeatureSettings: style.fontFeatureSettings,
		fontVariationSettings: style.fontVariationSettings,
		letterSpacing: style.letterSpacing,
		wordSpacing: style.wordSpacing,
		textTransform: style.textTransform,
	});
	document.body.append(clone);
	try {
		// Measure at the product's base content size, then express that value in
		// the current zoomed coordinate space for fitColumnWidth to normalize.
		// This avoids variable-font optical sizing changing stored widths when the
		// same text is fitted in panes with different content scales.
		return clone.scrollWidth * zoom;
	} finally {
		clone.remove();
	}
}

function ColumnIndexCell({
	axisMenuHandle,
	columnIndex,
	header,
	expectedType,
	focused,
	width,
	zoom,
	onSelect,
	onDragStart,
	onDragEnter,
	onGripPointerDown,
}: ColumnIndexCellProps) {
	const cellRef = useRef<HTMLTableCellElement>(null);
	const resizeState = useRef<{
		startX: number;
		startWidth: number;
		rootFontSize: number;
	} | null>(null);
	const letter = copy.a11y.columnLetter(columnIndex);
	const entered = usePaneEntered();
	const measureFitWidth = () => {
		const cell = cellRef.current;
		const table = cell?.closest("table");
		if (!cell || !table) return undefined;
		const content = Array.from(
			table.querySelectorAll<HTMLElement>(
				`[data-column-content="${columnIndex}"]`,
			),
		);
		if (content.length === 0) return undefined;
		const box = content[0]?.parentElement;
		if (!box) return undefined;
		const boxStyle = getComputedStyle(box);
		const decorationWidth = [
			boxStyle.paddingLeft,
			boxStyle.paddingRight,
			boxStyle.borderLeftWidth,
			boxStyle.borderRightWidth,
		].reduce((total, value) => total + (Number.parseFloat(value) || 0), 0);
		const rootFontSize = Number.parseFloat(
			getComputedStyle(document.documentElement).fontSize,
		);
		return fitColumnWidth(
			Math.max(
				...content.map((element) => zoomNormalizedNaturalWidth(element, zoom)),
			),
			rootFontSize,
			zoom,
			decorationWidth,
		);
	};

	return (
		<td
			ref={cellRef}
			role="presentation"
			data-column-header={columnIndex}
			data-column-letter={letter}
			data-expected-type={expectedType}
			// `sticky` already establishes the containing block the resize handle
			// positions against, so no `relative` here: it would win over `sticky`
			// and turn the offset into a shift rather than a scroll threshold.
			className={cn(
				"group/col sticky top-0 z-20 h-grid-strip border-line-strong border-r border-b",
				"bg-surface-header px-1 text-center font-index font-normal text-muted-foreground text-xs",
			)}
			onPointerEnter={onDragEnter}
		>
			{/* A fixed track on each side keeps the letter centred on the cell
			    itself rather than on the space left over after the menu trigger,
			    the same anchoring technique the row-number gutter uses below to
			    keep its digits put regardless of the control beside them. The
			    leading track balanced the trigger's width on the other side and
			    was empty; the reorder grip now occupies it, so the letter stays
			    exactly where it was. */}
			<div className="grid h-full grid-cols-[1.25rem_minmax(0,1fr)_1.25rem] items-center gap-1">
				<AxisReorderGrip
					axis="column"
					index={columnIndex}
					revealed={focused}
					onPointerDown={onGripPointerDown}
				/>
				{/* The handle for the whole column. It names itself after the column it
				    selects, falling back to the letter when the header is empty, which
				    is the same rule the header cell announces by. */}
				<button
					type="button"
					tabIndex={entered ? 0 : -1}
					aria-label={`${copy.actions.selectColumn}: ${copy.a11y.columnWithExpectedType(header, columnIndex, expectedType)}`}
					className="min-w-0 cursor-pointer truncate rounded-interactive px-1 text-center hover:text-foreground"
					onPointerDown={(event) => {
						if (event.button !== 0) return;
						onDragStart();
						onSelect(selectIntentOf(event));
					}}
					onClick={(event) => {
						// A keyboard-generated click has no pointer detail.
						if (event.detail === 0) onSelect(selectIntentOf(event));
					}}
				>
					<span className="inline-flex min-w-0 items-center gap-1">
						<span className="truncate">{letter}</span>
						<CellTypeMark
							type={expectedCellValueType(expectedType)}
							context="column"
						/>
					</span>
				</button>
				<AxisMenuTrigger
					handle={axisMenuHandle}
					axis="column"
					index={columnIndex}
					revealed={focused}
					measureFitWidth={measureFitWidth}
				/>
			</div>

			{/* Pointer-only by design, and hidden from assistive technology. The
			    focused grid column has Alt+Shift+Left/Right as its keyboard equal. */}
			<div
				aria-hidden
				className="absolute top-0 right-0 z-20 h-full w-2 cursor-col-resize touch-none hover:bg-selection-edge/40"
				onPointerDown={(event) => {
					event.preventDefault();
					event.currentTarget.setPointerCapture(event.pointerId);
					resizeState.current = {
						startX: event.clientX,
						startWidth: width,
						rootFontSize: Number.parseFloat(
							getComputedStyle(document.documentElement).fontSize,
						),
					};
				}}
				onPointerMove={(event) => {
					const state = resizeState.current;
					if (!state) return;
					useTabeloStore
						.getState()
						.resizeColumn(
							columnIndex,
							clampColumnWidth(
								state.startWidth +
									(event.clientX - state.startX) / (state.rootFontSize * zoom),
							),
						);
				}}
				onPointerUp={(event) => {
					event.currentTarget.releasePointerCapture(event.pointerId);
					resizeState.current = null;
				}}
			/>
		</td>
	);
}

// The header cell holds editable text and nothing else. Selecting the column
// and opening its menu belong to the index strip above, so this behaves like
// the data cells below it: click to select, double click or F2 to edit,
// Backspace to clear.
interface HeaderCellProps {
	readonly columnIndex: number;
	readonly header: string;
	readonly align: Alignment;
	readonly wrapped: boolean;
	readonly selected: boolean;
	// A column selection reaches the header row, so a copied column marks it too.
	readonly copiedEdges: ClipboardEdges | null;
	readonly focus: boolean;
	readonly editing: boolean;
	// The character that opened the editor, when typing is what opened it.
	readonly seed: string | null;
	// The half-open range of this header's text the current find match covers.
	// Equal bounds mean it holds no match.
	readonly markStart: number;
	readonly markEnd: number;
}

function HeaderCell({
	columnIndex,
	header,
	align,
	wrapped,
	selected,
	copiedEdges,
	focus,
	editing,
	seed,
	markStart,
	markEnd,
}: HeaderCellProps) {
	const entered = usePaneEntered();

	return (
		<th
			scope="col"
			// biome-ignore lint/a11y/noRedundantRoles: see the tbody rows
			role="columnheader"
			// The name a screen reader reads as the column context for every cell
			// below it. An empty header falls back to its letter from the strip, so
			// the announcement is never silent and no content is invented.
			aria-label={copy.a11y.columnHeader(header, columnIndex)}
			aria-colindex={columnIndex + 1}
			aria-selected={selected}
			// Address as a cell, because it is one for selection purposes: this is
			// what lets arrows, Shift+arrows, Tab, and the focus effect treat the
			// header row like any other row.
			data-cell={`${HEADER_ROW}:${columnIndex}`}
			data-grid-active={focus ? "true" : undefined}
			tabIndex={focus && entered ? 0 : -1}
			className={cn(
				// No `relative` here, even though the clipboard mark below is
				// absolutely positioned: `sticky` is already the containing block it
				// resolves against, and the later rule would win and turn the sticky
				// offset into a static shift. Same rule as the column resize handle.
				//
				// The boundary under the header row is a row boundary like any other,
				// so it takes the subtle line while the sides keep the strong one the
				// chrome around them draws.
				"sticky z-20 border-line-strong border-r border-b border-b-line-subtle align-top",
				"cursor-cell select-none px-2 font-semibold",
				// Sticks below the index strip rather than at the very top, so the
				// two chrome layers stack instead of covering one another.
				"top-grid-strip",
				// See the data cell's identical rule: editing overrides clipping so a
				// header longer than its column can grow and wrap while it's being
				// typed, without changing the column's wrap preference.
				editing ? "overflow-visible" : "overflow-hidden",
				alignClass[align],
				// Both fills are the sticky compositions rather than the bare tints:
				// body rows scroll under this cell, and a translucent fill would let
				// their text read through it. See index.css.
				selected ? "bg-sticky-selection-fill" : "bg-sticky-table-header",
				focus && "outline-2 outline-selection-edge -outline-offset-2",
			)}
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				// A <th> is not focusable by default, so without this the browser's
				// own mousedown handling moves focus to <body> after ours runs and
				// the cell would look selected while ignoring every keystroke.
				event.preventDefault();
				const store = useTabeloStore.getState();
				const at = { row: HEADER_ROW, column: columnIndex };
				const intent = selectIntentOf(event);
				if (intent === "extend") store.extendSelection(at);
				else if (intent === "toggle") store.toggleSelectionRegion(at, "cell");
				else store.selectCell(at);
				event.currentTarget.focus();
			}}
			onDoubleClick={() =>
				useTabeloStore.getState().setEditingHeader(columnIndex)
			}
		>
			{editing ? (
				<CellEditor
					initialValue={seed ?? header}
					align={alignClass[align]}
					ariaLabel={copy.a11y.headerEditor(header, columnIndex)}
					onFinish={(next, exit) => {
						const store = useTabeloStore.getState();
						if (exit !== "cancel") store.editHeader(columnIndex, next);
						store.setEditingHeader(null);
					}}
				/>
			) : (
				<span
					data-column-content={columnIndex}
					className={cn(
						"block leading-content-line-box",
						wrapped
							? "min-h-grid-row whitespace-pre-wrap break-words"
							: "h-content-line-box overflow-hidden whitespace-pre",
					)}
				>
					{markedValue(header, markStart, markEnd)}
				</span>
			)}
			{copiedEdges ? <ClipboardSourceEdge {...copiedEdges} /> : null}
		</th>
	);
}
