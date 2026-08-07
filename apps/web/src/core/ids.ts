import type { ColumnId, RowId } from "./types";

// Application-owned identifiers. They keep selection, column widths, and the
// structural diff attached to the right row or column across reordering,
// re-parsing, and format switching. They are document-local, never persisted
// across documents, never addressable, and never compared against anything
// from outside the tab, so unpredictability is not a requirement here.
//
// What is required is uniqueness within a document and no reuse after
// deletion, across a reload as well as within a session. A counter alone
// would satisfy that only within one session: restarting at zero on reload
// can mint an id a hydrated document already uses. The token below is what
// carries the no-reuse guarantee across a reload; the counter alone would
// not.
//
// Identifiers now sort in creation order. That is an artifact of the
// counter, not a contract, and nothing may start relying on it.
const session = Math.floor(Math.random() * 36 ** 6)
	.toString(36)
	.padStart(6, "0");
let sequence = 0;

function createId(prefix: string): string {
	sequence += 1;
	return `${prefix}_${session}${sequence.toString(36)}`;
}

export const createColumnId = (): ColumnId => createId("c");
export const createRowId = (): RowId => createId("r");
