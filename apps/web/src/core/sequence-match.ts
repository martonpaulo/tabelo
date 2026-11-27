// Which earlier element each element of a new sequence continues (#546).
//
// Source reconciliation has two versions of one table: the document before an
// edit and the parse of the text after it. When text inserts or deletes a row
// or a column, position no longer says which old element a new one is, and
// pairing by index hands one row's id, types and alignment to its neighbour.
// This matcher pairs them by content instead: the longest common subsequence of
// their keys, after trimming the common prefix and suffix that an ordinary
// edit leaves.
//
// `levels` are progressively weaker keys for the same elements (for a column:
// its whole content, then its header alone). Each level matches what it can,
// and the gaps between its matches go to the next level. Past the last level, a
// gap whose two sides have the same length is paired by position, because that
// is an edit in place: a renamed header or a retyped row. A gap of unequal
// length stays unpaired, so its new elements are new rather than borrowed from
// a neighbour.

// A pair of key lists, the earlier sequence's then the new one's, for one level.
export type MatchLevel = readonly [
	current: readonly string[],
	next: readonly string[],
];

// shortcut: past this many cells the quadratic subsequence table is skipped and
// that gap falls through to the next level, which is enough at the 200-row
// target. Upgrade to a linear-space diff (Myers) if larger edits must keep ids.
const MAX_SUBSEQUENCE_CELLS = 250_000;

// For each index of the new sequence, the index of the earlier element it
// continues, or -1 for an element that is new.
export function matchSequences(levels: readonly MatchLevel[]): Int32Array {
	const first = levels[0];
	if (!first) throw new Error("matchSequences needs at least one level");
	const [current, next] = first;
	const matches = new Int32Array(next.length).fill(-1);
	matchRange(levels, 0, 0, current.length, 0, next.length, matches);
	return matches;
}

function matchRange(
	levels: readonly MatchLevel[],
	level: number,
	currentStart: number,
	currentEnd: number,
	nextStart: number,
	nextEnd: number,
	matches: Int32Array,
): void {
	if (currentStart >= currentEnd || nextStart >= nextEnd) return;
	const keys = levels[level];
	if (!keys) {
		if (currentEnd - currentStart !== nextEnd - nextStart) return;
		for (let offset = 0; nextStart + offset < nextEnd; offset += 1) {
			matches[nextStart + offset] = currentStart + offset;
		}
		return;
	}
	const [current, next] = keys;

	let start = 0;
	while (
		currentStart + start < currentEnd &&
		nextStart + start < nextEnd &&
		current[currentStart + start] === next[nextStart + start]
	) {
		matches[nextStart + start] = currentStart + start;
		start += 1;
	}
	let end = 0;
	while (
		currentEnd - end > currentStart + start &&
		nextEnd - end > nextStart + start &&
		current[currentEnd - end - 1] === next[nextEnd - end - 1]
	) {
		matches[nextEnd - end - 1] = currentEnd - end - 1;
		end += 1;
	}

	const anchors = commonSubsequence(
		current,
		currentStart + start,
		currentEnd - end,
		next,
		nextStart + start,
		nextEnd - end,
	);
	let gapCurrent = currentStart + start;
	let gapNext = nextStart + start;
	for (const [currentIndex, nextIndex] of anchors) {
		matches[nextIndex] = currentIndex;
		matchRange(
			levels,
			level + 1,
			gapCurrent,
			currentIndex,
			gapNext,
			nextIndex,
			matches,
		);
		gapCurrent = currentIndex + 1;
		gapNext = nextIndex + 1;
	}
	matchRange(
		levels,
		level + 1,
		gapCurrent,
		currentEnd - end,
		gapNext,
		nextEnd - end,
		matches,
	);
}

// The matched index pairs of a longest common subsequence of two ranges, in
// order, or none when the ranges are too large for the table.
function commonSubsequence(
	current: readonly string[],
	currentStart: number,
	currentEnd: number,
	next: readonly string[],
	nextStart: number,
	nextEnd: number,
): Array<readonly [number, number]> {
	const rows = currentEnd - currentStart;
	const columns = nextEnd - nextStart;
	if (rows === 0 || columns === 0) return [];
	if (rows * columns > MAX_SUBSEQUENCE_CELLS) return [];

	// lengths[i][j]: the subsequence length of the suffixes starting at i and j.
	const width = columns + 1;
	const lengths = new Uint32Array((rows + 1) * width);
	for (let i = rows - 1; i >= 0; i -= 1) {
		for (let j = columns - 1; j >= 0; j -= 1) {
			lengths[i * width + j] =
				current[currentStart + i] === next[nextStart + j]
					? (lengths[(i + 1) * width + j + 1] ?? 0) + 1
					: Math.max(
							lengths[(i + 1) * width + j] ?? 0,
							lengths[i * width + j + 1] ?? 0,
						);
		}
	}

	const pairs: Array<readonly [number, number]> = [];
	let i = 0;
	let j = 0;
	while (i < rows && j < columns) {
		if (current[currentStart + i] === next[nextStart + j]) {
			pairs.push([currentStart + i, nextStart + j]);
			i += 1;
			j += 1;
		} else if (
			(lengths[(i + 1) * width + j] ?? 0) >= (lengths[i * width + j + 1] ?? 0)
		) {
			i += 1;
		} else {
			j += 1;
		}
	}
	return pairs;
}
