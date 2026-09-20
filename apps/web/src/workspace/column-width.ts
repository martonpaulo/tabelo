// Column widths are persisted workspace preferences keyed by stable column id.
// Pointer, keyboard, and Fit all pass through this arithmetic so they cannot
// disagree about bounds or stored rem precision.

export const DEFAULT_COLUMN_WIDTH = 10.5;
export const MIN_COLUMN_WIDTH = 4.5;
// One column may be deliberately wide, but Fit must not turn an exceptionally
// long opaque value into an effectively unbounded table. At the base root size
// this permits 1024px of content before horizontal scrolling takes over.
export const MAX_COLUMN_WIDTH = 64;
export const COLUMN_WIDTH_STEP = 1.5;
export const COLUMN_WIDTH_TOLERANCE = 1 / 32;

export function resolveColumnWidth(width: number | undefined): number {
	return width ?? DEFAULT_COLUMN_WIDTH;
}

export function clampColumnWidth(width: number): number {
	// Keep stored values stable at one sixteenth of a rem without turning screen
	// pixels into persisted layout units.
	return Math.min(
		MAX_COLUMN_WIDTH,
		Math.max(MIN_COLUMN_WIDTH, Math.round(width * 16) / 16),
	);
}

export function stepColumnWidth(
	width: number | undefined,
	direction: 1 | -1,
): number {
	return clampColumnWidth(
		resolveColumnWidth(width) + direction * COLUMN_WIDTH_STEP,
	);
}

export function fitColumnWidth(
	contentWidthPx: number,
	rootFontSizePx: number,
	paneZoom: number,
	decorationWidthPx: number,
): number | undefined {
	if (
		![contentWidthPx, rootFontSizePx, paneZoom, decorationWidthPx].every(
			Number.isFinite,
		) ||
		contentWidthPx < 0 ||
		rootFontSizePx <= 0 ||
		paneZoom <= 0 ||
		decorationWidthPx < 0
	)
		return undefined;

	// Text is pane content, so its DOM measurement already contains zoom. Cell
	// padding and the boundary are interface geometry and stay unscaled. Removing
	// zoom from only the text term gives the same stored rem width in every pane.
	return clampColumnWidth(
		contentWidthPx / (rootFontSizePx * paneZoom) +
			decorationWidthPx / rootFontSizePx,
	);
}

// Fit table to pane width (#404): scale every column by one factor so the
// widths add up to the room the pane has, keeping their proportions, then
// clamp and round the way every other width is stored.
//
// Clamping is what makes it more than a multiplication: a column pinned at a
// bound no longer scales, and the room it gave up or took belongs to the
// others. Because the factor is the same for all of them, the columns that
// reach the minimum are exactly the narrowest ones and those that reach the
// maximum are exactly the widest, so sorting once settles both ends in two
// linear passes instead of rescaling until it stops changing. Sorting the
// prefix sums costs O(n log n) and nothing after it loops twice.
//
// Rounding then uses largest remainder: each free column takes its floor at
// the stored precision, and the few sixteenths left over go to the columns
// that lost the most, so the total lands on the target exactly rather than
// drifting by a sixteenth per column.
const STORED_STEP = 1 / 16;

interface ScaledColumn {
	readonly index: number;
	readonly width: number;
}

// How many of the narrowest columns end up pinned at `bound`, given that the
// rest share what is left. Reads the sorted prefix sums once.
function pinnedCount(
	sorted: readonly ScaledColumn[],
	prefix: readonly number[],
	total: number,
	target: number,
	bound: number,
	atBound: (width: number, limit: number) => boolean,
): number {
	let pinned = 0;
	for (let i = 0; i < sorted.length; i += 1) {
		const remainingTarget = target - bound * i;
		const remainingTotal = total - (prefix[i] ?? 0);
		if (remainingTotal <= 0) return sorted.length;
		const width = (sorted[i]?.width ?? 0) * (remainingTarget / remainingTotal);
		if (!atBound(width, bound)) break;
		pinned = i + 1;
	}
	return pinned;
}

