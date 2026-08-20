import { readCell } from "./cell-value";
import { type CellRect, isDataRect } from "./selection";
import type { ColumnId, RowId, TableDocument } from "./types";

// The explicit numeric series. A copy fill repeats what the user selected; this
// is the separate, deliberate step that continues those numbers instead.
//
// Nothing here reads text. A source cell counts only when it already holds a
// number, because a type is carried and never derived: see docs/adr/0008. The
// consequence is that "1", "2" typed into a text column offers nothing, and
// that is the intended answer rather than a gap.

export type FillSeriesRefusal =
	// The source or the extension is not a single row or a single column, or the
	// two disagree about which axis they run along.
	| "not-one-dimensional"
	| "too-few-values"
	| "not-numeric"
	| "not-constant"
	| "nothing-to-extend"
	| "expected-type"
	// A generated value is not finite, or has left the range where the
	// arithmetic is still exact.
	| "not-representable"
	// The rows or columns the offer named are no longer where it left them.
	| "stale";

// One cell the series would write, addressed by the identifiers that survive a
// reorder rather than by the indices that do not.
export interface FillSeriesWrite {
	readonly rowId: RowId;
	readonly columnId: ColumnId;
	readonly value: number;
}

export interface FillSeriesPlan {
	readonly writes: readonly FillSeriesWrite[];
}

export type FillSeriesEligibility =
	| { readonly ok: true; readonly plan: FillSeriesPlan }
	| { readonly ok: false; readonly refusal: FillSeriesRefusal };

// Everything a pending offer keeps. Stable identifiers only: the offer outlives
// nothing, but it must not describe different cells than the fill did if a row
// or column moved underneath it.
export interface FillSeriesOffer {
	readonly sourceRowIds: readonly RowId[];
	readonly sourceColumnIds: readonly ColumnId[];
	readonly targetRowIds: readonly RowId[];
	readonly targetColumnIds: readonly ColumnId[];
}

// Beyond this the decimal scale below cannot stay inside the safe integers, so
// the float path takes over.
const MAX_DECIMALS = 15;

// Two steps count as the same when they differ only in the last bits a double
// can hold. Only the values too large or too small for the exact decimal path
// below reach this: 1e-7, 2e-7, 3e-7 has a second step of 9.999999999999999e-8,
// which is the same step by any reading a person would give it.
const RELATIVE_TOLERANCE = 1e-9;

function rectHeight(rect: CellRect): number {
	return rect.bottom - rect.top + 1;
}

function rectWidth(rect: CellRect): number {
	return rect.right - rect.left + 1;
}

// The whole-number scale that makes every value exact, or null when one of them
// cannot be written as a short decimal. Series arithmetic runs in that scaled
// space so that 1, 1.1 continues 1.2 rather than 1.2000000000000002.
function decimalScale(values: readonly number[]): number | null {
	let decimals = 0;
	for (const value of values) {
		const text = String(value);
		// Exponent notation means the value is already outside the range where a
		// decimal scale helps.
		if (text.includes("e") || text.includes("E")) return null;
		const point = text.indexOf(".");
		if (point !== -1) decimals = Math.max(decimals, text.length - point - 1);
	}
	if (decimals > MAX_DECIMALS) return null;

	const scale = 10 ** decimals;
	const exact = values.every((value) => {
		const scaled = Math.round(value * scale);
		return Number.isSafeInteger(scaled) && scaled / scale === value;
	});
	return exact ? scale : null;
}

// The one step every pair shares, or null when they disagree. Whole numbers are
// compared exactly: a tolerance that is meaningless at 1 is millions wide at
// 9e15, which would call two genuinely different steps the same.
function constantDelta(
	values: readonly number[],
	compare: "exact" | "tolerant",
): number | null {
	const first = values[0];
	const second = values[1];
	if (first === undefined || second === undefined) return null;

	const delta = second - first;
	for (let index = 2; index < values.length; index++) {
		const previous = values[index - 1];
		const current = values[index];
		if (previous === undefined || current === undefined) return null;
		const step = current - previous;
		if (compare === "exact") {
			if (step !== delta) return null;
			continue;
		}
		const tolerance =
			Math.max(Math.abs(step), Math.abs(delta)) * RELATIVE_TOLERANCE;
		if (Math.abs(step - delta) > tolerance) return null;
	}
	return delta;
}

