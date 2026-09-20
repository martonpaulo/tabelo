import { cn } from "@tabelo/ui/lib/utils";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { selectionClipboardPayload } from "@/clipboard/serialize";
import { copy } from "@/copy/copy";
import { cellText, cellValuesEqual, readCell } from "@/core/cell-value";
import {
	isInlineContent,
	isTextContent,
	sliceInline,
} from "@/core/inline-content";
import { dataEdgeTarget, type JumpDirection } from "@/core/navigation";
import {
	activeRange,
	type CellPosition,
	type CellRect,
	coversAtLeast,
	HEADER_ROW,
	neighbourCell,
	rectContains,
	replaceActiveRange,
	selectionFillRefusal,
	selectionRect,
	selectionRects,
} from "@/core/selection";
import {
	type ExpectedTypeParseResult,
	parseExpectedValue,
} from "@/core/typed-input";
import type {
	Alignment,
	CellValue,
	Column,
	ColumnId,
	ExpectedColumnType,
	InlineContent,
	Row,
	TextContent,
} from "@/core/types";
import {
	currentMatch,
	gridFind,
	type InsertedAxis,
	type PasteRefusal,
	type StructureDeletionRefusal,
	useTabeloStore,
} from "@/state/store";
import {
	InlineContentView,
	type InlineSurface,
} from "@/ui/inline/inline-content";
import { usePaneEntered } from "@/ui/workspace/use-pane-entry";
import { usePaneFind } from "@/ui/workspace/use-pane-find";
import {
	atMaximumColumnWidth,
	atMinimumColumnWidth,
	clampColumnWidth,
	resolveColumnWidth,
	stepColumnWidth,
} from "@/workspace/column-width";
import { AxisDropIndicator } from "./axis-drop-indicator";
import { CellEditor, type EditorExit, wrappedLinesClass } from "./cell-editor";
import {
	cellTypeDiverges,
	cellTypePresentationClass,
	cellValueType,
	expectedCellValueType,
} from "./cell-type";
import { CellTypeMark } from "./cell-type-mark";
import { ColumnWidthDialog } from "./column-width-dialog";
import { FillHandle } from "./fill-handle";
import { FillPreview, type FillPreviewSetter } from "./fill-preview";
import {
	cellCommandRefusal,
	isLinkKey,
	markForKey,
	runSelectionMark,
	singleCellTarget,
	wholeCellImageRequest,
	wholeCellLinkRequest,
} from "./format-commands";
import { GridContextMenu } from "./grid-context-menu";
import { autoscrollAxisOf, type GridDragKind, gridTargetAt } from "./grid-drag";
import {
	ImageDialog,
	type ImageRequest,
	LinkDialog,
	type LinkRequest,
} from "./inline-dialogs";
import { revealGridCell } from "./reveal-cell";
import { RichCellEditor } from "./rich-cell-editor";
import { coveredBySpans, decodeSpans, spansOf } from "./selection-spans";
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
	movableAxis,
	useAxisReorder,
} from "./use-axis-reorder";
import { useFillDrag } from "./use-fill-drag";
import {
	type GridAutoscrollPoint,
	useGridAutoscroll,
} from "./use-grid-autoscroll";
import { usePinnedAxes } from "./use-pinned-axes";
import { useSelectionGlide } from "./use-selection-glide";

// Where the selection is, marked on the chrome at the grid's edge. Never the
// selection fill: that colour means selected data, and the letters and numbers
// are controls, so painting them alike made the gutter read as part of the
// selection. They take a full-strength, heavier label instead, with no band of
// their own in the modern table (owner, 2026-09-19), and never touch a line.
// See docs/design-system.md.
const selectedAxisClass = "font-semibold text-foreground";

// How a row or column an insert command just added arrives: from the side of
// the insertion point it was added on, a quarter of a rem away and
// transparent. Written out rather than composed from a distance, because
// Tailwind reads these class names out of the source and never sees one built
// at runtime. The animation itself, and what reduced motion does with it, are
// in index.css.
const insertMotionClass = {
	row: {
		before: "insert-in [--insert-from-y:-0.25rem]",
		after: "insert-in [--insert-from-y:0.25rem]",
	},
	column: {
		before: "insert-in [--insert-from-x:-0.25rem]",
		after: "insert-in [--insert-from-x:0.25rem]",
	},
} as const;

// The side an inserted row or column arrives from, or nothing when this one
// was not part of the last insert command.
type InsertedFrom = InsertedAxis["from"] | null;

function insertionSide(
	inserted: InsertedAxis | null,
	id: string,
): InsertedFrom {
	return inserted?.ids.includes(id) ? inserted.from : null;
}

// A row number or column letter is the only control on its label (#288), and
// the cursor is what tells its two gestures apart: `pointer` selects, and once
// the row or column is in the selection a press picks it up to move instead,
// with `grabbing` held for as long as the button is.
function axisLabelCursor(movable: boolean): string {
	return movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer";
}

// Every row is one row pitch tall, the `--spacing-content-line-box` a source
// line is, so the grid and a source pane beside it keep step row for row
// (owner, 2026-09-19). A cell's line under its row is a border, and a border
// adds to the height, which made every grid row one hairline taller and put
// the two views a row apart every 32 rows. So the content of every cell in a
// row, the row number, a header cell, and a data cell alike, wrapped or not,
// gives that hairline back by reaching over the line beneath it: the row line
// is drawn inside the pitch. Nothing is painted there, since a line box
// centres its text, and the marks on a cell's edge are placed from the cell,
// not its content, so they stay where they were.
const rowLineInside = "-mb-hairline";

// A row number fills its gutter cell, so the whole cell is the target and the
// gutter needs no width beyond the digits and the gaps around them (#288). The
// trailing gap and the cell's own leading padding add up to the index gap a
// source view keeps between a line number and its text.
function axisNumberClass(movable: boolean): string {
	return cn(
		"flex h-content-line-box w-full items-center justify-end rounded-interactive pr-grid-gutter-trailing pl-1 text-right hover:text-foreground",
		rowLineInside,
		axisLabelCursor(movable),
	);
}

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

// Where every mark on a cell's edge is drawn (#365): on the grid lines around
// the cell, the lines included. A cell owns the lines on its right and bottom,
// and its neighbours own the ones on its left and top, so a mark kept inside
// its own cell stops one line short of a mark in the next cell and the two
// never meet. So a mark always covers the cell's own right and bottom lines,
// and reaches one hairline back over the top and left lines when an ordinary
// cell owns them. When sticky chrome owns that line instead (the header row
// above the first data row, the index strip above the header, the gutter
// beside the first column, a pinned row or column), the chrome paints over
// the reach and would leave that side one hairline thinner, so the mark stays
// inside there. The cell lets the hairline through with `cell-clip`
// (index.css); the fill preview follows the same rule from its own geometry.
//
// No z-index: a mark paints above its own cell because it comes last in it,
// and a pinned or sticky layer still covers it when the cell scrolls beneath.
function cellMarkClass(reachTop: boolean, reachLeft: boolean) {
	return cn(
		"pointer-events-none absolute -right-hairline -bottom-hairline",
		reachTop ? "-top-hairline" : "top-0",
		reachLeft ? "-left-hairline" : "left-0",
	);
}