export function distributeColumnWidths(
	widths: readonly (number | undefined)[],
	availableRem: number,
): readonly number[] | undefined {
	const count = widths.length;
	if (count === 0 || !Number.isFinite(availableRem)) return undefined;
	const current = widths.map(resolveColumnWidth);
	const total = current.reduce((sum, width) => sum + width, 0);
	if (total <= 0) return undefined;

	// The pane can ask for less than the columns can legally be, or for more
	// than they may grow to. Either way the bounds win: a column narrower than
	// the minimum shows nothing.
	const target = Math.min(
		Math.max(availableRem, MIN_COLUMN_WIDTH * count),
		MAX_COLUMN_WIDTH * count,
	);

	const ascending = current
		.map((width, index) => ({ index, width }))
		.sort((left, right) => left.width - right.width);
	const prefix: number[] = [0];
	for (const column of ascending) {
		prefix.push((prefix.at(-1) ?? 0) + column.width);
	}

	const result = new Array<number>(count);
	const free: ScaledColumn[] = [];
	let freeTarget = target;
	let freeTotal = total;

	// Narrow columns first: any that would fall under the minimum sit at it.
	const atMin = pinnedCount(
		ascending,
		prefix,
		total,
		target,
		MIN_COLUMN_WIDTH,
		(width, limit) => width < limit,
	);
	for (let i = 0; i < atMin; i += 1) {
		const column = ascending[i];
		if (!column) continue;
		result[column.index] = MIN_COLUMN_WIDTH;
		freeTarget -= MIN_COLUMN_WIDTH;
		freeTotal -= column.width;
	}

	// Then the wide end, read from the other side of the same sorted list.
	const descending = ascending.slice(atMin).reverse();
	const descendingPrefix: number[] = [0];
	for (const column of descending) {
		descendingPrefix.push((descendingPrefix.at(-1) ?? 0) + column.width);
	}
	const atMax = pinnedCount(
		descending,
		descendingPrefix,
		freeTotal,
		freeTarget,
		MAX_COLUMN_WIDTH,
		(width, limit) => width > limit,
	);
	for (let i = 0; i < atMax; i += 1) {
		const column = descending[i];
		if (!column) continue;
		result[column.index] = MAX_COLUMN_WIDTH;
		freeTarget -= MAX_COLUMN_WIDTH;
		freeTotal -= column.width;
	}
	free.push(...descending.slice(atMax));

	if (free.length === 0 || freeTotal <= 0) {
		return result.map((width) => clampColumnWidth(width ?? MIN_COLUMN_WIDTH));
	}

	// Largest remainder over the free columns, at the stored precision.
	const factor = freeTarget / freeTotal;
	const exact = free.map((column) => column.width * factor);
	const floors = exact.map(
		(width) => Math.floor(width / STORED_STEP) * STORED_STEP,
	);
	const steps = Math.round(
		(freeTarget - floors.reduce((sum, width) => sum + width, 0)) / STORED_STEP,
	);
	const order = exact
		.map((width, position) => ({
			position,
			remainder: width - (floors[position] ?? 0),
		}))
		.sort((left, right) => right.remainder - left.remainder);
	for (let i = 0; i < steps && i < order.length; i += 1) {
		const entry = order[i];
		if (!entry) continue;
		floors[entry.position] = (floors[entry.position] ?? 0) + STORED_STEP;
	}
	free.forEach((column, position) => {
		result[column.index] = clampColumnWidth(floors[position] ?? column.width);
	});

	return result.map((width) => clampColumnWidth(width ?? MIN_COLUMN_WIDTH));
}

export function isSameColumnWidth(
	left: number | undefined,
	right: number,
): boolean {
	return Math.abs(resolveColumnWidth(left) - right) <= COLUMN_WIDTH_TOLERANCE;
}

export function atMinimumColumnWidth(width: number | undefined): boolean {
	return resolveColumnWidth(width) <= MIN_COLUMN_WIDTH + COLUMN_WIDTH_TOLERANCE;
}

export function atMaximumColumnWidth(width: number | undefined): boolean {
	return resolveColumnWidth(width) >= MAX_COLUMN_WIDTH - COLUMN_WIDTH_TOLERANCE;
}

export type ColumnWidthEntry =
	| { readonly ok: true; readonly width: number }
	| {
			readonly ok: false;
			readonly reason: "not-a-number" | "too-small" | "too-large";
	  };

// A width typed as a number (#370). It is refused rather than clamped when it
// falls outside the bounds, because the user asked for that exact number and
// quietly getting another one is the surprise the dialog exists to avoid. An
// accepted value keeps the stored precision every other path uses.
export function parseColumnWidth(text: string): ColumnWidthEntry {
	const match = /^(\d+(?:\.\d+)?|\.\d+)\s*(?:rem)?$/i.exec(text.trim());
	const value = match?.[1] === undefined ? Number.NaN : Number(match[1]);
	if (!Number.isFinite(value)) return { ok: false, reason: "not-a-number" };
	if (value < MIN_COLUMN_WIDTH - COLUMN_WIDTH_TOLERANCE)
		return { ok: false, reason: "too-small" };
	if (value > MAX_COLUMN_WIDTH + COLUMN_WIDTH_TOLERANCE)
		return { ok: false, reason: "too-large" };
	return { ok: true, width: clampColumnWidth(value) };
}