// The value at a position, counted from the source's first cell. Negative
// offsets are the extension that runs backwards, which is what filling up or
// left produces.
type SeriesValueAt = (offset: number) => number | null;

function seriesValues(values: readonly number[]): SeriesValueAt | null {
	const scale = decimalScale(values);
	if (scale === null) {
		const delta = constantDelta(values, "tolerant");
		if (delta === null || !Number.isFinite(delta)) return null;
		const first = values[0];
		if (first === undefined) return null;
		return (offset) => {
			const value = first + offset * delta;
			return Number.isFinite(value) ? value : null;
		};
	}

	const scaled = values.map((value) => Math.round(value * scale));
	const delta = constantDelta(scaled, "exact");
	if (delta === null) return null;
	const first = scaled[0];
	if (first === undefined) return null;
	return (offset) => {
		const value = first + offset * delta;
		// Past the safe integers the scaled arithmetic silently rounds, so the
		// series stops rather than writing a number nobody chose.
		return Number.isSafeInteger(value) ? value / scale : null;
	};
}

interface SeriesAxis {
	// Positions along the axis, as offsets from the source's first cell. The
	// source occupies 0 to sourceLength - 1.
	readonly offsets: readonly number[];
	readonly sourceLength: number;
	// Resolves an offset to the cell it names.
	readonly cellAt: (offset: number) => {
		readonly rowIndex: number;
		readonly columnIndex: number;
	};
}

function seriesAxis(source: CellRect, target: CellRect): SeriesAxis | null {
	const sourceHeight = rectHeight(source);
	const sourceWidth = rectWidth(source);
	const targetHeight = rectHeight(target);
	const targetWidth = rectWidth(target);

	const offsetsFrom = (from: number, to: number, origin: number) =>
		Array.from({ length: to - from + 1 }, (_, index) => from + index - origin);

	if (sourceWidth === 1 && targetWidth === 1 && targetHeight > sourceHeight) {
		return {
			offsets: offsetsFrom(target.top, target.bottom, source.top),
			sourceLength: sourceHeight,
			cellAt: (offset) => ({
				rowIndex: source.top + offset,
				columnIndex: source.left,
			}),
		};
	}
	if (sourceHeight === 1 && targetHeight === 1 && targetWidth > sourceWidth) {
		return {
			offsets: offsetsFrom(target.left, target.right, source.left),
			sourceLength: sourceWidth,
			cellAt: (offset) => ({
				rowIndex: source.top,
				columnIndex: source.left + offset,
			}),
		};
	}
	return null;
}

// Whether a copy fill of this shape could be continued as a series, and if so
// exactly which cells it would write. Pure: it decides, and applying is a
// separate step the user has to ask for.
export function planFillSeries(
	document: TableDocument,
	source: CellRect,
	target: CellRect,
): FillSeriesEligibility {
	const rowCount = document.rows.length;
	const columnCount = document.columns.length;
	if (
		!isDataRect(source, rowCount, columnCount) ||
		!isDataRect(target, rowCount, columnCount)
	) {
		return { ok: false, refusal: "stale" };
	}
	if (
		target.top > source.top ||
		target.bottom < source.bottom ||
		target.left > source.left ||
		target.right < source.right
	) {
		return { ok: false, refusal: "not-one-dimensional" };
	}

	const axis = seriesAxis(source, target);
	if (!axis) {
		const unchanged =
			rectHeight(source) === rectHeight(target) &&
			rectWidth(source) === rectWidth(target);
		return {
			ok: false,
			refusal: unchanged ? "nothing-to-extend" : "not-one-dimensional",
		};
	}
	if (axis.sourceLength < 2) return { ok: false, refusal: "too-few-values" };

	const values: number[] = [];
	for (let offset = 0; offset < axis.sourceLength; offset++) {
		const { rowIndex, columnIndex } = axis.cellAt(offset);
		const row = document.rows[rowIndex];
		const column = document.columns[columnIndex];
		if (!row || !column) return { ok: false, refusal: "stale" };
		const value = readCell(row, column.id);
		if (typeof value !== "number" || !Number.isFinite(value)) {
			return { ok: false, refusal: "not-numeric" };
		}
		values.push(value);
	}

	const valueAt = seriesValues(values);
	if (!valueAt) return { ok: false, refusal: "not-constant" };

	const writes: FillSeriesWrite[] = [];
	for (const offset of axis.offsets) {
		if (offset >= 0 && offset < axis.sourceLength) continue;
		const { rowIndex, columnIndex } = axis.cellAt(offset);
		const row = document.rows[rowIndex];
		const column = document.columns[columnIndex];
		if (!row || !column) return { ok: false, refusal: "stale" };
		// #201 owns what a column accepts. A boolean expectation contradicts a
		// number outright, so the series stops rather than writing a value that
		// column's own editor would refuse. `text` is not a contradiction: an
		// expectation guides entry and never constrains the data, which is why
		// the numbers the source already holds are legitimate there too. See
		// docs/adr/0008.
		if (column.expectedType === "boolean") {
			return { ok: false, refusal: "expected-type" };
		}
		const value = valueAt(offset);
		if (value === null) return { ok: false, refusal: "not-representable" };
		writes.push({ rowId: row.id, columnId: column.id, value });
	}

	if (writes.length === 0) return { ok: false, refusal: "nothing-to-extend" };
	return { ok: true, plan: { writes } };
}

