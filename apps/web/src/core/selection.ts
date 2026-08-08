// A rectangle of grid coordinates. It lives here rather than beside the
// operations that consume it because its coordinate space, including the header
// row below zero, is the selection's to define.
export interface CellRect {
	readonly top: number;
	readonly left: number;
	readonly bottom: number;
	readonly right: number;
}

// The header row's coordinate. Every table has exactly one header row, and it
// sits above `document.rows[0]`, so it needs an index of its own to be
// addressable at all. A sentinel below zero was chosen over renumbering the
// data rows to 1-based: renumbering would touch every operation, every test,
// and the aria-rowindex arithmetic, while this is one value the primitives
// clamp against.
export const HEADER_ROW = -1;

export interface CellPosition {
	readonly row: number;
	readonly column: number;
}

// "cell" is a free rectangle. "row" and "column" span the whole table on the
// other axis, which is what makes "delete the selected rows" unambiguous.
export type SelectionMode = "cell" | "row" | "column";

// One rectangular region: the anchor a Shift gesture measures from, the focus
// it moved to, and which axis the region spans.
export interface SelectionRange {
	readonly anchor: CellPosition;
	readonly focus: CellPosition;
	readonly mode: SelectionMode;
}

// An ordered list of regions, never empty. Every gesture other than the
// modifier produces exactly one, so the single-region case is the common one
// and nothing about a drag or Shift+arrows changes shape here.
//
// Regions are allowed to overlap. Nothing derives a count by adding their
// sizes: every operation and every label collects a Set of row or column
// indices first, so a cell covered twice is still one cell and there is no
// merge step that could quietly lose a region.
export interface GridSelection {
	readonly ranges: readonly SelectionRange[];
	// Which region Shift+arrows and a pointer drag extend, and whose focus is
	// the cell the keyboard acts from. Always a valid index into `ranges`.
	readonly activeIndex: number;
}

export type SelectionMoveAxis = "row" | "column";
export type SelectionMoveRefusal =
	| "single-area"
	| "header-row"
	| "first-row"
	| "last-row"
	| "first-column"
	| "last-column";

export function createRange(
	position: CellPosition,
	mode: SelectionMode = "cell",
): SelectionRange {
	return { anchor: position, focus: position, mode };
}

export function createSelection(
	position: CellPosition,
	mode: SelectionMode = "cell",
): GridSelection {
	return { ranges: [createRange(position, mode)], activeIndex: 0 };
}

export function activeRange(selection: GridSelection): SelectionRange {
	// The list is never empty and the index is always inside it, but neither is
	// something the type system can prove about stored data, so the fallback is
	// a real value rather than an assertion.
	return (
		selection.ranges[selection.activeIndex] ??
		selection.ranges[0] ??
		createRange({ row: 0, column: 0 })
	);
}

// Whether the selection is one continuous region. Operations that need a single
// insertion point or a single origin ask this before running.
export function isContiguous(selection: GridSelection): boolean {
	return selection.ranges.length === 1;
}

export function rangeRect(
	range: SelectionRange,
	rowCount: number,
	columnCount: number,
): CellRect {
	const top = Math.min(range.anchor.row, range.focus.row);
	const bottom = Math.max(range.anchor.row, range.focus.row);
	const left = Math.min(range.anchor.column, range.focus.column);
	const right = Math.max(range.anchor.column, range.focus.column);

	if (range.mode === "row") {
		return { top, bottom, left: 0, right: Math.max(0, columnCount - 1) };
	}
	// A column is its header plus its cells, so selecting one reaches the header
	// row. That is what makes Mod+A, which selects every column, cover the whole
	// table rather than only its body.
	if (range.mode === "column") {
		return { top: HEADER_ROW, bottom: Math.max(0, rowCount - 1), left, right };
	}
	return { top, bottom, left, right };
}

// The active region's rectangle. Callers that must act on everything the user
// selected use `selectionRects` instead; this one answers "where is the
// keyboard working", which is what an insertion point or a paste origin needs.
export function selectionRect(
	selection: GridSelection,
	rowCount: number,
	columnCount: number,
): CellRect {
	return rangeRect(activeRange(selection), rowCount, columnCount);
}

