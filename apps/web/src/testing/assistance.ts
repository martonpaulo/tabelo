import type { SourceEdit } from "@/formats/types";

// Applies a structural-assistance result to the draft it was written against,
// the way the source editor lands it: every edit refers to that draft, and
// none overlaps another.
export function applyEdits(
	text: string,
	edits: readonly SourceEdit[] | null,
): string {
	if (!edits) return text;
	return [...edits]
		.sort((a, b) => b.from - a.from)
		.reduce(
			(out, edit) => out.slice(0, edit.from) + edit.insert + out.slice(edit.to),
			text,
		);
}