export function captureFillSeriesOffer(
	document: TableDocument,
	source: CellRect,
	target: CellRect,
): FillSeriesOffer {
	const rowIds = (rect: CellRect) =>
		document.rows.slice(rect.top, rect.bottom + 1).map((row): RowId => row.id);
	const columnIds = (rect: CellRect) =>
		document.columns
			.slice(rect.left, rect.right + 1)
			.map((column): ColumnId => column.id);

	return {
		sourceRowIds: rowIds(source),
		sourceColumnIds: columnIds(source),
		targetRowIds: rowIds(target),
		targetColumnIds: columnIds(target),
	};
}

// Identifiers back to a rectangle. Anything that would make the offer describe
// different cells than it was made from, a removed row or a reorder, fails here
// rather than being reconciled into something the user did not ask for.
function resolveRect(
	document: TableDocument,
	rowIds: readonly RowId[],
	columnIds: readonly ColumnId[],
): CellRect | null {
	const consecutive = (ids: readonly string[], order: readonly string[]) => {
		const head = ids[0];
		if (head === undefined) return null;
		const first = order.indexOf(head);
		if (first === -1) return null;
		const matches = ids.every((id, offset) => order[first + offset] === id);
		return matches ? { first, last: first + ids.length - 1 } : null;
	};

	const rows = consecutive(
		rowIds,
		document.rows.map((row) => row.id),
	);
	const columns = consecutive(
		columnIds,
		document.columns.map((column) => column.id),
	);
	if (!rows || !columns) return null;
	return {
		top: rows.first,
		bottom: rows.last,
		left: columns.first,
		right: columns.last,
	};
}

// The offer re-checked against the document as it stands now. Activation goes
// through here, so a stale offer refuses instead of writing into whatever
// happens to occupy those coordinates.
export function planOfferedSeries(
	document: TableDocument,
	offer: FillSeriesOffer,
): FillSeriesEligibility {
	const source = resolveRect(
		document,
		offer.sourceRowIds,
		offer.sourceColumnIds,
	);
	const target = resolveRect(
		document,
		offer.targetRowIds,
		offer.targetColumnIds,
	);
	if (!source || !target) return { ok: false, refusal: "stale" };
	return planFillSeries(document, source, target);
}

// All of the plan or none of it. A write whose row has gone is not skipped:
// the whole operation returns the document it was given, so the user never
// gets half a series.
export function applyFillSeries(
	document: TableDocument,
	plan: FillSeriesPlan,
): TableDocument {
	if (plan.writes.length === 0) return document;

	const byRow = new Map<RowId, FillSeriesWrite[]>();
	for (const write of plan.writes) {
		const existing = byRow.get(write.rowId);
		if (existing) existing.push(write);
		else byRow.set(write.rowId, [write]);
	}

	const columnIds = new Set(document.columns.map((column) => column.id));
	if (plan.writes.some((write) => !columnIds.has(write.columnId))) {
		return document;
	}

	let applied = 0;
	const rows = document.rows.map((row) => {
		const writes = byRow.get(row.id);
		if (!writes) return row;
		const cells = { ...row.cells };
		for (const write of writes) cells[write.columnId] = write.value;
		applied += writes.length;
		return { ...row, cells };
	});

	return applied === plan.writes.length ? { ...document, rows } : document;
}
