import { StateEffect } from "@codemirror/state";
import type { SourceRowRange } from "@/formats/types";

// Where each semantic table row sits in the source text, from the format's own
// parse (#296). Nothing draws it any more (owner, 2026-09-19: source views are
// code and carry no row lines); the pinned header (#252) reads it to find the
// header row.

export interface SourceRows {
	readonly rows: readonly SourceRowRange[];
	// The length of the text the rows were parsed from. Offsets into another
	// text would point at the wrong lines, so a reader must check it.
	readonly length: number;
}

export const setSourceRows = StateEffect.define<SourceRows>();