export function selectionRects(
	selection: GridSelection,
	rowCount: number,
	columnCount: number,
): readonly CellRect[] {
	return selection.ranges.map((range) =>
		rangeRect(range, rowCount, columnCount),
	);
}

// Reordering needs one contiguous structural block and one destination. This
// guard is shared by the action and the menus so a disabled action can never
// disagree with what the store will accept.
export function selectionMoveRefusal(
	selection: GridSelection,
	rowCount: number,
	columnCount: number,
	axis: SelectionMoveAxis,
	offset: number,
): SelectionMoveRefusal | null {
	if (!isContiguous(selection)) return "single-area";
	if (offset === 0) return null;

	const rect = selectionRect(selection, rowCount, columnCount);
	if (axis === "row") {
		if (rectCoversHeader(rect)) return "header-row";
		if (rect.top + offset < 0) return "first-row";
		if (rect.bottom + offset >= rowCount) return "last-row";
		return null;
	}

	if (rect.left + offset < 0) return "first-column";
	if (rect.right + offset >= columnCount) return "last-column";
	return null;
}

export function translateSelection(
	selection: GridSelection,
	axis: SelectionMoveAxis,
	offset: number,
): GridSelection {
	if (offset === 0) return selection;
	const translate = (position: CellPosition): CellPosition =>
		axis === "row"
			? { ...position, row: position.row + offset }
			: { ...position, column: position.column + offset };
	return {
		...selection,
		ranges: selection.ranges.map((range) => ({
			...range,
			anchor: translate(range.anchor),
			focus: translate(range.focus),
		})),
	};
}

export function selectionContains(
	selection: GridSelection,
	rowCount: number,
	columnCount: number,
	row: number,
	column: number,
): boolean {
	return selectionRects(selection, rowCount, columnCount).some((rect) =>
		rectContains(rect, row, column),
	);
}

// The distinct data rows the whole selection covers, ascending, with the header
// row dropped. Operations that act on rows as structure use this: overlapping
// regions collapse here, so nothing is deleted or duplicated twice.
export function selectionDataRows(
	selection: GridSelection,
	rowCount: number,
	columnCount: number,
): number[] {
	return sortedUnion(
		selectionRects(selection, rowCount, columnCount).flatMap(rectDataRows),
	);
}

// Every row the selection covers, header row included. This is the extent the
// user sees highlighted, not the set of rows an operation may remove.
export function selectionRows(
	selection: GridSelection,
	rowCount: number,
	columnCount: number,
): number[] {
	return sortedUnion(
		selectionRects(selection, rowCount, columnCount).flatMap(rectRows),
	);
}

export function selectionColumns(
	selection: GridSelection,
	rowCount: number,
	columnCount: number,
): number[] {
	return sortedUnion(
		selectionRects(selection, rowCount, columnCount).flatMap(rectColumns),
	);
}

// The rows or columns the user selected *as* rows or columns. Two things read
// this rather than `selectionColumns`: a per-column property change, because
// dragging one column's edge while a block of cells happens to span three of
// them must resize the column that was dragged and nothing else, and an axis
// menu deciding whether its target is already part of the selection.
export function selectedAxis(
	selection: GridSelection,
	mode: "row" | "column",
	rowCount: number,
	columnCount: number,
): number[] {
	return sortedUnion(
		selection.ranges
			.filter((range) => range.mode === mode)
			.flatMap((range) => {
				const rect = rangeRect(range, rowCount, columnCount);
				return mode === "column" ? rectColumns(rect) : rectRows(rect);
			}),
	);
}

export function selectionCoversHeader(
	selection: GridSelection,
	rowCount: number,
	columnCount: number,
): boolean {
	return selectionRects(selection, rowCount, columnCount).some(
		rectCoversHeader,
	);
}

// Shift+arrows and a pointer drag move the active region's focus and leave
// every other region alone, so extending never destroys what the modifier
// added.
export function extendActiveRange(
	selection: GridSelection,
	focus: CellPosition,
): GridSelection {
	return replaceActiveRange(selection, {
		...activeRange(selection),
		focus,
	});
}

export function replaceActiveRange(
	selection: GridSelection,
	range: SelectionRange,
): GridSelection {
	return {
		...selection,
		ranges: selection.ranges.map((candidate, index) =>
			index === selection.activeIndex ? range : candidate,
		),
	};
}

