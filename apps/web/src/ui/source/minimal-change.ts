export interface TextChange {
	readonly from: number;
	readonly to: number;
	readonly insert: string;
}

// Replaces only what actually changed, so an external update does not blow the
// cursor to the end of the document. Shared prefix and suffix are preserved.
//
// A view change now reuses the same editor, so this also has to describe the
// step from one format's text to another's. Two unrelated formats share almost
// nothing, which produces a large but still well-formed change: the caret maps
// through it the same way it maps through a small one.
export function minimalChange(
	current: string,
	next: string,
): TextChange | null {
	if (current === next) return null;

	let start = 0;
	const max = Math.min(current.length, next.length);
	while (start < max && current[start] === next[start]) start += 1;

	let endCurrent = current.length;
	let endNext = next.length;
	while (
		endCurrent > start &&
		endNext > start &&
		current[endCurrent - 1] === next[endNext - 1]
	) {
		endCurrent -= 1;
		endNext -= 1;
	}

	return { from: start, to: endCurrent, insert: next.slice(start, endNext) };
}