// The marks a cell draws on its own edges: the solid focus line, and the
// dashes showing which cells the clipboard was last filled from. Both are drawn
// by the cells themselves rather than by one floating rectangle over the table:
// the cells already resolve per-pane zoom, column resizing, wrapped row
// heights, and the two sticky chrome layers, and a measured overlay would have
// to reproduce all four and keep them in step.
//
// Both marks are drawn where they are and stay there. The focus mark travels
// between cells, but it does so through one stand-in over the surface rather
// than by moving here (use-selection-glide.ts), and static status does not
// pulse: see docs/design-system.md §7. The dash pattern,
// not the colour, is what distinguishes the copied mark from the solid focus
// line, so the mark does not depend on colour alone.
//
// A focused cell inside the copied range shows both, as one two-tone border:
// the solid focus line on all four sides, and the dashes over it in the
// foreground colour on the range's outer sides, a static two-tone marquee.
// Focus is a child here rather than the cell's outline, because a browser
// paints an element's outline over its children, so the dashes would vanish
// under it (#223, #349), and an outline cannot reach the neighbour's line.
function CellMarks({
	copied,
	focused,
	reachTop,
	reachLeft,
}: {
	readonly copied: ClipboardEdges | null;
	readonly focused: boolean;
	// Whether the lines above and to the left belong to an ordinary cell; see
	// cellMarkClass.
	readonly reachTop: boolean;
	readonly reachLeft: boolean;
}) {
	const place = cellMarkClass(reachTop, reachLeft);
	// Preflight leaves every border at zero width, so naming the style once and
	// then only the sides that exist draws exactly those sides.
	const sides =
		copied &&
		cn(
			copied.top && "border-t-2",
			copied.right && "border-r-2",
			copied.bottom && "border-b-2",
			copied.left && "border-l-2",
		);
	return (
		<>
			{focused ? (
				<span
					aria-hidden
					data-focus-mark
					className={cn(place, "border-2 border-selection-edge")}
				/>
			) : null}
			{copied ? (
				<span
					aria-hidden
					// The technical contract the browser suite reads: which cells carry
					// the mark, and which of them own an edge of it. There is no ARIA
					// state for "the clipboard came from here", and inventing one on a
					// gridcell would replace the cell's name with it. See
					// docs/design-system/9-accessibility.md.
					data-clipboard-source={
						[
							copied.top && "top",
							copied.right && "right",
							copied.bottom && "bottom",
							copied.left && "left",
						]
							.filter(Boolean)
							.join(" ") || "inside"
					}
					className={cn(
						place,
						"border-dashed",
						focused ? "border-foreground" : "border-selection-edge",
						sides,
					)}
				/>
			) : null}
		</>
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
// find bar rather than to the cell. See docs/design-system/9-accessibility.md.
//
// Formatted content is cut the same way, through the core's own slice, so the
// mark sits inside the formatting and a match that touches an image marks the
// whole image (#306).
function markedValue(
	value: TextContent,
	start: number,
	end: number,
	surface: InlineSurface,
) {
	if (start >= end)
		return <InlineContentView value={value} surface={surface} />;
	const length = cellText(value).length;
	return (
		<>
			<InlineContentView
				value={sliceInline(value, 0, start)}
				surface={surface}
			/>
			<span data-find-current className="bg-primary text-primary-foreground">
				<InlineContentView
					value={sliceInline(value, start, end)}
					surface={surface}
				/>
			</span>
			<InlineContentView
				value={sliceInline(value, end, length)}
				surface={surface}
			/>
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

// Whether a pointer landed on a rendered link inside a cell, which Mod+click
// opens instead of toggling the cell in the selection (#306).
function isOnLink(target: EventTarget | null): boolean {
	return (
		target instanceof Element && target.closest("[data-inline-link]") !== null
	);
}

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

// The next cell in reading order. The walk wraps with a modulo over the whole
// grid, so the last cell leads back to the first and Tab never runs out: focus
// stays inside the grid and leaves it only through the pane's own Escape. The
// caller always prevents the default, which is what stops the browser taking
// the key away at an edge.
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

const jumpDirections: Record<string, JumpDirection | undefined> = {
	ArrowUp: "up",
	ArrowDown: "down",
	ArrowLeft: "left",
	ArrowRight: "right",
};

function moveAfterCellEdit(position: CellPosition, exit: EditorExit) {
	const store = useTabeloStore.getState();
	if (exit === "next-row") {
		store.selectCell({
			row: Math.min(position.row + 1, store.document.rows.length - 1),
			column: position.column,
		});
	} else if (exit === "previous-row") {
		// Row 1 is the header, which is a cell like any other to move onto.
		store.selectCell({
			row: Math.max(position.row - 1, HEADER_ROW),
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

// How one column enters a draft typed over several selected cells, by the
// single-cell rule: formatted text is text by the user's own choice
// (docs/adr/0011), and anything else goes through the column's expected type.
type SpreadEntry =
	| ExpectedTypeParseResult
	| { readonly kind: "formatted"; readonly value: InlineContent };

function spreadEntry(
	draft: TextContent,
	expectedType: ExpectedColumnType,
): SpreadEntry {
	return isInlineContent(draft)
		? { kind: "formatted", value: draft }
		: parseExpectedValue(draft, expectedType);
}

// The value a column receives. A draft the column cannot take unambiguously
// follows the user's answer to the one question asked for the whole selection,
// and is kept as text when there is no typed reading to convert to, exactly the
// outcome the single-cell dialog offers for that draft.
function spreadValue(
	entry: SpreadEntry,
	choice: "text" | "typed" | null,
): CellValue {
	switch (entry.kind) {
		case "formatted":
		case "typed":
		case "escaped-string":
			return entry.value;
		case "lossy-choice":
			return choice === "typed" ? entry.typedValue : entry.stringValue;
		case "invalid":
			return entry.stringValue;
	}
}

// Writes one committed draft into every selected cell as one history step and
// says how many it reached, since only the edited cell shows it happen.
function writeSpread(draft: TextContent, choice: "text" | "typed" | null) {
	const store = useTabeloStore.getState();
	const { columns } = store.document;
	const count = store.writeSelectedCells({
		header: draft,
		cell: (columnIndex) => {
			const column = columns[columnIndex];
			return column
				? spreadValue(spreadEntry(draft, column.expectedType), choice)
				: draft;
		},
	});
	store.announceStatus(copy.status.cellsSet(count));
}

export function TableGrid({ zoom }: { readonly zoom: number }) {
	const document = useTabeloStore((state) => state.document);
	const selection = useTabeloStore((state) => state.selection);
	const editing = useTabeloStore((state) => state.editing);
	const editingSeed = useTabeloStore((state) => state.editingSeed);
	const editingHeader = useTabeloStore((state) => state.editingHeader);
	const copiedRanges = useTabeloStore((state) => state.copiedRanges);
	// What the last insert command added, if the last change to the document was
	// one. Kept as the store's own object so the reference is stable between
	// renders and every row outside it is still reconciled away at the memo
	// boundary below.
	const inserted = useTabeloStore((state) => state.insertedAxis);
	const insertedRows = inserted?.axis === "row" ? inserted : null;
	const insertedColumns = inserted?.axis === "column" ? inserted : null;
	const match = useTabeloStore((state) => currentMatch(gridFind(state)));
	const paneFind = usePaneFind();
	const copiedAt = (row: number, column: number) =>
		coveredByRects(copiedRanges, row, column);
	const wrappedColumns = useTabeloStore(
		(state) => state.workspace.wrappedColumns,
	);
	// Every cell asks whether its column wraps, so the question is answered by
	// membership. Memoized on the store's own array, so the set's identity is
	// as stable as the array's and each row is still reconciled away at the
	// memo boundary.
	const wrappedColumnSet = useMemo(
		() => new Set(wrappedColumns),
		[wrappedColumns],
	);
	const columnWidths = useTabeloStore((state) => state.workspace.columnWidths);
	const pinFirstDataRow = useTabeloStore(
		(state) => state.workspace.pinFirstDataRow,
	);
	const pinFirstDataColumn = useTabeloStore(
		(state) => state.workspace.pinFirstDataColumn,
	);
	const entered = usePaneEntered();

	// Pinning the only row or the only column holds it in place against nothing,
	// so the layer is simply not drawn. The preference is kept either way: it
	// becomes effective on its own once the table grows past one.
	const pinnedRow = pinFirstDataRow && document.rows.length > 1;
	const pinnedColumn = pinFirstDataColumn && document.columns.length > 1;

	const gridRef = useRef<HTMLTableElement>(null);
	const wrapperRef = useRef<HTMLDivElement>(null);
	// The column index strip. Held separately because "focus is in the grid" is
	// the table plus this strip, and the surface around them holds one control
	// that has never counted: see the focus-handoff effect below.
	const stripRef = useRef<HTMLDivElement>(null);
	const draggingRef = useRef<GridDragKind | null>(null);
	// Written by the drop indicator when it mounts, so a reorder drag repaints
	// one element rather than the whole table on every pointer move.
	const setIndicatorRef = useRef<DropIndicatorSetter | null>(null);
	const setFillPreviewRef = useRef<FillPreviewSetter | null>(null);
	const [typedDecision, setTypedDecision] = useState<TypedCellDecision | null>(
		null,
	);
	const [typedDialogOpen, setTypedDialogOpen] = useState(false);
	// The column whose exact width is being typed (#370). The ref outlives the
	// closing state so focus can return to that column's header after the
	// dialog's exit transition, when the state is already null.
	// The Format group's dialogs (#306). Each request carries what its answer
	// does and where focus goes back, so a whole cell and a range being edited
	// share them.
	const [linkRequest, setLinkRequest] = useState<LinkRequest | null>(null);
	const [imageRequest, setImageRequest] = useState<ImageRequest | null>(null);
	const cellElement = useCallback(
		(position: CellPosition) =>
			gridRef.current?.querySelector<HTMLElement>(
				`[data-cell="${position.row}:${position.column}"]`,
			) ?? null,
		[],
	);
	const openCellLink = useCallback(
		(position: CellPosition) =>
			setLinkRequest(
				wholeCellLinkRequest(position, () => cellElement(position)),
			),
		[cellElement],
	);
	const openCellImage = useCallback(
		(position: CellPosition) =>
			setImageRequest(
				wholeCellImageRequest(position, () => cellElement(position)),
			),
		[cellElement],
	);
	const [widthDialogColumn, setWidthDialogColumn] = useState<number | null>(
		null,
	);
	const widthDialogColumnRef = useRef<number | null>(null);
	const openWidthDialog = useCallback((column: number) => {
		widthDialogColumnRef.current = column;
		setWidthDialogColumn(column);
	}, []);
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
	// The rows and columns a press on their label would pick up and move, which
	// is what their `grab` cursor says (#288).
	// Membership rather than a scan: every row asks whether it is in the block,
	// and with the whole table selected that was one pass per row.
	const movableRows = new Set(
		movableAxis(
			selection,
			"row",
			document.rows.length,
			document.columns.length,
		),
	);
	const movableColumns = movableAxis(
		selection,
		"column",
		document.rows.length,
		document.columns.length,
	);
	const headerRowSelected = rects.some(
		(rect) => HEADER_ROW >= rect.top && HEADER_ROW <= rect.bottom,
	);
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

	// The focus mark's travel between cells. It reads the marks the cells draw
	// and owns one element over the surface; nothing else about the selection
	// changes. See use-selection-glide.
	const glideRef = useSelectionGlide(wrapperRef, gridRef, focus);

	// Keep DOM focus on the focused cell, but never steal it from the source
	// panel or a menu: follow the selection only when focus is already inside
	// the grid, or when an edit just finished and left focus with nobody.
	//
	// "Inside the grid" is the table plus the column index strip, which is the
	// boundary that held while the strip was still a row of the table. Selecting
	// a column from the strip is exactly the case this handoff exists for: the
	// grid's keyboard model lives on the table, so a selection made from a strip
	// control has to move focus there or the next key reaches a button that
	// answers none of them.
	//
	// Not the whole surface, which is the wider box the two share with the fill
	// handle. That handle fills by keyboard from where it stands, so it was
	// deliberately outside this test before the strip moved and stays outside it
	// now: including it would pull focus off the handle after its first fill.
	// Everything else stands down as it always did, a menu having portalled its
	// popup out, the find bar being the surface's sibling, and another pane
	// being elsewhere entirely.

	// Deleting the focused cell's row or column removes the element that holds
	// focus, and the browser hands focus to the body, where every later key
	// reaches nobody. A focusout whose target is gone a moment later is that
	// removal rather than the user leaving, so focus goes to the cell that now
	// stands at the focused position. Leaving by click or Tab keeps its target
	// in the document and is left alone.
	const focusRef = useRef(focus);
	focusRef.current = focus;
	useEffect(() => {
		const grid = gridRef.current;
		if (!grid) return;
		const onFocusOut = (event: FocusEvent) => {
			const left = event.target;
			if (!(left instanceof HTMLElement) || event.relatedTarget) return;
			queueMicrotask(() => {
				if (left.isConnected) return;
				const active = window.document.activeElement;
				if (active && active !== window.document.body) return;
				const { row, column } = focusRef.current;
				grid
					.querySelector<HTMLElement>(`[data-cell="${row}:${column}"]`)
					?.focus({ preventScroll: true });
			});
		};
		grid.addEventListener("focusout", onFocusOut);
		return () => grid.removeEventListener("focusout", onFocusOut);
	}, []);

	useEffect(() => {
		const isEditing = editing !== null || editingHeader !== null;
		const justFinishedEditing = wasEditingRef.current && !isEditing;
		wasEditingRef.current = isEditing;
		if (isEditing) return;

		const grid = gridRef.current;
		const surface = wrapperRef.current;
		if (!grid || !surface) return;
		const active = window.document.activeElement;
		const insideGrid =
			grid.contains(active) || stripRef.current?.contains(active) === true;
		if (!insideGrid && !justFinishedEditing) return;

		const target = grid.querySelector<HTMLElement>(
			`[data-cell="${focus.row}:${focus.column}"]`,
		);
		if (!target) return;
		// The grid scrolls the cell into view itself, so focus is told not to:
		// letting both run would scroll twice, and the browser's own attempt is
		// the one that leaves the cell under the sticky gutter.
		target.focus({ preventScroll: true });
		// Rebuilt from the two coordinates rather than passing `focus` itself:
		// the effect must not wake on a selection object that carries the same
		// focused cell, which is what listing the members keeps it from doing.
		revealGridCell(surface, target, { row: focus.row, column: focus.column });
	}, [focus.row, focus.column, editing, editingHeader]);

	// Stepping to a match moves the selection while the find bar keeps the
	// caret, so the effect above stands down: focus is not in the grid. The
	// match still has to be brought into view, and clear of the sticky chrome
	// rather than merely on screen, which is the contract #141 established.
	useEffect(() => {
		const grid = gridRef.current;
		const surface = wrapperRef.current;
		if (!grid || !surface || !match) return;
		const target = grid.querySelector<HTMLElement>(
			`[data-cell="${match.row}:${match.column}"]`,
		);
		if (target) revealGridCell(surface, target, match);
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
		surfaceRef: wrapperRef,
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
		(drag: GridDragKind, point: GridAutoscrollPoint, surface: HTMLElement) => {
			// A reorder drag has nothing to extend. It re-resolves the gap the
			// pointer names, so scrolling past the edge keeps moving the line
			// through content the pointer itself never travelled over.
			if (drag === "row-reorder" || drag === "column-reorder") {
				reorder.trackReorder(point, surface);
				return;
			}
			if (drag === "fill-row" || drag === "fill-column") {
				fill.trackFill(point, surface);
				return;
			}

			if (drag === "column") {
				const stripCell = surface.querySelector<HTMLElement>(
					"[data-column-header]",
				);
				if (!stripCell) return;
				const stripBox = stripCell.getBoundingClientRect();
				const target = gridTargetAt(
					surface,
					{ x: point.x, y: (stripBox.top + stripBox.bottom) / 2 },
					"[data-column-header]",
				);
				if (!target) return;
				const column = Number(target.dataset.columnHeader);
				if (Number.isInteger(column)) selectColumn(column, "extend");
				return;
			}

			if (drag === "row") {
				const gutterCell =
					surface.querySelector<HTMLElement>("[data-row-header]");
				if (!gutterCell) return;
				const gutterBox = gutterCell.getBoundingClientRect();
				const target = gridTargetAt(
					surface,
					{ x: (gutterBox.left + gutterBox.right) / 2, y: point.y },
					"[data-row-header]",
				);
				if (!target) return;
				const row = Number(target.dataset.rowHeader);
				if (Number.isInteger(row)) selectRow(row, "extend");
				return;
			}

			const headerCell =
				surface.querySelector<HTMLElement>('[data-cell="-1:0"]');
			const gutterCell =
				surface.querySelector<HTMLElement>("[data-row-header]");
			if (!headerCell || !gutterCell) return;
			const headerBox = headerCell.getBoundingClientRect();
			const gutterBox = gutterCell.getBoundingClientRect();
			const target = gridTargetAt(
				surface,
				{
					x: Math.max(point.x, gutterBox.right + 1),
					// Clamped to the header's own top rather than below it. What this
					// has to stay off is the column-index strip above the header,
					// which owns no cell; the header row itself is an ordinary
					// endpoint of a cell rectangle, so excluding it made an
					// autoscrolling header drag sample the first data row instead of
					// the header under the pointer, and quietly pull data rows into a
					// header-only selection.
					y: Math.max(point.y, headerBox.top + 1),
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
		surfaceRef: wrapperRef,
		draggingRef,
		axisOf: autoscrollAxisOf,
		onScroll: extendAutoscrolledDrag,
	});

	usePinnedAxes({
		gridRef,
		pinnedRow,
		pinnedColumn,
		document,
		zoom,
		columnWidths,
		wrappedColumns,
	});

	const moveFocus = useCallback(
		(direction: JumpDirection, intent: "replace" | "extend") => {
			const store = useTabeloStore.getState();
			const from = activeRange(store.selection).focus;
			// One bounded step, through the same helper the menu's own focus
			// moves use, so the two paths stop at the same edges. A step off the
			// grid keeps the cell it started from: arrows stop at the edge rather
			// than wrapping or leaving the grid.
			const next =
				neighbourCell(
					from,
					direction,
					store.document.rows.length,
					store.document.columns.length,
				) ?? from;
			if (intent === "extend") store.extendSelection(next);
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

	// Typing over several selected cells writes into every one of them, the way
	// the source views put one caret in each (owner, 2026-09-19). The editor
	// still opens on the focused cell alone; this is what its commit does when
	// the selection is larger. Returns false when the selection is that one
	// cell, which the single-cell paths below own.
	const commitToSelection = useCallback(
		(origin: CellPosition, next: TextContent, wasSeeded: boolean): boolean => {
			const store = useTabeloStore.getState();
			const { document } = store;
			const rects = selectionRects(
				store.selection,
				document.rows.length,
				document.columns.length,
			);
			if (!coversAtLeast(rects, 2)) return false;

			const close = () => {
				if (origin.row === HEADER_ROW) store.setEditingHeader(null);
				else store.setEditing(null);
			};
			// The single-cell rule: opening and committing without typing anything
			// is not an edit, so it writes nothing anywhere.
			const originRow = document.rows[origin.row];
			const originColumn = document.columns[origin.column];
			if (!originColumn) {
				close();
				return true;
			}
			const current =
				origin.row === HEADER_ROW
					? originColumn.header
					: originRow
						? readCell(originRow, originColumn.id)
						: "";
			const unchanged = isTextContent(current)
				? cellValuesEqual(next, current)
				: next === cellText(current);
			if (!wasSeeded && unchanged) {
				close();
				return true;
			}

			// A column that cannot take the draft unambiguously is asked about once
			// for the whole selection, preferring the column the user is typing in.
			const decisionColumns = new Set<number>();
			for (const rect of rects) {
				if (rect.bottom === HEADER_ROW) continue;
				for (let column = rect.left; column <= rect.right; column++) {
					decisionColumns.add(column);
				}
			}
			const ordered = [
				origin.column,
				...[...decisionColumns].filter((column) => column !== origin.column),
			].filter((column) => decisionColumns.has(column));
			for (const columnIndex of ordered) {
				const column = document.columns[columnIndex];
				if (!column) continue;
				const entry = spreadEntry(next, column.expectedType);
				if (entry.kind !== "lossy-choice" && entry.kind !== "invalid") continue;
				const decision: TypedCellDecision = {
					position: origin,
					draft: entry.stringValue,
					expectedType: entry.expectedType,
					result: entry,
					spread: true,
				};
				close();
				typedDecisionOutcomeRef.current = null;
				typedDecisionRef.current = decision;
				setTypedDecision(decision);
				setTypedDialogOpen(true);
				return true;
			}

			writeSpread(next, null);
			close();
			return true;
		},
		[],
	);

	const finishCellEdit = useCallback(
		(
			position: CellPosition,
			next: TextContent,
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

			if (commitToSelection(position, next, wasSeeded)) return;

			const current = readCell(row, column.id);
			// Merely opening and committing an unchanged native value is not an
			// instruction to change its type. A printable-key seed is different: it
			// replaced the cell, even when its projection happens to look the same.
			// Text is compared with its formatting, since removing every mark from
			// a cell is a change even though it reads the same (#306).
			const unchanged = isTextContent(current)
				? cellValuesEqual(next, current)
				: next === cellText(current);
			if (!wasSeeded && unchanged) {
				store.setEditing(null);
				moveAfterCellEdit(position, exit);
				return;
			}

			// Formatted text is text by the user's own choice, so the column's
			// expected type has nothing to convert (docs/adr/0011).
			if (isInlineContent(next)) {
				store.editCell(position.row, position.column, next);
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
					spread: false,
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
		[commitToSelection],
	);

	const finishHeaderEdit = useCallback(
		(
			columnIndex: number,
			next: TextContent,
			exit: EditorExit,
			wasSeeded: boolean,
		) => {
			const store = useTabeloStore.getState();
			if (exit === "cancel") {
				store.setEditingHeader(null);
				return;
			}
			if (
				commitToSelection(
					{ row: HEADER_ROW, column: columnIndex },
					next,
					wasSeeded,
				)
			) {
				return;
			}
			// An unchanged commit is not an edit, formatting included.
			const content = store.document.columns[columnIndex]?.header;
			if (content !== undefined && !cellValuesEqual(next, content)) {
				store.editHeader(columnIndex, next);
			}
			store.setEditingHeader(null);
		},
		[commitToSelection],
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
		// Which cardinal direction this key is, or nothing when it is not an
		// arrow at all. Several branches below ask, so it is asked once.
		const arrowDirection = jumpDirections[event.key];

		// Inline formatting (#306): a mark chord formats the complete text of
		// every selected textual cell as one history step, and Mod+K opens the
		// link dialog for the one selected cell. Each says why when it cannot.
		const mark = markForKey(event);
		if (mark) {
			event.preventDefault();
			runSelectionMark(mark);
			return;
		}
		if (isLinkKey(event)) {
			event.preventDefault();
			const refusal = cellCommandRefusal(store.document, selection, "link");
			const target = singleCellTarget(selection);
			if (refusal || !target) {
				store.pushNotice({
					severity: "warning",
					message: refusal ?? copy.disabled.linkSingleCell,
				});
				return;
			}
			openCellLink(target);
			return;
		}

		// Find opens this pane's bar from the grid surface. The early return
		// above already stood the whole handler down while a cell or header
		// editor is open, so the editor keeps every key. Taken from the browser
		// deliberately: its own find would search the rendered chrome rather
		// than the table, and would miss every value scrolled out of the DOM's
		// view. The other panes take it at their own surfaces (#280).
		if (mod && event.key.toLowerCase() === "f") {
			event.preventDefault();
			paneFind.open();
			return;
		}

		// The grid's counterpart of a source editor's next occurrence (#361),
		// claimed on every press for the same reason it is there: an outcome that
		// depended on whether a match existed would bookmark the page one press
		// and select a cell the next.
		if (
			mod &&
			!event.shiftKey &&
			!event.altKey &&
			event.key.toLowerCase() === "d"
		) {
			event.preventDefault();
			const { selected, total } = store.selectNextMatchingCell();
			if (total > 0) {
				store.announceStatus(
					copy.workspace.occurrencesSelected(selected, total),
				);
			}
			return;
		}

		// Shift distinguishes keyboard resizing from the existing Alt+arrow reorder
		// path. The focused column owns the gesture even when the selection spans
		// several cells, matching the pointer handle's exact target.
		if (
			!mod &&
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

		// Reordering shares the arrow keys with navigation, behind Alt alone.
		// Keeping it on the keyboard means drag is never the only way to
		// reorder. The two other modifiers are excluded rather than ignored:
		// a permissive test here would quietly re-adopt a chord section 9 no
		// longer allows, which is exactly how Mod+Alt+Shift+arrow would have
		// gone on reordering after its own branch was removed.
		if (event.altKey && !mod && !event.shiftKey) {
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

		// Every Alt+arrow chord this grid owns has been offered its branch by
		// now: reorder, fill, and column width. What is left is unassigned, so
		// it returns without preventing the browser's default rather than
		// falling into ordinary navigation below. Mod+Alt+Shift+arrow, which
		// used to move the focus, is the combination this keeps inert.
		if (event.altKey && arrowDirection) return;

		// The modifier jumps to the edge of the data, which is the one thing
		// every spreadsheet puts on this chord. The rule is in `dataEdgeTarget`;
		// Shift sends the same target through the ordinary extension path, so an
		// extended jump and a Shift+arrow build the same kind of area.
		//
		// Alt is excluded because the branches above already spent Alt+arrow on
		// reordering and Mod+Alt+arrow on filling.
		if (mod && !event.altKey && arrowDirection) {
			event.preventDefault();
			const target = dataEdgeTarget(store.document, focus, arrowDirection);
			if (event.shiftKey) store.extendSelection(target);
			else store.selectCell(target);
			return;
		}

		// Shift extends the active area from its anchor, and a plain arrow
		// replaces it. The modifier never reaches here: the jump above took it.
		const arrowIntent = event.shiftKey ? "extend" : "replace";

		switch (event.key) {
			case "ArrowUp":
				event.preventDefault();
				moveFocus("up", arrowIntent);
				return;
			case "ArrowDown":
				event.preventDefault();
				moveFocus("down", arrowIntent);
				return;
			case "ArrowLeft":
				event.preventDefault();
				moveFocus("left", arrowIntent);
				return;
			case "ArrowRight":
				event.preventDefault();
				moveFocus("right", arrowIntent);
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
				// One symmetric family rather than four unrelated keys: Mod
				// inserts a row, Alt inserts a column, and Shift flips which side
				// of the selection the new line lands on. Every one of the four
				// routes to the same store action the insert menu uses, so both
				// paths are one history step, and none exceeds three keys.
				//
				// The two modifiers are exclusive, so the retired
				// Mod+Alt+(Shift+)Enter neither inserts nor falls through into
				// editing: it is unassigned and left to the browser.
				if (mod && event.altKey) return;
				event.preventDefault();
				if (mod) {
					if (event.shiftKey) store.addRowAbove();
					else store.addRowBelow();
				} else if (event.altKey) {
					if (event.shiftKey) store.addColumnLeft();
					else store.addColumnRight();
				} else beginEditing(focus);
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

	// Selecting a column by its letter or a row by its number leaves focus on
	// that handle, so typing there would otherwise reach nobody. A printable key
	// types over the selection exactly as it does from a cell: the editor opens
	// on the focused cell and the commit writes every selected cell. Space and
	// Enter stay the handle's own, since they are what activates a button.
	const typeOverAxisSelection = useCallback(
		(event: React.KeyboardEvent) => {
			const store = useTabeloStore.getState();
			if (store.editing || store.editingHeader !== null) return;
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if (event.key.length !== 1 || event.key === " ") return;
			event.preventDefault();
			beginEditing(activeRange(store.selection).focus, event.key);
		},
		[beginEditing],
	);

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
	// The one width model both siblings of the grid surface are laid out from:
	// the strip's grid tracks and the table's colgroup read the same numbers, so
	// a letter can never drift from the column it names. The gutter keeps its
	// token size at every zoom level; only content columns scale.
	const columnTrack = (column: Column) =>
		`${resolveColumnWidth(columnWidths[column.id]) * zoom}rem`;
	const surfaceWidth = `calc(var(--grid-gutter-w) + ${contentWidth * zoom}rem)`;
	const keepTypedEditing = () => {
		typedDecisionOutcomeRef.current = "keep-editing";
		setTypedDialogOpen(false);
	};
	const resolveTypedDecision = (kind: "text" | "typed") => {
		const decision = typedDecisionRef.current;
		if (!decision) return;
		typedDecisionOutcomeRef.current = "resolved";
		if (decision.spread) {
			writeSpread(decision.draft, kind);
			setTypedDialogOpen(false);
			return;
		}
		const value =
			kind === "typed" && decision.result.kind === "lossy-choice"
				? decision.result.typedValue
				: decision.draft;
		useTabeloStore
			.getState()
			.editCell(decision.position.row, decision.position.column, value);
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
			beginEditing(decision.position, decision.draft);
		}
	};

	return (
		<GridContextMenu
			wrapperRef={wrapperRef}
			tableRef={gridRef}
			zoom={zoom}
			onSetColumnWidth={openWidthDialog}
			onLink={openCellLink}
			onImage={openCellImage}
		>
			{/* The strip and the table are siblings, and these three events belong to
			    both of them: an editor is committed by a pointer press anywhere on
			    the grid surface, and the clipboard follows focus, which a strip
			    control can hold. `contents` generates no box, so the strip still
			    resolves its sticky position against the surface itself and the
			    rendered layout is exactly what the two siblings declare. */}
			<div
				className="contents"
				onPointerDownCapture={(event) => {
					const activeEditor = event.currentTarget.ownerDocument.activeElement;
					if (
						!(activeEditor instanceof HTMLElement) ||
						!activeEditor.hasAttribute("data-cell-editor")
					) {
						return;
					}
					if (!event.currentTarget.contains(activeEditor)) return;
					if (
						event.target instanceof Node &&
						activeEditor.contains(event.target)
					) {
						return;
					}

					// Cell, header, and axis handlers may cancel pointerdown before the
					// browser can move focus. Drain the editor's one commit owner first,
					// while it is still mounted, then let the receiving handler continue.
					activeEditor.blur();
					if (typedDecisionRef.current) {
						event.preventDefault();
						event.stopPropagation();
					}
				}}
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
				{/* The column index strip. It is chrome, like the row-number gutter it
				    mirrors, so it sits beside the table rather than inside it: the
				    controls it holds are neither a `row` nor a `rowgroup`, and those
				    are the only children `role="grid"` may own. Marking the row
				    presentational did not help, because ARIA's conflict resolution
				    discards a presentational role precisely when the element holds
				    controls, and it then re-parented them into the grid. See
				    docs/design-system/9-accessibility.md. */}
				<div
					ref={stripRef}
					data-column-strip
					className="sticky top-0 z-30 grid h-grid-strip"
					style={{
						width: surfaceWidth,
						gridTemplateColumns: `var(--grid-gutter-w) ${document.columns
							.map(columnTrack)
							.join(" ")}`,
					}}
				>
					{/* Where the letters meet the row numbers is a dead corner, not a
					    control. */}
					<div
						className={cn(
							"sticky left-0 z-30 border-r border-r-transparent bg-surface-code",
							!pinnedColumn && "edge-while-scrolled-x",
						)}
					/>
					{document.columns.map((column, columnIndex) => (
						<ColumnIndexCell
							key={column.id}
							columnIndex={columnIndex}
							header={cellText(column.header)}
							expectedType={column.expectedType}
							selected={rects.some(
								(rect) => columnIndex >= rect.left && columnIndex <= rect.right,
							)}
							movable={movableColumns.includes(columnIndex)}
							insertedFrom={insertionSide(insertedColumns, column.id)}
							width={resolveColumnWidth(columnWidths[column.id])}
							zoom={zoom}
							pinned={pinnedColumn && columnIndex === 0}
							onSelect={(intent) => selectColumn(columnIndex, intent)}
							onTypeOverAxis={typeOverAxisSelection}
							onDragStart={() => {
								draggingRef.current = "column";
							}}
							onDragEnter={() => {
								if (draggingRef.current !== "column") return;
								selectColumn(columnIndex, "extend");
							}}
							onAxisPointerDown={reorder.onAxisPointerDown}
						/>
					))}
				</div>

				<table
					ref={gridRef}
					// Automatic table layout treats column widths as minimums and lets
					// long content expand them. Fixed layout plus an explicit total makes
					// the colgroup authoritative while preserving per-pane zoom.
					style={{ width: surfaceWidth }}
					// Grid semantics, not document-table semantics: this is an editable
					// widget with its own keyboard model, so assistive technology should
					// treat it that way. `<table role="grid">` is the ARIA Authoring
					// Practices pattern for exactly this; the lint rule is a heuristic that
					// does not model it. See docs/design-system/9-accessibility.md.
					// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: see above
					role="grid"
					aria-label={copy.a11y.grid}
					aria-rowcount={document.rows.length + 1}
					aria-colcount={document.columns.length}
					className="tabelo-grid table-fixed border-separate border-spacing-0 text-content"
					onKeyDown={handleKeyDown}
				>
					<colgroup>
						{/* The gutter holds row numbers and menu affordances rather than
					    table content, so it keeps its size at every zoom level. */}
						<col style={{ width: "var(--grid-gutter-w)" }} />
						{document.columns.map((column) => (
							<col key={column.id} style={{ width: columnTrack(column) }} />
						))}
					</colgroup>

					<thead>
						<tr
							// biome-ignore lint/a11y/noRedundantRoles: see the tbody rows
							role="row"
							aria-rowindex={1}
							className="h-content-line-box"
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
								className={cn(
									"sticky top-grid-strip left-0 z-30 border-r border-r-transparent border-b border-b-transparent bg-surface-code p-0 text-right align-top font-index font-normal text-muted-foreground text-xs tabular-nums",
									// The gutter's edge appears only while content scrolls
									// under it; a pinned column carries its own edge instead.
									!pinnedColumn && "edge-while-scrolled-x",
									headerRowSelected && selectedAxisClass,
								)}
								data-axis-selected={headerRowSelected || undefined}
								onPointerEnter={() => {
									if (draggingRef.current !== "row") return;
									selectRow(HEADER_ROW, "extend");
								}}
							>
								{/* Select only: every table keeps exactly one header row and
								    it is always the first, so there is nowhere for it to move. */}
								<button
									type="button"
									tabIndex={entered ? 0 : -1}
									aria-label={copy.a11y.selectHeaderRow}
									onKeyDown={typeOverAxisSelection}
									className={axisNumberClass(false)}
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
							</th>
							{document.columns.map((column, columnIndex) => (
								<HeaderCell
									key={column.id}
									columnIndex={columnIndex}
									header={cellText(column.header)}
									content={column.header}
									align={column.align}
									wrapped={wrappedColumnSet.has(column.id)}
									pinned={pinnedColumn && columnIndex === 0}
									afterPinnedColumn={pinnedColumn && columnIndex === 1}
									insertedFrom={insertionSide(insertedColumns, column.id)}
									selected={rects.some((candidate) =>
										rectContains(candidate, HEADER_ROW, columnIndex),
									)}
									copiedEdges={clipboardEdgesAt(
										copiedAt,
										HEADER_ROW,
										columnIndex,
									)}
									focus={
										focus.row === HEADER_ROW && focus.column === columnIndex
									}
									editing={editingHeader === columnIndex}
									seed={editingSeed}
									onFinishEdit={finishHeaderEdit}
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
									onRequestLink={setLinkRequest}
									onRequestImage={setImageRequest}
									onDragStart={() => {
										draggingRef.current = "cell";
									}}
									onDragEnter={() => {
										if (draggingRef.current !== "cell") return;
										useTabeloStore.getState().extendSelection({
											row: HEADER_ROW,
											column: columnIndex,
										});
									}}
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
								movable={movableRows.has(rowIndex)}
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
								wrappedColumns={wrappedColumnSet}
								insertedFrom={insertionSide(insertedRows, row.id)}
								insertedColumns={insertedColumns}
								pinnedRow={pinnedRow && rowIndex === 0}
								pinnedColumn={pinnedColumn}
								belowPinnedRow={pinnedRow && rowIndex === 1}
								selectRow={selectRow}
								onTypeOverAxis={typeOverAxisSelection}
								onFinishCellEdit={finishCellEdit}
								onRequestLink={setLinkRequest}
								onRequestImage={setImageRequest}
								draggingRef={draggingRef}
								onAxisPointerDown={reorder.onAxisPointerDown}
							/>
						))}
					</tbody>
				</table>
			</div>

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

			{/* The focus mark on its way between two cells. It stands in for the
			    real mark, which the arriving cell draws and which is hidden for
			    exactly as long as this is up, and it carries the same two edges in
			    the same colour. Above the header row and the cells, under the
			    gutter and the index strip, which are chrome the mark passes beneath
			    exactly as a cell's own mark does. See use-selection-glide. */}
			<div
				ref={glideRef}
				aria-hidden
				data-selection-glide
				className="pointer-events-none absolute top-0 left-0 z-20 hidden border-2 border-selection-edge transition-transform duration-(--motion-selection) ease-(--motion-ease)"
			/>

			{/* Drawn against the positioned wrapper rather than the table, because a
			    table cannot hold a non-table child. It scrolls with the table, so
			    the geometry needs no scroll arithmetic of its own. */}
			<AxisDropIndicator setterRef={setIndicatorRef} />

			<ColumnWidthDialog
				column={widthDialogColumn}
				onClose={() => setWidthDialogColumn(null)}
				finalFocus={() =>
					gridRef.current?.querySelector<HTMLElement>(
						`[data-cell="${HEADER_ROW}:${widthDialogColumnRef.current}"]`,
					) ?? null
				}
			/>
			<LinkDialog request={linkRequest} onClose={() => setLinkRequest(null)} />
			<ImageDialog
				request={imageRequest}
				onClose={() => setImageRequest(null)}
			/>
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
	// Whether a press on this row's number would pick up the selected block.
	readonly movable: boolean;
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
	readonly wrappedColumns: ReadonlySet<ColumnId>;
	// The side this row eases in from when an insert command just added it, and
	// the columns of the same command, which every row draws. Both are null on
	// every other change to the document, so an ordinary edit leaves each row's
	// props exactly as they were.
	readonly insertedFrom: InsertedFrom;
	readonly insertedColumns: InsertedAxis | null;
	// Whether this row is the pinned first data row, and whether the grid pins
	// its first data column. Both arrive already narrowed to what actually
	// renders, so an unpinned table passes the same two `false` values on every
	// document change and every row is still reconciled away.
	readonly pinnedRow: boolean;
	readonly pinnedColumn: boolean;
	// Whether the row above is the pinned one, whose edge is chrome.
	readonly belowPinnedRow: boolean;
	readonly selectRow: (row: number, intent: SelectIntent) => void;
	// A printable key on the row number types over the selection it made.
	readonly onTypeOverAxis: (event: React.KeyboardEvent) => void;
	readonly onFinishCellEdit: (
		position: CellPosition,
		value: TextContent,
		exit: EditorExit,
		wasSeeded: boolean,
	) => void;
	// The rich editor's Mod+K, answered by the grid's link dialog (#306).
	readonly onRequestLink: (request: LinkRequest) => void;
	readonly onRequestImage: (request: ImageRequest) => void;
	readonly draggingRef: React.RefObject<GridDragKind | null>;
	readonly onAxisPointerDown: AxisReorderController["onAxisPointerDown"];
}

const DataRow = memo(function DataRow({
	row,
	rowIndex,
	columns,
	movable,
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
	insertedFrom,
	insertedColumns,
	pinnedRow,
	pinnedColumn,
	belowPinnedRow,
	selectRow,
	onTypeOverAxis,
	onFinishCellEdit,
	onRequestLink,
	onRequestImage,
	draggingRef,
	onAxisPointerDown,
}: DataRowProps) {
	// Read here rather than threaded down, matching ColumnIndexCell and
	// HeaderCell, and preserving today's behaviour of every row reacting
	// together when pane entry changes.
	const entered = usePaneEntered();

	// The four encoded span strings, decoded once for this row. Every cell of
	// the row then asks about numbers rather than re-parsing the strings it
	// was handed.
	const selectedBounds = decodeSpans(selectedSpans);
	const copiedBounds = decodeSpans(copiedSpans);
	const copiedBoundsAbove = decodeSpans(copiedSpansAbove);
	const copiedBoundsBelow = decodeSpans(copiedSpansBelow);

	// The copied region as far as this row can see it, which is exactly as far
	// as the edge rule ever asks: the cell itself and its four neighbours.
	const copiedAt = (row: number, column: number) => {
		if (row === rowIndex) return coveredBySpans(copiedBounds, column);
		if (row === rowIndex - 1) return coveredBySpans(copiedBoundsAbove, column);
		if (row === rowIndex + 1) return coveredBySpans(copiedBoundsBelow, column);
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
			// A row an insert command just added eases in, number and all, from
			// the side of the insertion point it arrived on. Once only: the
			// animation runs when this row's element is created, and the rows it
			// pushed along are untouched.
			className={cn(insertedFrom && insertMotionClass.row[insertedFrom])}
		>
			<th
				scope="row"
				// biome-ignore lint/a11y/noRedundantRoles: see above
				role="rowheader"
				// The heading a screen reader reads as the row context for
				// every cell beside it, so it names the row rather than
				// repeating the control it contains.
				aria-label={copy.a11y.rowNumber(rowIndex)}
				data-row-header={rowIndex}
				className={cn(
					// The right edge is where chrome meets the table. At rest the
					// modern table draws no vertical line, so it stays transparent
					// and takes the strong line only while content scrolls under the
					// gutter, unless a pinned column stands there with its own edge.
					// Row lines start at a row's first cell: the gutter keeps the
					// border's room, so rows stay one pitch, and draws no line under
					// its numbers (owner, 2026-09-19).
					"sticky left-0 border-r border-r-transparent border-b border-b-transparent bg-surface-code align-top",
					!pinnedColumn && "edge-while-scrolled-x",
					"p-0 text-right font-index font-normal text-muted-foreground text-xs tabular-nums",
					// The row's number is how the row identifies itself,
					// so they hold position with it. Pinned it sticks on both axes and
					// joins the corner layer, like the header row's own gutter cell.
					// A row holding any selected cell marks its number, from the
					// same spans that paint its cells, so there is no second record
					// of which rows are selected.
					selectedSpans !== "" && selectedAxisClass,
					pinnedRow ? "top-(--grid-pin-top) z-30" : "z-10",
				)}
				data-axis-selected={selectedSpans !== "" || undefined}
				onPointerEnter={() => {
					if (draggingRef.current !== "row") return;
					selectRow(rowIndex, "extend");
				}}
			>
				<button
					type="button"
					tabIndex={entered ? 0 : -1}
					aria-label={copy.a11y.selectRowNamed(copy.a11y.rowNumber(rowIndex))}
					onKeyDown={onTypeOverAxis}
					className={axisNumberClass(movable)}
					onPointerDown={(event) => {
						if (event.button !== 0) return;
						// A selected row picks the selected block up to move it;
						// anything else selects, and drag-selects along the gutter.
						if (onAxisPointerDown("row", rowIndex, event)) return;
						draggingRef.current = "row";
						selectRow(rowIndex, selectIntentOf(event));
					}}
					onClick={(event) => {
						// A keyboard-generated click has no pointer detail.
						if (event.detail === 0) selectRow(rowIndex, selectIntentOf(event));
					}}
				>
					{rowIndex + 2}
				</button>
			</th>

			{columns.map((column, columnIndex) => {
				const isFocus = columnIndex === focusColumn;
				const inSelection = coveredBySpans(selectedBounds, columnIndex);
				const copiedEdges = clipboardEdgesAt(copiedAt, rowIndex, columnIndex);
				const cellValue = readCell(row, column.id);
				const value = cellText(cellValue);
				const type = cellValueType(cellValue);
				const divergent = cellTypeDiverges(cellValue, column.expectedType);
				const describesType = type !== "string" || divergent;
				const isEditing = columnIndex === editingColumn;
				const wrapped = wrappedColumns.has(column.id);
				const pinnedCell = pinnedColumn && columnIndex === 0;
				const columnInsertedFrom = insertionSide(insertedColumns, column.id);

				return (
					// gridcell is stated rather than left implicit, for the same
					// reason as the row role above: without it the computed
					// accessibility tree reported these cells as "generic".
					<td
						key={column.id}
						// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: see above
						role="gridcell"
						data-cell={`${rowIndex}:${columnIndex}`}
						// What the pinned layers are made of, for the two readers that
						// have to find them by their stuck rectangle rather than by
						// index: reveal-cell's clearance, and the browser suite.
						data-pinned-row={pinnedRow ? "true" : undefined}
						data-pinned-column={pinnedCell ? "true" : undefined}
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
						// across a 200-row table. See docs/design-system/3-components.md.
						title={value || undefined}
						className={cn(
							"border-line-subtle border-b px-2 align-top",
							"cursor-cell select-none",
							// One position, never two. `relative` is what the clipboard
							// mark resolves against, and a pinned cell's own `sticky`
							// already is that containing block: emitting both would let
							// the later rule win and turn the sticky offset into a
							// static shift. Same trap as the header cell and the column
							// resize handle.
							//
							// Between ordinary cells and the row gutter above them, so
							// a pinned layer covers the table without covering the
							// chrome. The one cell in both layers renders their
							// intersection once, a step above each.
							pinnedRow || pinnedCell ? "sticky" : "relative",
							pinnedRow && "top-(--grid-pin-top)",
							pinnedCell && "left-grid-gutter",
							pinnedRow && pinnedCell
								? "z-(--z-grid-pinned-corner)"
								: (pinnedRow || pinnedCell) && "z-(--z-grid-pinned)",
							// The edge that says a layer is pinned without using colour:
							// the strong line the grid already draws around chrome,
							// against the subtle one every interior boundary carries.
							pinnedRow && "border-b-line-strong",
							pinnedCell && "border-r border-r-line-strong",
							// A cell being edited overrides the column's own clipping so
							// its editor can grow and wrap over the rows below it while
							// the value is too long for the column, without touching
							// the wrap preference or any other row's height.
							isEditing ? "z-20 overflow-visible" : "cell-clip",
							alignClass[column.align],
							// A column an insert command just added eases in the same
							// way its rows do, cell by cell down the table.
							columnInsertedFrom &&
								insertMotionClass.column[columnInsertedFrom],
							// A pinned cell has live rows and columns passing underneath
							// it, so its selection tint is the sticky composition rather
							// than the bare translucent token. See the header cell and
							// index.css. Unselected needs nothing: `bg-surface-code` is
							// already the opaque surface of the pane's content box.
							inSelection
								? pinnedRow || pinnedCell
									? "bg-sticky-selection-fill"
									: "bg-selection-fill"
								: "bg-surface-code",
							// Focus is drawn by CellMarks, on the grid lines around the
							// cell, so the cell's own outline stays off.
							isFocus && "outline-none",
						)}
						onPointerDown={(event) => {
							if (event.button !== 0) return;
							// Without this, the browser's own mousedown handling runs
							// after ours and moves focus to <body>, because a <td> is
							// not focusable by default. The cell would look selected
							// but ignore every keystroke.
							event.preventDefault();
							const intent = selectIntentOf(event);
							// Mod+click on a link opens it (#306): the link's own click
							// handler does, so the cell's selection is left alone.
							if (intent === "toggle" && isOnLink(event.target)) return;
							draggingRef.current = "cell";
							const store = useTabeloStore.getState();
							const at = { row: rowIndex, column: columnIndex };
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
						{isEditing &&
						// Text is edited as text with its formatting; a number, a
						// boolean, or null keeps the plain editor, since formatting
						// never reaches it. Typing over a cell starts from what the
						// column expects.
						(editingSeed !== null
							? column.expectedType === "text"
							: isTextContent(cellValue)) ? (
							<RichCellEditor
								initialValue={
									editingSeed ?? (isTextContent(cellValue) ? cellValue : value)
								}
								initialMode={editingSeed === null ? "edit" : "enter"}
								align={alignClass[column.align]}
								ariaLabel={
									describesType
										? copy.a11y.cellEditorWithType(rowIndex, columnIndex, type)
										: copy.a11y.cellEditor(rowIndex, columnIndex)
								}
								wrapped={wrapped}
								onRequestLink={onRequestLink}
								onRequestImage={onRequestImage}
								onFinish={(next, exit) =>
									onFinishCellEdit(
										{ row: rowIndex, column: columnIndex },
										next,
										exit,
										editingSeed !== null,
									)
								}
							/>
						) : isEditing ? (
							<CellEditor
								initialValue={editingSeed ?? value}
								initialMode={editingSeed === null ? "edit" : "enter"}
								align={alignClass[column.align]}
								ariaLabel={
									describesType
										? copy.a11y.cellEditorWithType(rowIndex, columnIndex, type)
										: copy.a11y.cellEditor(rowIndex, columnIndex)
								}
								monospace={type !== "string"}
								wrapped={wrapped}
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
									rowLineInside,
									wrapped
										? "min-h-grid-row"
										: "h-content-line-box overflow-hidden",
								)}
							>
								<span
									data-cell-value
									className={cn(
										/* Every cell value carries tabular figures, not only the
										   numbers: a column of values is read by comparing the
										   digits down it, and a string cell can hold digits too. */
										"min-w-0 tabular-nums",
										wrapped
											? wrappedLinesClass
											: "overflow-hidden text-ellipsis whitespace-pre",
										type !== "string" && "font-value",
										cellTypePresentationClass(type),
									)}
								>
									{isTextContent(cellValue)
										? markedValue(
												cellValue,
												columnIndex === markColumn ? markStart : NO_MARK,
												columnIndex === markColumn ? markEnd : NO_MARK,
												wrapped ? "grid-wrapped" : "grid",
											)
										: columnIndex === markColumn
											? markedValue(value, markStart, markEnd, "grid")
											: value}
									{describesType ? (
										<span className="sr-only">
											{copy.a11y.cellTypeQualifier(type)}
										</span>
									) : null}
								</span>
								{divergent ? <CellTypeMark type={type} context="cell" /> : null}
							</span>
						)}
						{/* An open editor draws its own frame, which can outgrow the
						    cell, so the focus mark stands down while it is open. */}
						<CellMarks
							copied={copiedEdges}
							focused={isFocus && !isEditing}
							reachTop={rowIndex > 0 && !belowPinnedRow}
							reachLeft={
								columnIndex > 0 && !(pinnedColumn && columnIndex === 1)
							}
						/>
					</td>
				);
			})}
		</tr>
	);
});

// One cell of the column index strip. It carries the column's positional
// letter, which for an unnamed column is the only identity it has, and it owns
// the column's pointer gestures: select, reorder, and resize. Its menu is the
// grid's context menu, opened on the letter (#288).
interface ColumnIndexCellProps {
	readonly columnIndex: number;
	readonly header: string;
	readonly expectedType: ExpectedColumnType;
	// Whether any selected area reaches this column. Presentation only: it
	// marks the letter so the user can find their place from the edge of the
	// grid.
	readonly selected: boolean;
	// Whether a press on the letter would pick up the selected block.
	readonly movable: boolean;
	// The side this column eases in from when an insert command just added it.
	readonly insertedFrom: InsertedFrom;
	// The stored width is in rem. Zoom scales what is rendered, so the drag
	// gesture converts viewport pixels back before writing a width down.
	readonly width: number;
	readonly zoom: number;
	// Whether this cell belongs to the pinned first data column. A column is its
	// header plus its cells, and the letter is how the column names itself, so
	// it travels with the layer rather than scrolling off it.
	readonly pinned: boolean;
	readonly onSelect: (intent: SelectIntent) => void;
	// A printable key on the letter types over the selection it made.
	readonly onTypeOverAxis: (event: React.KeyboardEvent) => void;
	readonly onDragStart: () => void;
	readonly onDragEnter: () => void;
	readonly onAxisPointerDown: AxisReorderController["onAxisPointerDown"];
}

function ColumnIndexCell({
	columnIndex,
	header,
	expectedType,
	selected,
	movable,
	insertedFrom: insertedColumnFrom,
	width,
	zoom,
	pinned,
	onSelect,
	onTypeOverAxis,
	onDragStart,
	onDragEnter,
	onAxisPointerDown,
}: ColumnIndexCellProps) {
	const resizeState = useRef<{
		startX: number;
		startWidth: number;
		rootFontSize: number;
	} | null>(null);
	const letter = copy.a11y.columnLetter(columnIndex);
	const entered = usePaneEntered();

	return (
		<div
			data-column-header={columnIndex}
			data-column-letter={letter}
			data-expected-type={expectedType}
			data-axis-selected={selected || undefined}
			className={cn(
				// The modern table (owner, 2026-09-19): the letters sit on the
				// content surface with no band, no dividers, and no line under
				// them; only the header row's bottom edge and the row lines draw.
				"min-w-0",
				"bg-surface-code text-left font-index font-normal text-muted-foreground text-xs",
				selected && selectedAxisClass,
				// Pinned it sticks sideways and joins the corner layer, beside the
				// dead corner where the letters meet the row numbers. The strip
				// itself owns the vertical stickiness for every cell.
				//
				// `sticky` already establishes the containing block the resize
				// handle positions against, so only an unpinned cell adds
				// `relative`: pairing the two would win over `sticky` and turn the
				// offset into a shift rather than a scroll threshold.
				pinned
					? "sticky left-grid-gutter z-30 border-r border-r-line-strong"
					: "relative z-20",
				// The letter of a column an insert command just added arrives with
				// the column it names.
				insertedColumnFrom && insertMotionClass.column[insertedColumnFrom],
			)}
			onPointerEnter={onDragEnter}
		>
			{/* The handle for the whole column, and the cell's only control (#288).
			    It fills the cell and carries the cells' own inline padding, so the
			    letter starts exactly where the text of the column below it does.
			    It names itself after the column it selects, falling back to the
			    letter when the header is empty, which is the same rule the header
			    cell announces by. */}
			<button
				type="button"
				tabIndex={entered ? 0 : -1}
				aria-label={copy.a11y.selectColumnNamed(
					copy.a11y.columnWithExpectedType(header, columnIndex, expectedType),
				)}
				onKeyDown={onTypeOverAxis}
				className={cn(
					"flex h-full w-full min-w-0 items-center rounded-interactive px-2 text-left hover:text-foreground",
					axisLabelCursor(movable),
				)}
				onPointerDown={(event) => {
					if (event.button !== 0) return;
					// A selected column picks the selected block up to move it;
					// anything else selects, and drag-selects along the strip.
					if (onAxisPointerDown("column", columnIndex, event)) return;
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

			{/* Pointer-only by design, and hidden from assistive technology. The
			    focused grid column has Alt+Shift+Left/Right as its keyboard equal. */}
			<div
				aria-hidden
				className="absolute top-0 right-0 z-20 h-full w-2 cursor-col-resize touch-none after:absolute after:inset-y-1 after:right-0 after:w-hairline after:rounded-full hover:after:bg-selection-edge"
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
		</div>
	);
}

// The header cell holds editable text and nothing else. Selecting the column
// and opening its menu belong to the index strip above, so this behaves like
// the data cells below it: click to select, double click or F2 to edit,
// Backspace to clear.
interface HeaderCellProps {
	readonly columnIndex: number;
	// The header's plain projection, which names it, and its content, which is
	// what the cell draws.
	readonly header: string;
	readonly content: TextContent;
	readonly align: Alignment;
	readonly wrapped: boolean;
	// Whether this header belongs to the pinned first data column. See
	// ColumnIndexCell: the header is part of the column it names.
	readonly pinned: boolean;
	// Whether the column to its left is the pinned one, whose edge is chrome.
	readonly afterPinnedColumn: boolean;
	readonly selected: boolean;
	// The side this column eases in from when an insert command just added it.
	readonly insertedFrom: InsertedFrom;
	// A column selection reaches the header row, so a copied column marks it too.
	readonly copiedEdges: ClipboardEdges | null;
	readonly focus: boolean;
	readonly editing: boolean;
	// The character that opened the editor, when typing is what opened it.
	readonly seed: string | null;
	readonly onFinishEdit: (
		columnIndex: number,
		value: TextContent,
		exit: EditorExit,
		wasSeeded: boolean,
	) => void;
	// The half-open range of this header's text the current find match covers.
	// Equal bounds mean it holds no match.
	readonly markStart: number;
	readonly markEnd: number;
	readonly onRequestLink: (request: LinkRequest) => void;
	readonly onRequestImage: (request: ImageRequest) => void;
	// The grid owns the drag lifecycle, so the header only reports the two
	// edges of the gesture. See ColumnIndexCell: same split, different kind.
	readonly onDragStart: () => void;
	readonly onDragEnter: () => void;
}

function HeaderCell({
	columnIndex,
	header,
	content,
	align,
	wrapped,
	pinned,
	afterPinnedColumn,
	selected,
	insertedFrom: insertedColumnFrom,
	copiedEdges,
	focus,
	editing,
	seed,
	onFinishEdit,
	markStart,
	markEnd,
	onRequestLink,
	onRequestImage,
	onDragStart,
	onDragEnter,
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
				// The header row carries no side dividers, like every row of the
				// modern table, and the one strong line under it is what separates
				// the names from the data (owner, 2026-09-19).
				"sticky border-b border-b-line-strong align-top",
				"cursor-cell select-none px-2 font-semibold",
				// Sticks below the index strip rather than at the very top, so the
				// two chrome layers stack instead of covering one another.
				"top-grid-strip",
				// Pinned it sticks on both axes and joins the corner layer, beside
				// the gutter cell that names the header row, and carries the strong
				// edge the pinned column draws all the way down.
				pinned ? "left-grid-gutter z-30 border-r border-r-line-strong" : "z-20",
				// See the data cell's identical rule: editing overrides clipping so a
				// header longer than its column can grow and wrap while it's being
				// typed, without changing the column's wrap preference.
				editing ? "overflow-visible" : "cell-clip",
				alignClass[align],
				// Body rows scroll under this cell, so both fills are opaque: the
				// selection is the sticky composition rather than the bare tint,
				// and at rest the cell wears the content box's own surface. See
				// index.css.
				selected ? "bg-sticky-selection-fill" : "bg-surface-code",
				focus && "outline-none",
				// The header of a column an insert command just added arrives with
				// the rest of that column.
				insertedColumnFrom && insertMotionClass.column[insertedColumnFrom],
			)}
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				// A <th> is not focusable by default, so without this the browser's
				// own mousedown handling moves focus to <body> after ours runs and
				// the cell would look selected while ignoring every keystroke.
				event.preventDefault();
				// The header row is an ordinary row of the cell selection, so its
				// drag is the data cells' own kind: starting it here is what lets
				// one rectangle span the boundary in either direction.
				const intent = selectIntentOf(event);
				if (intent === "toggle" && isOnLink(event.target)) return;
				onDragStart();
				const store = useTabeloStore.getState();
				const at = { row: HEADER_ROW, column: columnIndex };
				if (intent === "extend") store.extendSelection(at);
				else if (intent === "toggle") store.toggleSelectionRegion(at, "cell");
				else store.selectCell(at);
				event.currentTarget.focus();
			}}
			onPointerEnter={onDragEnter}
			onDoubleClick={() =>
				useTabeloStore.getState().setEditingHeader(columnIndex)
			}
		>
			{editing ? (
				<RichCellEditor
					initialValue={seed ?? content}
					align={alignClass[align]}
					ariaLabel={copy.a11y.headerEditor(header, columnIndex)}
					wrapped={wrapped}
					onRequestLink={onRequestLink}
					onRequestImage={onRequestImage}
					onFinish={(next, exit) =>
						onFinishEdit(columnIndex, next, exit, seed !== null)
					}
				/>
			) : (
				<span
					data-column-content={columnIndex}
					className={cn(
						"block",
						rowLineInside,
						// The same line pitch as a wrapped data cell (#374).
						wrapped
							? cn("min-h-grid-row", wrappedLinesClass)
							: "h-content-line-box overflow-hidden text-ellipsis whitespace-pre leading-content-line-box",
					)}
				>
					{markedValue(
						content,
						markStart,
						markEnd,
						wrapped ? "grid-wrapped" : "grid",
					)}
				</span>
			)}
			<CellMarks
				copied={copiedEdges}
				focused={focus && !editing}
				reachTop={false}
				reachLeft={columnIndex > 0 && !afterPinnedColumn}
			/>
		</th>
	);
}