// Mod+click. The modifier adds a region to the selection, or takes one away
// when the click names a region that is already part of it.
//
// Removal is defined on the axis the gesture names: clicking a selected column
// letter subtracts that column from the selection's column coverage, splitting
// one region in two when the column sat in its middle. A cell has no axis to
// subtract along, so a modifier click on one removes a region that is exactly
// that cell and otherwise adds a new one. Splitting a rectangle around an
// interior cell has no well-formed answer, and both Excel and Google Sheets
// start a new region there rather than inventing one.
export function toggleSelectionRegion(
	selection: GridSelection,
	position: CellPosition,
	mode: SelectionMode,
): GridSelection {
	return mode === "cell"
		? toggleCell(selection, position)
		: toggleAxis(selection, position, mode);
}

function toggleCell(
	selection: GridSelection,
	position: CellPosition,
): GridSelection {
	const index = selection.ranges.findLastIndex(
		(range) =>
			range.mode === "cell" &&
			samePosition(range.anchor, position) &&
			samePosition(range.focus, position),
	);
	return index === -1
		? appendRange(selection, createRange(position, "cell"))
		: rebuild(selection, toSpliced(selection.ranges, index));
}

// Move the focused cell while keeping every area already selected: the
// keyboard's half of what the modifier means on the pointer.
//
// The area under the focus is provisional while it is a single cell, so the
// modifier moves it rather than leaving a trail of one-cell areas behind. Any
// other area is something the user chose, so the focus lands in a new one
// beside it.
export function moveFocusKeepingRegions(
	selection: GridSelection,
	position: CellPosition,
): GridSelection {
	return isProvisional(activeRange(selection))
		? replaceActiveRange(selection, createRange(position, "cell"))
		: appendRange(selection, createRange(position, "cell"));
}

// A single cell, which is what the focus leaves behind as it moves and what
// turning a column or a row into an area replaces.
function isProvisional(range: SelectionRange): boolean {
	return range.mode === "cell" && samePosition(range.anchor, range.focus);
}

function toggleAxis(
	selection: GridSelection,
	position: CellPosition,
	mode: "row" | "column",
): GridSelection {
	const target = axisIndexOf(position, mode);
	const others = selection.ranges.filter((range) => range.mode !== mode);
	const covered = new Set<number>();
	for (const range of selection.ranges) {
		if (range.mode !== mode) continue;
		const from = Math.min(
			axisIndexOf(range.anchor, mode),
			axisIndexOf(range.focus, mode),
		);
		const to = Math.max(
			axisIndexOf(range.anchor, mode),
			axisIndexOf(range.focus, mode),
		);
		for (let index = from; index <= to; index += 1) covered.add(index);
	}

	if (!covered.has(target)) {
		const range = createRange(position, mode);
		// The single cell the focus is sitting on is provisional: turning its own
		// column or row into an area replaces it rather than leaving it painted
		// beside the area that now contains it.
		const active = activeRange(selection);
		return isProvisional(active) && axisIndexOf(active.focus, mode) === target
			? replaceActiveRange(selection, range)
			: appendRange(selection, range);
	}
	covered.delete(target);
	return rebuild(selection, [
		...others,
		...runsOf(sortedUnion([...covered])).map(([from, to]) =>
			axisRange(from, to, mode),
		),
	]);
}

// The floor is the header row, not row 0: a selection sitting on the header
// survives a document change that shrank the rows underneath it.
export function clampSelection(
	selection: GridSelection,
	rowCount: number,
	columnCount: number,
): GridSelection {
	const clamp = (position: CellPosition): CellPosition => ({
		row: Math.max(HEADER_ROW, Math.min(position.row, rowCount - 1)),
		column: Math.max(0, Math.min(position.column, columnCount - 1)),
	});

	const seen = new Set<string>();
	const ranges: SelectionRange[] = [];
	for (const range of selection.ranges) {
		const next: SelectionRange = {
			...range,
			anchor: clamp(range.anchor),
			focus: clamp(range.focus),
		};
		// Two regions that clamped onto the same place are one region. Keeping
		// both would leave the selection claiming more of a shrunken table than
		// it now holds, which is the one way this list can go stale.
		const key = `${next.mode}:${next.anchor.row}:${next.anchor.column}:${next.focus.row}:${next.focus.column}`;
		if (seen.has(key)) continue;
		seen.add(key);
		ranges.push(next);
	}

	return ranges.length === 0
		? selection
		: {
				ranges,
				activeIndex: Math.min(selection.activeIndex, ranges.length - 1),
			};
}

// The data rows a rect covers, with the header row dropped. Operations that act
// on rows as structure use this, because the header row is structurally
// required and is never one of the rows they may remove or duplicate.
export function rectDataRows(rect: CellRect): number[] {
	return rectRows(rect).filter((row) => row !== HEADER_ROW);
}

export function rectCoversHeader(rect: CellRect): boolean {
	return rect.top === HEADER_ROW;
}

export function rectContains(
	rect: CellRect,
	row: number,
	column: number,
): boolean {
	return (
		row >= rect.top &&
		row <= rect.bottom &&
		column >= rect.left &&
		column <= rect.right
	);
}

export function rectRows(rect: CellRect): number[] {
	return Array.from(
		{ length: rect.bottom - rect.top + 1 },
		(_, index) => rect.top + index,
	);
}

export function rectColumns(rect: CellRect): number[] {
	return Array.from(
		{ length: rect.right - rect.left + 1 },
		(_, index) => rect.left + index,
	);
}

export interface StructureDeletionGuard {
	readonly wouldRemoveAllRows: boolean;
	readonly wouldRemoveAllColumns: boolean;
}

// Coverage across every region of the selection. Sets count coverage, not
// overlap, so two regions naming the same column still guard one column.
export function structureDeletionGuard(
	selection: GridSelection,
	rowCount: number,
	columnCount: number,
): StructureDeletionGuard {
	// Only data rows count: the header row is never a candidate for removal, so
	// covering it must not make a selection look like it covers everything.
	const rows = selectionDataRows(selection, rowCount, columnCount);
	const columns = selectionColumns(selection, rowCount, columnCount);

	return {
		wouldRemoveAllRows: rows.length >= rowCount,
		wouldRemoveAllColumns: columns.length >= columnCount,
	};
}

function samePosition(left: CellPosition, right: CellPosition): boolean {
	return left.row === right.row && left.column === right.column;
}

function axisIndexOf(position: CellPosition, mode: "row" | "column"): number {
	return mode === "column" ? position.column : position.row;
}

function axisRange(
	from: number,
	to: number,
	mode: "row" | "column",
): SelectionRange {
	return mode === "column"
		? {
				anchor: { row: HEADER_ROW, column: from },
				focus: { row: HEADER_ROW, column: to },
				mode,
			}
		: {
				anchor: { row: from, column: 0 },
				focus: { row: to, column: 0 },
				mode,
			};
}

// The newest region is the active one: it is what the user just pointed at, so
// it is what a following Shift+click or drag should extend.
function appendRange(
	selection: GridSelection,
	range: SelectionRange,
): GridSelection {
	return rebuild(selection, [...selection.ranges, range]);
}

// A selection is never empty: with no region there is no focused cell and
// nowhere for the next keystroke to land, so a subtraction that would empty it
// leaves the selection as it was.
function rebuild(
	selection: GridSelection,
	ranges: readonly SelectionRange[],
): GridSelection {
	return ranges.length === 0
		? selection
		: { ranges, activeIndex: ranges.length - 1 };
}

function toSpliced(
	ranges: readonly SelectionRange[],
	index: number,
): SelectionRange[] {
	return ranges.filter((_, candidate) => candidate !== index);
}

function sortedUnion(indices: readonly number[]): number[] {
	return [...new Set(indices)].sort((a, b) => a - b);
}

// Contiguous runs of an ascending index list, as inclusive [from, to] pairs.
// Subtracting one index from an axis turns one region into two, and this is
// what finds the two.
function runsOf(ascending: readonly number[]): [number, number][] {
	const runs: [number, number][] = [];
	for (const index of ascending) {
		const last = runs.at(-1);
		if (last && index === last[1] + 1) last[1] = index;
		else runs.push([index, index]);
	}
	return runs;
}
